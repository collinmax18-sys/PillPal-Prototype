// Dependency-free charts built from Views (accessible summaries via labels).
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import type { DailyAdherence } from '../core/adherence';
import type { EffectNote } from '../core/types';
import { MOOD_LABELS } from '../core/effects';
import { colors, space } from '../theme';
import { parseDateKey } from '../core/time';

export function AdherenceBars({ daily, height = 120 }: { daily: DailyAdherence[]; height?: number }) {
  const max = Math.max(1, ...daily.map((d) => d.taken + d.skipped + d.missed));
  const showLabels = daily.length <= 14;
  const summary = daily.filter((d) => d.resolved).map((d) => `${d.date}: ${d.taken} taken, ${d.missed} missed`).join('; ');
  return (
    <View accessible accessibilityLabel={`Daily adherence chart. ${summary}`}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height, gap: daily.length > 31 ? 1 : 3 }}>
        {daily.map((d) => {
          const seg = (n: number, color: string) => (n ? <View style={{ height: (n / max) * height, backgroundColor: color, borderRadius: 2 }} /> : null);
          return (
            <View key={d.date} style={{ flex: 1, justifyContent: 'flex-end' }}>
              {seg(d.missed, colors.missed)}
              {seg(d.skipped, '#C9A13B')}
              {seg(d.taken, colors.taken)}
              {d.resolved === 0 ? <View style={{ height: 2, backgroundColor: colors.border }} /> : null}
            </View>
          );
        })}
      </View>
      {showLabels ? (
        <View style={{ flexDirection: 'row', gap: 3, marginTop: 4 }}>
          {daily.map((d) => (
            <Text key={d.date} style={{ flex: 1, textAlign: 'center', fontSize: 11, color: colors.textMuted }}>
              {parseDateKey(d.date).toLocaleDateString(undefined, { weekday: 'narrow' })}
            </Text>
          ))}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', gap: space.md, marginTop: space.sm }}>
        <Legend color={colors.taken} label="Taken" />
        <Legend color="#C9A13B" label="Skipped" />
        <Legend color={colors.missed} label="Missed" />
      </View>
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <View style={{ width: 12, height: 12, backgroundColor: color, borderRadius: 3 }} />
      <Text style={{ fontSize: 13, color: colors.text }}>{label}</Text>
    </View>
  );
}

/** Mood over time: one dot per note, height = mood 1–5. */
export function MoodTimeline({ notes, days = 30, height = 90 }: { notes: EffectNote[]; days?: number; height?: number }) {
  const [end] = useState(() => Date.now());
  const start = end - days * 86400000;
  const pts = notes.filter((n) => n.createdAt >= start).sort((a, b) => a.createdAt - b.createdAt);
  if (!pts.length) return null;
  const desc = pts.map((n) => `${new Date(n.createdAt).toLocaleDateString()}: ${MOOD_LABELS[n.mood]}`).join('; ');
  return (
    <View accessible accessibilityLabel={`Mood over the last ${days} days. ${desc}`} style={{ height: height + 16 }}>
      {[1, 3, 5].map((m) => (
        <View key={m} style={{ position: 'absolute', left: 0, right: 0, top: height - ((m - 1) / 4) * height, borderTopWidth: 1, borderTopColor: colors.border }}>
          <Text style={{ position: 'absolute', left: 0, top: -9, fontSize: 10, color: colors.textMuted, backgroundColor: colors.card }}>{m === 1 ? 'Bad' : m === 3 ? 'Okay' : 'Good'}</Text>
        </View>
      ))}
      {pts.map((n) => {
        const x = (n.createdAt - start) / (end - start);
        const color = n.mood >= 4 ? colors.taken : n.mood === 3 ? colors.primary : colors.missed;
        return <View key={n.id} style={{ position: 'absolute', left: `${8 + x * 90}%`, top: height - ((n.mood - 1) / 4) * height - 6, width: 12, height: 12, borderRadius: 6, backgroundColor: color }} />;
      })}
    </View>
  );
}
