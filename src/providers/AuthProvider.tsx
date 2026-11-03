import type { Session } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { getProfile } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  /** Set when the signed-in user's profile failed to load (e.g. offline). */
  profileError: string | null;
  /** True until the initial session (and profile, if signed in) has loaded. */
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  // Only the newest request may write state, so a slow response for a previous
  // user (or a superseded reload) can't overwrite the current profile.
  const latestRequest = useRef(0);

  const loadProfile = useCallback(async (userId: string | undefined) => {
    const request = ++latestRequest.current;
    setProfileError(null);
    if (!userId) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }
    setProfileLoading(true);
    // Keep the current profile during a reload of the same user; drop someone else's.
    setProfile((prev) => (prev?.id === userId ? prev : null));
    try {
      const next = await getProfile(userId);
      if (request === latestRequest.current) setProfile(next);
    } catch (e) {
      console.warn('Failed to load profile', e);
      if (request === latestRequest.current) setProfileError((e as Error).message);
    } finally {
      if (request === latestRequest.current) setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await loadProfile(data.session?.user.id);
      setInitializing(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      // Token refreshes don't change the user; skip the extra round trip.
      if (event !== 'TOKEN_REFRESHED') {
        // Synchronously, in the same batch as setSession: drop a different
        // user's profile and invalidate their in-flight request, so the new
        // session never renders with the previous user's data.
        latestRequest.current++;
        const nextId = next?.user.id;
        setProfile((prev) => (prev && prev.id === nextId ? prev : null));
        if (next) setProfileLoading(true); // batched with setSession: no flash
        // Defer: calling Supabase inside this callback can deadlock the auth lock.
        setTimeout(() => loadProfile(next?.user.id), 0);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  const value: AuthContextValue = {
    session,
    profile,
    profileError,
    loading: initializing || (!!session && !profile && profileLoading),
    refreshProfile: () => loadProfile(session?.user.id),
    signOut: async () => {
      await supabase.auth.signOut();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
