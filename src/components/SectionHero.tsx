import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { SwipeBackground } from '@/components/SwipeBackground';

export function SectionHero({ eyebrow, title, subtitle, children }: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children?: ReactNode;
}) {
  return (
    <View className="mb-5 overflow-hidden rounded-3xl bg-brand-light p-6">
      <View pointerEvents="none" className="absolute inset-0 opacity-40">
        <SwipeBackground />
      </View>
      <Text className="mb-2 text-xs font-bold uppercase tracking-widest text-brand-dark">{eyebrow}</Text>
      <Text accessibilityRole="header" className="text-2xl font-extrabold tracking-tight text-gray-900">{title}</Text>
      <Text className="mt-2 text-sm leading-5 text-gray-700">{subtitle}</Text>
      {children}
    </View>
  );
}
