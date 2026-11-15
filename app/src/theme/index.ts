// Colours chosen for WCAG 2.1 AA contrast (≥ 4.5:1 for text on the background
// it is used on) – NFR5. Verified by scripts/contrast-check.mjs.

export const colors = {
  bg: '#F6F8FB',
  card: '#FFFFFF',
  text: '#14202E',
  textMuted: '#4A5868',
  border: '#D5DCE5',
  primary: '#0B5FA5',
  primaryText: '#FFFFFF',
  primarySoft: '#E3EEF9',
  taken: '#1D6B3A',
  takenSoft: '#E2F3E8',
  skipped: '#6A4A00',
  skippedSoft: '#FBF0D4',
  missed: '#A4262C',
  missedSoft: '#FBE4E5',
  due: '#0B5FA5',
  dueSoft: '#E3EEF9',
  upcoming: '#4A5868',
  upcomingSoft: '#EDF1F5',
  warning: '#8A3B00',
  warningSoft: '#FFF1E5',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };
export const font = { small: 14, body: 16, large: 18, title: 22, hero: 28 };

/** Minimum touch target (Apple HIG 44pt / Material 48dp). */
export const TOUCH = 48;

export const statusStyle = {
  taken: { fg: colors.taken, bg: colors.takenSoft, label: 'Taken', icon: '✓' },
  skipped: { fg: colors.skipped, bg: colors.skippedSoft, label: 'Skipped', icon: '↷' },
  missed: { fg: colors.missed, bg: colors.missedSoft, label: 'Missed', icon: '!' },
  due: { fg: colors.due, bg: colors.dueSoft, label: 'Due now', icon: '●' },
  upcoming: { fg: colors.upcoming, bg: colors.upcomingSoft, label: 'Upcoming', icon: '○' },
} as const;
