import { Briefcase } from 'lucide-react-native';
import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Button } from '@/components/ui';

export function EmptyFeed({
  title = 'No more jobs right now!',
  subtitle = 'Check back later.',
  onRefresh,
}: {
  title?: string;
  subtitle?: string;
  onRefresh?: () => void;
}) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.out(Easing.ease) }), -1);
  }, [pulse]);

  const ringStyle = useAnimatedStyle(() => ({
    opacity: 0.5 * (1 - pulse.value),
    transform: [{ scale: 1 + pulse.value * 0.9 }],
  }));

  return (
    <View className="flex-1 items-center justify-center px-8">
      <View className="h-40 w-40 items-center justify-center">
        <Animated.View
          style={ringStyle}
          className="absolute h-28 w-28 rounded-full bg-brand"
        />
        <View className="h-28 w-28 items-center justify-center rounded-full bg-brand">
          <Briefcase size={44} color="#fff" />
        </View>
      </View>
      <Text className="mt-6 text-center text-2xl font-bold text-gray-900">{title}</Text>
      <Text className="mt-2 text-center text-base text-gray-500">{subtitle}</Text>
      {onRefresh ? (
        <Button title="Refresh" variant="secondary" onPress={onRefresh} className="mt-8 w-48" />
      ) : null}
    </View>
  );
}
