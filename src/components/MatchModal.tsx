import { Heart } from 'lucide-react-native';
import { Modal, Pressable, Text, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';

import { Button } from '@/components/ui';

export function MatchModal({
  visible,
  title,
  subtitle,
  onChat,
  onClose,
}: {
  visible: boolean;
  title: string;
  subtitle: string;
  onChat: () => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Animated.View
        entering={FadeIn}
        className="flex-1 items-center justify-center bg-brand/95 px-8"
      >
        <Animated.View entering={ZoomIn.springify().damping(12)} className="items-center">
          <View className="h-28 w-28 items-center justify-center rounded-full bg-white">
            <Heart size={56} color="#6C47FF" fill="#6C47FF" />
          </View>
          <Text className="mt-8 text-5xl font-black italic text-white">It’s a Match!</Text>
          <Text className="mt-3 text-center text-lg text-white/90">{title}</Text>
          <Text className="mt-1 text-center text-base text-white/70">{subtitle}</Text>
        </Animated.View>
        <View className="mt-12 w-full">
          <Button title="Send a message" onPress={onChat} className="bg-white" variant="secondary" />
          <Pressable onPress={onClose} accessibilityRole="button" className="mt-2 h-14 items-center justify-center">
            <Text className="text-base font-semibold text-white">Keep swiping</Text>
          </Pressable>
        </View>
      </Animated.View>
    </Modal>
  );
}
