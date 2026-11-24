import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { colors, palette, radius, spacing, type ThemeMode } from '@/lib/theme';

export function usePalette() {
  // Le mode est déterminé par l'appelant (thème système par défaut).
  return (mode: ThemeMode) => palette(mode);
}

export function Card({ children, mode = 'light', style }: { children: React.ReactNode; mode?: ThemeMode; style?: StyleProp<ViewStyle> }) {
  const p = palette(mode);
  return <View style={[styles.card, { backgroundColor: p.surface, borderColor: p.border }, style]}>{children}</View>;
}

export function Title({ children, mode = 'light', size = 20 }: { children: React.ReactNode; mode?: ThemeMode; size?: number }) {
  const p = palette(mode);
  return <Text style={[styles.title, { color: p.text, fontSize: size }]}>{children}</Text>;
}

export function Body({ children, mode = 'light', muted = false, style }: { children: React.ReactNode; mode?: ThemeMode; muted?: boolean; style?: StyleProp<TextStyle> }) {
  const p = palette(mode);
  return <Text style={[{ color: muted ? p.textMuted : p.text, fontSize: 14, lineHeight: 21 }, style]}>{children}</Text>;
}

export function Button({
  label,
  onPress,
  disabled,
  variant = 'primary',
  mode = 'light',
  loading,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  mode?: ThemeMode;
  loading?: boolean;
}) {
  const p = palette(mode);
  const background =
    variant === 'primary' ? colors.memo600 : variant === 'danger' ? colors.danger : 'transparent';
  const textColor = variant === 'secondary' ? p.text : '#ffffff';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) || Boolean(loading), busy: Boolean(loading) }}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: background,
          borderColor: variant === 'secondary' ? p.border : background,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
      ]}
    >
      {loading ? <ActivityIndicator color={textColor} /> : <Text style={{ color: textColor, fontWeight: '700', fontSize: 15 }}>{label}</Text>}
    </Pressable>
  );
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  mode = 'light',
  autoCapitalize = 'none',
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address' | 'numeric';
  mode?: ThemeMode;
  autoCapitalize?: 'none' | 'sentences';
}) {
  const p = palette(mode);
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={{ color: p.text, fontWeight: '600', marginBottom: 6, fontSize: 13 }}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={p.textMuted}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        style={{
          borderWidth: 1,
          borderColor: p.border,
          backgroundColor: p.surface,
          color: p.text,
          borderRadius: radius.md,
          paddingHorizontal: 14,
          paddingVertical: 12,
          fontSize: 15,
        }}
      />
    </View>
  );
}

export function Badge({ label, tone = 'neutral', mode = 'light' }: { label: string; tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'brand'; mode?: ThemeMode }) {
  const tones: Record<string, { bg: string; fg: string }> = {
    neutral: { bg: mode === 'dark' ? '#24314d' : '#eef1f7', fg: mode === 'dark' ? '#d6def0' : '#41506b' },
    success: { bg: mode === 'dark' ? 'rgba(16,185,129,0.18)' : '#dcfce7', fg: mode === 'dark' ? '#6ee7b7' : '#047857' },
    warning: { bg: mode === 'dark' ? 'rgba(245,158,11,0.18)' : '#fef3c7', fg: mode === 'dark' ? '#fcd34d' : '#b45309' },
    danger: { bg: mode === 'dark' ? 'rgba(239,68,68,0.18)' : '#fee2e2', fg: mode === 'dark' ? '#fca5a5' : '#b91c1c' },
    brand: { bg: mode === 'dark' ? 'rgba(55,99,246,0.2)' : '#e0eaff', fg: mode === 'dark' ? '#a5c0ff' : '#1c35d4' },
  };
  const tone_ = tones[tone] ?? tones.neutral!;
  return (
    <View style={{ backgroundColor: tone_.bg, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' }}>
      <Text style={{ color: tone_.fg, fontSize: 11, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

export function EmptyState({ title, description, mode = 'light' }: { title: string; description: string; mode?: ThemeMode }) {
  const p = palette(mode);
  return (
    <View style={{ alignItems: 'center', padding: spacing.xl, borderWidth: 1, borderStyle: 'dashed', borderColor: p.border, borderRadius: radius.lg }}>
      <Text style={{ color: p.text, fontWeight: '700', marginBottom: 4 }}>{title}</Text>
      <Text style={{ color: p.textMuted, fontSize: 13, textAlign: 'center' }}>{description}</Text>
    </View>
  );
}

export function Progress({ value, mode = 'light' }: { value: number; mode?: ThemeMode }) {
  const p = palette(mode);
  const safe = Math.max(0, Math.min(100, value));
  return (
    <View style={{ height: 6, borderRadius: 3, backgroundColor: mode === 'dark' ? '#24314d' : '#e2e8f0', overflow: 'hidden' }}>
      <View style={{ width: `${safe}%`, height: '100%', backgroundColor: colors.memo500 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, marginBottom: spacing.md },
  title: { fontWeight: '800', letterSpacing: -0.3, marginBottom: 4 },
  button: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingVertical: 13,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
  },
});
