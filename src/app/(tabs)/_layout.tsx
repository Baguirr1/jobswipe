import { Tabs } from 'expo-router';
import { Bookmark, BriefcaseBusiness, ChartColumn, Layers, MessageCircle, User } from 'lucide-react-native';

import { C } from '@/lib/theme';
import { useAuth } from '@/providers/AuthProvider';

export default function TabsLayout() {
  const { profile } = useAuth();
  const isRecruiter = profile?.role === 'recruiter';

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: C.accent,
        tabBarInactiveTintColor: C.ink3,
        tabBarStyle: { backgroundColor: C.surface, borderTopColor: C.line },
        tabBarLabelStyle: { fontWeight: '600' },
        headerStyle: { backgroundColor: C.canvas },
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: '800', color: C.ink },
        sceneStyle: { backgroundColor: C.canvas },
      }}
    >
      <Tabs.Protected guard={!isRecruiter}>
        <Tabs.Screen
          name="index"
          options={{
            title: 'Discover',
            headerShown: false,
            tabBarIcon: ({ color, size }) => <Layers color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="market"
          options={{
            title: 'Insights',
            headerShown: false,
            tabBarIcon: ({ color, size }) => <ChartColumn color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="saved"
          options={{
            title: 'Saved',
            tabBarIcon: ({ color, size }) => <Bookmark color={color} size={size} />,
          }}
        />
      </Tabs.Protected>

      <Tabs.Protected guard={isRecruiter}>
        <Tabs.Screen
          name="jobs"
          options={{
            title: 'My Jobs',
            tabBarIcon: ({ color, size }) => <BriefcaseBusiness color={color} size={size} />,
          }}
        />
      </Tabs.Protected>

      <Tabs.Screen
        name="matches"
        options={{
          title: 'Matches',
          tabBarIcon: ({ color, size }) => <MessageCircle color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <User color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
