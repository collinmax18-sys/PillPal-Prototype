// Medication information (FR7): the official FDA label from openFDA, organized
// into clearly titled, collapsible sections (boxed warning first), cached for
// offline use and linked to the full label on DailyMed.
import React, { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useData } from '@/state/AppState';
import * as repo from '@/data/repo';
import { getLabel } from '@/services/druginfo';
import { shortName } from '@/services/notifications';
import { dailyMedUrl } from '@/core/drugdata';
import { Button, Card, H1, Notice, P, Row, Screen, Loading } from '@/components/ui';
import { colors } from '@/theme';
import type { LabelSection } from '@/core/types';

const PREVIEW_CHARS = 420;

export default function LabelScreen() {
  const { medId } = useLocalSearchParams<{ medId: string }>();
  const [force, setForce] = useState(0);
  const { data, error, loading } = useData(async (db) => {
    const med = await repo.getMedication(db, medId);
    if (!med?.rxcui) return { med, result: null };
    return { med, result: await getLabel(db, med.rxcui, med.name, force > 0) };
  }, [medId, force]);

  if (loading && !data) return <Loading />;
  if (error && !data) return <Screen><Notice tone="warning">Could not load drug information. You may be offline and this label is not cached yet.</Notice></Screen>;
  const med = data?.med;
  const label = data?.result?.label;
  if (!med) return null;
  const effective = label?.effectiveTime ? `${label.effectiveTime.slice(0, 4)}-${label.effectiveTime.slice(4, 6)}-${label.effectiveTime.slice(6, 8)}` : null;
  const url = dailyMedUrl(label?.setId ?? null);

  return (
    <Screen>
      <View>
        <H1>{shortName(med.name)}</H1>
        {label ? (
          <P muted small>
            {[...new Set([label.brandName, label.genericName].filter(Boolean))].join(' · ')}
            {'\n'}Source: U.S. FDA drug label via openFDA{effective ? ` · label version ${effective}` : ''}
            {data?.result?.fromCache ? ` · saved for offline use${data.result.stale ? ' (could not refresh)' : ''}` : ''}
          </P>
        ) : null}
      </View>
      {!label ? (
        <Notice tone="warning">No FDA label was found for this RxNorm concept. openFDA covers U.S. products, so some Canadian brands are not included.</Notice>
      ) : (
        <>
          <Notice>
            This is the official label text, grouped into sections. Informational only – ask your pharmacist or doctor about your own treatment.
          </Notice>
          {label.sections.map((s) => (
            <SectionCard key={s.key} section={s} />
          ))}
          <Row>
            {url ? <Button kind="secondary" small title="Open full label on DailyMed" onPress={() => Linking.openURL(url)} /> : null}
            <Button kind="ghost" small title="Refresh" onPress={() => setForce((f) => f + 1)} />
          </Row>
        </>
      )}
    </Screen>
  );
}

function SectionCard({ section }: { section: LabelSection }) {
  const [expanded, setExpanded] = useState(section.key === 'boxed_warning');
  const long = section.text.length > PREVIEW_CHARS;
  const shown = expanded || !long ? section.text : `${section.text.slice(0, PREVIEW_CHARS)}…`;
  const boxed = section.key === 'boxed_warning';
  return (
    <Card style={boxed ? { borderColor: colors.missed, borderWidth: 2 } : undefined}>
      <Text accessibilityRole="header" style={{ fontSize: 17, fontWeight: '700', color: boxed ? colors.missed : colors.text }}>{section.title}</Text>
      <Text selectable style={{ fontSize: 15, lineHeight: 22, color: colors.text }}>{shown}</Text>
      {long ? (
        <Pressable onPress={() => setExpanded((x) => !x)} accessibilityRole="button" style={{ minHeight: 40, justifyContent: 'center' }}>
          <Text style={{ color: colors.primary, fontWeight: '700' }}>{expanded ? 'Show less' : 'Show full section'}</Text>
        </Pressable>
      ) : null}
    </Card>
  );
}
