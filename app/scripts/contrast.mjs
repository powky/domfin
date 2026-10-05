// Checks that the theme's colors read where the app puts them, in the light
// and the dark theme: text needs a contrast of 4.5:1 with what's behind it,
// and icons, chart marks and the outline of controls 3:1 (WCAG 2.2 AA,
// 1.4.3 and 1.4.11). `npm run contrast`; `--all` lists every pair.
import './typescript.mjs';

const { appThemes } = await import('../src/theme/themes.ts');
const { selectionColors } = await import('../src/features/net-worth/lib/selection.ts');

const TEXT = 4.5;
const GRAPHIC = 3;

// What the app puts on what. Text goes on any surface; the rest, where it's used.
const surfaces = ['background', 'surface', 'surfaceRaised', 'surfaceMuted', 'surfaceHover', 'accent.subtle'];
const pairs = [
  ...['text.primary', 'text.secondary', 'text.tertiary', 'text.accent'].map((fg) => ({ fg, on: surfaces, min: TEXT })),
  { fg: 'text.positive', on: ['surface'], min: TEXT },
  // Money in, in the rows of Transactions: at rest, hovered and selected.
  { fg: 'positive', on: ['surface', 'surfaceHover', 'accent.subtle'], min: TEXT },
  // A primary button's label, and the number in a solid badge.
  { fg: 'text.inverse', on: ['accent.default', 'accent.pressed'], min: TEXT },
  { fg: 'accent.onAccent', on: ['accent.default'], min: TEXT },
  // Icons: the active section, warnings, the picked option of a menu.
  { fg: 'accent.default', on: surfaces, min: GRAPHIC },
  { fg: 'accent.onAccent', on: ['accent.pressed'], min: GRAPHIC },
  // Status icons of the imports (ok, failed) and the swatches of KPIs.
  ...['positive', 'negative'].map((fg) => ({ fg, on: ['surface', 'surfaceMuted'], min: GRAPHIC })),
  { fg: 'spending', on: ['surface'], min: GRAPHIC },
  { fg: 'control', on: ['surface'], min: GRAPHIC },
  // Bars, lines, arcs and nodes. The income band of the Sankey only shades.
  ...Object.keys(appThemes.light.colors.chart)
    .filter((name) => name !== 'incomeLink')
    .map((name) => ({ fg: `chart.${name}`, on: ['surface'], min: GRAPHIC })),
  // The check in the boxes of Net worth, filled with the account's color.
  { fg: 'text.inverse', on: selectionColors.map((name) => `chart.${name}`), min: GRAPHIC },
  // Avatars' initials are decorative (the name goes next to them): they only need to show.
  ...Object.keys(appThemes.light.colors.avatar).map((tone) => ({
    fg: `avatar.${tone}.foreground`,
    on: [`avatar.${tone}.background`],
    min: GRAPHIC,
  })),
];

// The light theme came before this check, and these pairs don't meet it yet:
// each one with the contrast it has today, which can't go down. Fix one and
// take it off the list.
const pendingInLight = {
  'text.tertiary': { background: 2.24, surface: 2.42, surfaceRaised: 2.42, surfaceMuted: 2.12, surfaceHover: 2.12, 'accent.subtle': 2.1 },
  'text.accent': { background: 3.12, surface: 3.37, surfaceRaised: 3.37, surfaceMuted: 2.96, surfaceHover: 2.96, 'accent.subtle': 2.92 },
  'text.positive': { surface: 3.23 },
  positive: { surfaceHover: 4.49, 'accent.subtle': 4.43 },
  'text.inverse': { 'accent.default': 3.37, 'accent.pressed': 4.3, 'chart.amber': 2.27 },
  'accent.onAccent': { 'accent.default': 3.37 },
  'accent.default': { surfaceMuted: 2.96, surfaceHover: 2.96, 'accent.subtle': 2.92 },
  control: { surface: 2.42 },
  'chart.amber': { surface: 2.27 },
  'chart.slate': { surface: 2.64 },
  'chart.slateLight': { surface: 1.9 },
  'chart.gold': { surface: 2.41 },
};

const color = (colors, path) => {
  const value = path.split('.').reduce((node, key) => node?.[key], colors);
  if (!/^#[0-9A-F]{6}$/i.test(value ?? '')) throw new Error(`${path} no es un color #RRGGBB: ${value}`);
  return value;
};
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
};

const all = process.argv.includes('--all');
let failed = false;
console.log('Contraste de los temas (WCAG 2.2 AA): texto 4.5:1; íconos, gráficos y controles 3:1.');

for (const [name, theme] of Object.entries(appThemes)) {
  const pending = name === 'light' ? pendingInLight : {};
  const lines = [];
  const cleared = [];
  const counts = { ok: 0, pending: 0, failing: 0 };
  for (const { fg, on, min } of pairs) {
    for (const bg of on) {
      // Two decimals, rounded down: 4.497 is 4.49, not a 4.50 that falls short of 4.5.
      const ratio = Math.floor(contrast(color(theme.colors, fg), color(theme.colors, bg)) * 100) / 100;
      const floor = pending[fg]?.[bg];
      let status = 'ok';
      if (ratio < min) status = floor !== undefined && ratio >= floor ? 'pending' : 'failing';
      else if (floor !== undefined) cleared.push(`${fg} sobre ${bg}`);
      counts[status]++;
      if (status !== 'ok' || all) {
        const label = { ok: '  bien      ', pending: '  pendiente ', failing: '✗ no llega  ' }[status];
        lines.push(`  ${label}${`${fg} sobre ${bg}`.padEnd(44)} ${ratio.toFixed(2).padStart(5)}  (mín. ${min})`);
      }
    }
  }
  const total = counts.ok + counts.pending + counts.failing;
  const summary = [`${counts.ok} de ${total} cumplen`];
  if (counts.pending) summary.push(`${counts.pending} pendientes (ya estaban así)`);
  if (counts.failing) summary.push(`${counts.failing} no llegan`);
  console.log(`\n${name === 'light' ? 'Claro' : 'Oscuro'}: ${summary.join(', ')}.`);
  for (const line of lines) console.log(line);
  for (const pair of cleared) console.log(`  ${pair} ya cumple: quítalo de pendingInLight.`);
  if (counts.failing || cleared.length) failed = true;
}

process.exitCode = failed ? 1 : 0;
