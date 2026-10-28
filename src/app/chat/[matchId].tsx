import { Stack, useLocalSearchParams } from 'expo-router';
import { SendHorizontal } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getMatch, getMessages, sendMessage } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import type { MatchWithDetails, Message } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';

type ChatMessage = Message & { status?: 'sending' | 'failed' };

export default function ChatScreen() {
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const { profile } = useAuth();
  const [match, setMatch] = useState<MatchWithDetails | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const listRef = useRef<FlatList<ChatMessage>>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getMatch(matchId), getMessages(matchId)])
      .then(([m, msgs]) => {
        if (cancelled) return;
        setMatch(m);
        setMessages(msgs);
      })
      .catch((e) => console.warn('Failed to load chat', e))
      .finally(() => !cancelled && setLoading(false));

    // Realtime: append messages from the other participant (RLS applies to
    // postgres_changes, so we only receive rows we're allowed to read).
    const channel = supabase
      .channel(`messages:${matchId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `match_id=eq.${matchId}` },
        (payload) => {
          const msg = payload.new as Message;
          setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [matchId]);

  const send = async () => {
    const content = draft.trim();
    if (!content || !profile) return;
    setDraft('');

    // Optimistic bubble, replaced by the server row on success.
    const tempId = `temp-${Date.now()}`;
    const optimistic: ChatMessage = {
      id: tempId,
      match_id: matchId,
      sender_id: profile.id,
      content,
      created_at: new Date().toISOString(),
      status: 'sending',
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const saved = await sendMessage(matchId, profile.id, content);
      setMessages((prev) => {
        // Realtime may have delivered the saved row already.
        const withoutTemp = prev.filter((m) => m.id !== tempId);
        return withoutTemp.some((m) => m.id === saved.id) ? withoutTemp : [...withoutTemp, saved];
      });
    } catch {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' } : m)));
    }
  };

  const isRecruiter = profile?.role === 'recruiter';
  const title = match
    ? isRecruiter
      ? match.candidate.full_name ?? 'Candidate'
      : match.job.company_name
    : '';

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['bottom']}>
      <Stack.Screen options={{ title }} />
      {match ? (
        <View className="border-b border-gray-100 bg-white px-4 py-2">
          <Text className="text-center text-xs text-gray-500">Matched on · {match.job.title}</Text>
        </View>
      ) : null}

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {loading ? (
          <ActivityIndicator className="mt-10" color="#6C47FF" />
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            contentContainerClassName="p-4 flex-grow"
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            ListEmptyComponent={
              <Text className="mt-10 text-center text-gray-400">Say hi 👋</Text>
            }
            renderItem={({ item }) => <Bubble message={item} mine={item.sender_id === profile?.id} />}
          />
        )}

        <View className="flex-row items-end border-t border-gray-100 bg-white px-3 py-2">
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Message"
            placeholderTextColor="#9CA3AF"
            multiline
            maxLength={4000}
            className="max-h-32 min-h-11 flex-1 rounded-3xl bg-gray-100 px-4 py-2.5 text-base"
          />
          <Pressable
            onPress={send}
            disabled={!draft.trim()}
            accessibilityLabel="Send message"
            className={`ml-2 h-11 w-11 items-center justify-center rounded-full ${
              draft.trim() ? 'bg-brand' : 'bg-gray-200'
            }`}
          >
            <SendHorizontal size={20} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Bubble({ message, mine }: { message: ChatMessage; mine: boolean }) {
  return (
    <View className={`mb-2 max-w-[80%] ${mine ? 'self-end' : 'self-start'}`}>
      <View
        className={`rounded-2xl px-4 py-2.5 ${
          mine ? 'rounded-br-md bg-brand' : 'rounded-bl-md bg-white'
        } ${message.status === 'sending' ? 'opacity-60' : ''}`}
      >
        <Text className={`text-base ${mine ? 'text-white' : 'text-gray-900'}`}>{message.content}</Text>
      </View>
      {message.status === 'failed' ? (
        <Text className="mt-1 text-right text-xs text-red-500">Failed to send</Text>
      ) : null}
    </View>
  );
}
