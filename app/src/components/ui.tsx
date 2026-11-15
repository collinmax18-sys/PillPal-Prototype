// Small, consistent component set (NFR1/NFR5: consistency, labels, large touch targets).
import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle, type StyleProp } from 'react-native';
import { colors, font, radius, space, statusStyle, TOUCH } from '../theme';
import type { DoseStatus } from '../core/types';

export function Screen({ children, scroll = true, contentStyle }: { children: React.ReactNode; scroll?: boolean; contentStyle?: StyleProp<ViewStyle> }) {
  if (!scroll) return <View style={[styles.screen, styles.screenPad, contentStyle]}>{children}</View>;
  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.screenPad, { paddingBottom: 48 }, contentStyle]} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

export function Card({ children, style, onPress, accessibilityLabel }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; accessibilityLabel?: string }) {
  if (onPress)
    return (
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }, style]}>
        {children}
      </Pressable>
    );
  return <View style={[styles.card, style]}>{children}</View>;
}

export function H1({ children }: { children: React.ReactNode }) {
  return <Text style={styles.h1} accessibilityRole="header">{children}</Text>;
}
export function H2({ children, style }: { children: React.ReactNode; style?: any }) {
  return <Text style={[styles.h2, style]} accessibilityRole="header">{children}</Text>;
}
export function P({ children, muted, small, style, selectable }: { children: React.ReactNode; muted?: boolean; small?: boolean; style?: any; selectable?: boolean }) {
  return <Text selectable={selectable} style={[styles.p, muted && { color: colors.textMuted }, small && { fontSize: font.small }, style]}>{children}</Text>;
}

type BtnKind = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
export function Button({ title, onPress, kind = 'primary', disabled, loading, small, accessibilityLabel, style }: { title: string; onPress: () => void; kind?: BtnKind; disabled?: boolean; loading?: boolean; small?: boolean; accessibilityLabel?: string; style?: any }) {
  const palette: Record<BtnKind, { bg: string; fg: string; border: string }> = {
    primary: { bg: colors.primary, fg: colors.primaryText, border: colors.primary },
    secondary: { bg: colors.card, fg: colors.primary, border: colors.primary },
    ghost: { bg: 'transparent', fg: colors.primary, border: 'transparent' },
    danger: { bg: colors.card, fg: colors.missed, border: colors.missed },
    success: { bg: colors.taken, fg: '#fff', border: colors.taken },
  };
  const p = palette[kind];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      style={({ pressed }) => [
        styles.btn,
        small && styles.btnSmall,
        { backgroundColor: p.bg, borderColor: p.border, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={p.fg} /> : <Text style={[styles.btnText, small && { fontSize: font.small }, { color: p.fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, color = colors.primary, soft = colors.primarySoft, accessibilityLabel }: { label: string; selected?: boolean; onPress?: () => void; color?: string; soft?: string; accessibilityLabel?: string }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'checkbox' : 'text'}
      accessibilityState={onPress ? { checked: !!selected } : undefined}
      accessibilityLabel={accessibilityLabel ?? label}
      style={[styles.chip, { borderColor: selected ? color : colors.border, backgroundColor: selected ? soft : colors.card }]}
    >
      <Text style={[styles.chipText, { color: selected ? color : colors.text }]}>{selected ? '✓ ' : ''}{label}</Text>
    </Pressable>
  );
}

export function Row({ children, style, wrap }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; wrap?: boolean }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: space.sm }, wrap && { flexWrap: 'wrap' }, style]}>{children}</View>;
}

export function StatusBadge({ status }: { status: DoseStatus }) {
  const s = statusStyle[status];
  return (
    <View style={[styles.badge, { backgroundColor: s.bg }]} accessibilityLabel={`Status: ${s.label}`}>
      <Text style={[styles.badgeText, { color: s.fg }]}>{s.icon} {s.label}</Text>
    </View>
  );
}

export function Field({ label, hint, error, ...props }: TextInputProps & { label: string; hint?: string; error?: string }) {
  return (
    <View style={{ marginBottom: space.md }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.textMuted}
        {...props}
        style={[styles.input, props.multiline && { minHeight: 96, textAlignVertical: 'top' }, error && { borderColor: colors.missed }, props.style]}
      />
      {hint && !error ? <Text style={styles.hint}>{hint}</Text> : null}
      {error ? <Text style={[styles.hint, { color: colors.missed }]}>{error}</Text> : null}
    </View>
  );
}

export function Segmented<T extends string | number>({ options, value, onChange, label }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.segment}>
      {options.map((o) => {
        const sel = o.value === value;
        return (
          <Pressable key={String(o.value)} onPress={() => onChange(o.value)} accessibilityRole="radio" accessibilityState={{ selected: sel }} accessibilityLabel={o.label} style={[styles.segItem, sel && { backgroundColor: colors.primary }]}>
            <Text style={[styles.segText, sel && { color: '#fff' }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ProgressBar({ value, color = colors.taken }: { value: number | null; color?: string }) {
  const pct = value === null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <View style={styles.progressTrack} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}>
      <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: color }]} />
    </View>
  );
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <Card style={{ alignItems: 'center', paddingVertical: space.xl }}>
      <Text style={[styles.h2, { textAlign: 'center' }]}>{title}</Text>
      {body ? <P muted style={{ textAlign: 'center', marginBottom: space.md }}>{body}</P> : null}
      {action}
    </Card>
  );
}

export function Notice({ children, tone = 'info' }: { children: React.ReactNode; tone?: 'info' | 'warning' | 'danger' }) {
  const t = { info: [colors.primarySoft, colors.primary], warning: [colors.warningSoft, colors.warning], danger: [colors.missedSoft, colors.missed] }[tone];
  return (
    <View style={[styles.notice, { backgroundColor: t[0], borderLeftColor: t[1] }]}>
      {typeof children === 'string' ? <Text style={[styles.p, { color: colors.text, marginBottom: 0 }]}>{children}</Text> : children}
    </View>
  );
}

export function Loading() {
  return (
    <View style={{ padding: space.xl, alignItems: 'center' }}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  screenPad: { padding: space.lg, gap: space.md },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: space.lg, borderWidth: 1, borderColor: colors.border, gap: space.sm },
  h1: { fontSize: font.hero, fontWeight: '700', color: colors.text },
  h2: { fontSize: font.large, fontWeight: '700', color: colors.text, marginBottom: space.xs },
  p: { fontSize: font.body, color: colors.text, lineHeight: 23 },
  btn: { minHeight: TOUCH, paddingHorizontal: space.lg, borderRadius: radius.md, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  btnSmall: { minHeight: 40, paddingHorizontal: space.md },
  btnText: { fontSize: font.body, fontWeight: '700' },
  chip: { minHeight: 40, paddingHorizontal: space.md, borderRadius: radius.pill, borderWidth: 1.5, justifyContent: 'center' },
  chipText: { fontSize: font.small, fontWeight: '600' },
  badge: { paddingHorizontal: space.sm, paddingVertical: 3, borderRadius: radius.pill, alignSelf: 'flex-start' },
  badgeText: { fontSize: 13, fontWeight: '700' },
  label: { fontSize: font.small, fontWeight: '700', color: colors.text, marginBottom: 6 },
  hint: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
  input: { minHeight: TOUCH, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: space.md, fontSize: font.body, color: colors.text, backgroundColor: colors.card },
  segment: { flexDirection: 'row', backgroundColor: colors.upcomingSoft, borderRadius: radius.md, padding: 3 },
  segItem: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  segText: { fontSize: font.small, fontWeight: '700', color: colors.text },
  progressTrack: { height: 10, backgroundColor: colors.upcomingSoft, borderRadius: 5, overflow: 'hidden' },
  progressFill: { height: 10, borderRadius: 5 },
  notice: { borderLeftWidth: 4, padding: space.md, borderRadius: radius.sm },
});
