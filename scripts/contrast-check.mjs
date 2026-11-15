// WCAG 2.1 contrast check for the PillPal palette (NFR5, P3 evaluation E6c).
// Usage: node scripts/contrast-check.mjs   (exits 1 if any pair is below its target)
const hex = (h) => h.replace('#', '').match(/.{2}/g).map((x) => parseInt(x, 16) / 255);
const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (h) => {
  const [r, g, b] = hex(h).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

// [name, foreground, background, minimum] – values mirror app/src/theme/index.ts
const pairs = [
  ['Body text on card', '#14202E', '#FFFFFF', 4.5],
  ['Body text on background', '#14202E', '#F6F8FB', 4.5],
  ['Muted text on card', '#4A5868', '#FFFFFF', 4.5],
  ['Muted text on background', '#4A5868', '#F6F8FB', 4.5],
  ['Primary button text', '#FFFFFF', '#0B5FA5', 4.5],
  ['Primary link on card', '#0B5FA5', '#FFFFFF', 4.5],
  ['Taken badge', '#1D6B3A', '#E2F3E8', 4.5],
  ['Taken button text', '#FFFFFF', '#1D6B3A', 4.5],
  ['Skipped badge', '#6A4A00', '#FBF0D4', 4.5],
  ['Missed badge', '#A4262C', '#FBE4E5', 4.5],
  ['Due badge', '#0B5FA5', '#E3EEF9', 4.5],
  ['Upcoming badge', '#4A5868', '#EDF1F5', 4.5],
  ['Warning text on warning panel', '#8A3B00', '#FFF1E5', 4.5],
  ['Danger button text', '#A4262C', '#FFFFFF', 4.5],
];

let fail = 0;
console.log('Pair'.padEnd(34), 'Ratio', ' Target', ' Result');
for (const [name, fg, bg, min] of pairs) {
  const r = ratio(fg, bg);
  const ok = r >= min;
  if (!ok) fail++;
  console.log(name.padEnd(34), r.toFixed(2).padStart(5), `${min}:1`.padStart(7), ok ? '  PASS' : '  FAIL');
}
console.log(fail ? `\n${fail} pair(s) below target` : `\nAll ${pairs.length} pairs meet WCAG 2.1 AA (4.5:1).`);
process.exit(fail ? 1 : 0);
