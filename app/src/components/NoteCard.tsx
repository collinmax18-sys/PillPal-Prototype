import React from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import type { EffectNote, LabelSection } from '../core/types';
import { MOOD_EMOJI, MOOD_LABELS, SEVERITY_LABELS, matchEffectsToLabel, tagLabel } from '../core/effects';
import { relativeMinutes } from '../core/time';
import { Card, Row } from './ui';
import { colors, radius, space } from '../theme';

export function NoteCard({ note, medName, labelSections }: { note: EffectNote; medName?: string; labelSections?: LabelSection[] | null }) {
  const matches = labelSections ? matchEffectsToLabel(note.effects, labelSections) : [];
  const matched = new Set(matches.map((m) => m.tagId));
  return (
    <Card onPress={() => router.push({ pathname: '/note', params: { medId: note.medicationId, noteId: note.id } })} accessibilityLabel={`Journal entry: ${MOOD_LABELS[note.mood]}. ${note.effects.map(tagLabel).join(', ')}. ${note.text}`}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row>
          <Text style={{ fontSize: 26 }} accessible={false}>{MOOD_EMOJI[note.mood]}</Text>
          <View>
            <Text style={{ fontWeight: '700', color: colors.text, fontSize: 16 }}>{MOOD_LABELS[note.mood]}{medName ? ` · ${medName}` : ''}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>
              {new Date(note.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              {note.minutesAfterDose != null ? ` · ${note.minutesAfterDose === 0 ? 'right after dose' : `${relativeMinutes(note.minutesAfterDose)} after dose`}` : ''}
            </Text>
          </View>
        </Row>
        {note.effectiveness != null ? <Text style={{ color: colors.textMuted, fontWeight: '700' }}>Relief {note.effectiveness}/5</Text> : null}
      </Row>
      {note.effects.length ? (
        <Row wrap style={{ gap: 6 }}>
          {note.effects.map((e) => (
            <View key={e} style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: matched.has(e) ? colors.warningSoft : colors.upcomingSoft }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: matched.has(e) ? colors.warning : colors.text }}>
                {tagLabel(e)}{matched.has(e) ? ' · in label' : ''}
              </Text>
            </View>
          ))}
          {note.severity ? <Text style={{ fontSize: 13, color: note.severity === 3 ? colors.missed : colors.textMuted, fontWeight: '700' }}>{SEVERITY_LABELS[note.severity]}</Text> : null}
        </Row>
      ) : null}
      {note.text ? <Text style={{ fontSize: 15, color: colors.text, lineHeight: 21 }}>{note.text}</Text> : null}
      {matches.length ? (
        <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: space.xs }}>
          {matches.map((m) => m.tagLabel).join(', ')} {matches.length === 1 ? 'is' : 'are'} listed in this medication’s FDA label ({matches[0].sectionTitle.toLowerCase()}).
        </Text>
      ) : null}
    </Card>
  );
}
