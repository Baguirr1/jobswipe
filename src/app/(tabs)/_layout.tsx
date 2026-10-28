import { Tabs } from 'expo-router';
import { BriefcaseBusiness, Flame, MessageCircle, User } from 'lucide-react-native';

import { useAuth } from '@/providers/AuthProvider';

export default function TabsLayout() {
  const { profile } = useAuth();
  const isRecruiter = profile?.role === 'recruiter';

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#6C47FF',
        tabBarInactiveTintColor: '#9CA3AF',
        headerTitleStyle: { fontWeight: '800' },
      }}
    >
      <Tabs.Protected guard={!isRecruiter}>
        <Tabs.Screen
          name="index"
          options={{
            title: 'Discover',
            headerShown: false,
            tabBarIcon: ({ color, size }) => <Flame color={color} size={size} />,
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
