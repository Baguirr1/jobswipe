import { ActivityIndicator, Image, Pressable, Text, TextInput, View, type TextInputProps } from 'react-native';

import { initials } from '@/lib/format';

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  className = '',
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const base = 'h-14 rounded-2xl items-center justify-center px-6';
  const styles = {
    primary: 'bg-brand active:bg-brand-dark',
    secondary: 'bg-brand-light active:opacity-80',
    ghost: 'bg-transparent active:opacity-60',
  }[variant];
  const text = variant === 'primary' ? 'text-white' : 'text-brand';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      className={`${base} ${styles} ${disabled ? 'opacity-50' : ''} ${className}`}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? '#fff' : '#6C47FF'} />
      ) : (
        <Text className={`text-base font-semibold ${text}`}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Field({ label, ...props }: TextInputProps & { label?: string }) {
  return (
    <View className="mb-4">
      {label ? <Text className="mb-1.5 text-sm font-medium text-gray-700">{label}</Text> : null}
      <TextInput
        placeholderTextColor="#9CA3AF"
        className={`rounded-xl border border-gray-200 bg-white px-4 text-base text-gray-900 ${
          props.multiline ? 'min-h-32 py-3' : 'h-12'
        }`}
        textAlignVertical={props.multiline ? 'top' : 'center'}
        {...props}
      />
    </View>
  );
}

export function Avatar({
  uri,
  name,
  size = 48,
}: {
  uri?: string | null;
  name?: string | null;
  size?: number;
}) {
  const style = { width: size, height: size, borderRadius: size / 2 };
  if (uri) return <Image source={{ uri }} style={style} accessibilityIgnoresInvertColors />;
  return (
    <View style={style} className="items-center justify-center bg-brand-light">
      <Text style={{ fontSize: size * 0.38 }} className="font-bold text-brand">
        {initials(name)}
      </Text>
    </View>
  );
}

export function CompanyLogo({ uri, name, size = 56 }: { uri?: string | null; name: string; size?: number }) {
  const style = { width: size, height: size, borderRadius: 14 };
  if (uri) return <Image source={{ uri }} style={style} resizeMode="cover" />;
  return (
    <View style={style} className="items-center justify-center bg-gray-900">
      <Text style={{ fontSize: size * 0.4 }} className="font-bold text-white">
        {name.charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

export function Tag({ label, highlighted }: { label: string; highlighted?: boolean }) {
  return (
    <View
      className={`mb-2 mr-2 rounded-full px-3 py-1.5 ${highlighted ? 'bg-brand-light' : 'bg-gray-100'}`}
    >
      <Text className={`text-xs font-medium ${highlighted ? 'text-brand' : 'text-gray-700'}`}>
        {label}
      </Text>
    </View>
  );
}

export function MatchBadge({ score }: { score: number | null }) {
  if (score == null) return null;
  const tone = score >= 80 ? 'bg-green-500' : score >= 60 ? 'bg-amber-500' : 'bg-gray-500';
  return (
    <View className={`rounded-full px-3 py-1 ${tone}`}>
      <Text className="text-xs font-bold text-white">{Math.round(score)}% Match</Text>
    </View>
  );
}

export function Screen({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <View className={`flex-1 bg-gray-50 ${className}`}>{children}</View>;
}
