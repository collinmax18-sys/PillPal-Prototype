import React from 'react';
import { Text, type ColorValue } from 'react-native';
import { Tabs } from 'expo-router';
import { colors } from '@/theme';

const icon = (glyph: string) =>
  function TabIcon({ color }: { color: ColorValue }) {
    return <Text style={{ fontSize: 20, color }} accessible={false}>{glyph}</Text>;
  };

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 12, fontWeight: '700' },
        tabBarStyle: { minHeight: 60 },
        headerStyle: { backgroundColor: colors.card },
        headerTitleStyle: { color: colors.text, fontWeight: '700' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Today', tabBarIcon: icon('◷'), tabBarAccessibilityLabel: "Today's doses" }} />
      <Tabs.Screen name="meds" options={{ title: 'Meds', headerTitle: 'Medications', tabBarIcon: icon('💊') }} />
      <Tabs.Screen name="journal" options={{ title: 'Journal', tabBarIcon: icon('✎'), tabBarAccessibilityLabel: 'Effects journal' }} />
      <Tabs.Screen name="history" options={{ title: 'History', tabBarIcon: icon('▤'), tabBarAccessibilityLabel: 'History and adherence' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: icon('⚙') }} />
    </Tabs>
  );
}
