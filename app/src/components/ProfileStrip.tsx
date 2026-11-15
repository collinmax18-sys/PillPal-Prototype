// Role-based home (P3 §3 "User Roles"): caregivers and care professionals see
// every person they manage with today's due/missed counts, and can switch.
import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useApp, useData } from '../state/AppState';
import { loadDoses } from '../services/doses';
import { dateKey } from '../core/time';
import { colors, radius, space } from '../theme';

export function ProfileStrip() {
  const { profiles, settings, updateSettings } = useApp();
  const { data } = useData(async (db) => {
    const today = dateKey(Date.now());
    const out: Record<string, { due: number; missed: number; taken: number; total: number }> = {};
    for (const p of profiles) {
      const items = await loadDoses(db, p.id, today, today, settings.graceMinutes);
      out[p.id] = {
        due: items.filter((i) => i.status === 'due').length,
        missed: items.filter((i) => i.status === 'missed').length,
        taken: items.filter((i) => i.status === 'taken').length,
        total: items.length,
      };
    }
    return out;
  }, [profiles.length]);

  if (profiles.length < 2 && settings.role === 'personal') return null;
  const title = settings.role === 'professional' ? 'Patients' : 'People I care for';
  return (
    <View style={{ gap: space.sm }}>
      <Text style={{ fontWeight: '700', color: colors.textMuted, fontSize: 13, textTransform: 'uppercase' }}>{title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
        {profiles.map((p) => {
          const c = data?.[p.id];
          const active = p.id === settings.activeProfileId;
          return (
            <Pressable
              key={p.id}
              onPress={() => updateSettings({ activeProfileId: p.id })}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${p.name}. ${c ? `${c.taken} of ${c.total} taken, ${c.missed} missed, ${c.due} due` : ''}`}
              style={{ minWidth: 130, padding: space.md, borderRadius: radius.md, borderWidth: 2, borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primarySoft : colors.card }}
            >
              <Text style={{ fontWeight: '700', color: colors.text, fontSize: 16 }} numberOfLines={1}>{p.name}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>{p.relation}</Text>
              {c ? (
                <Text style={{ marginTop: 4, fontSize: 13, color: c.missed ? colors.missed : colors.taken, fontWeight: '700' }}>
                  {c.taken}/{c.total} taken{c.missed ? ` · ${c.missed} missed` : ''}{c.due ? ` · ${c.due} due` : ''}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
