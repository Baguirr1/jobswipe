import { Heart } from 'lucide-react-native';
import { Modal, Pressable, Text, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';

import { Button } from '@/components/ui';
import { useTheme } from '@/providers/ThemeProvider';

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
  const { palette: C, scheme } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* Styles set directly: classes don't reach Reanimated views on every platform.
          Deep teal in both themes, so the white text always reads. */}
      <Animated.View
        entering={FadeIn}
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 32,
          backgroundColor: scheme === 'light' ? 'rgba(11,110,102,0.97)' : 'rgba(10,52,48,0.98)',
        }}
      >
        <Animated.View entering={ZoomIn.springify().damping(12)} style={{ alignItems: 'center' }}>
          <View className="h-28 w-28 items-center justify-center rounded-full bg-surface">
            <Heart size={56} color={C.accent} fill={C.accent} />
          </View>
          <Text className="mt-8 text-5xl font-black italic text-white">It’s a Match!</Text>
          <Text className="mt-3 text-center text-lg text-white/90">{title}</Text>
          <Text className="mt-1 text-center text-base text-white/70">{subtitle}</Text>
        </Animated.View>
        <View className="mt-12 w-full" style={{ maxWidth: 420 }}>
          <Button title="Send a message" onPress={onChat} className="bg-surface" variant="secondary" />
          <Pressable onPress={onClose} accessibilityRole="button" className="mt-2 h-14 items-center justify-center">
            <Text className="text-base font-semibold text-white">Keep swiping</Text>
          </Pressable>
        </View>
      </Animated.View>
    </Modal>
  );
}
