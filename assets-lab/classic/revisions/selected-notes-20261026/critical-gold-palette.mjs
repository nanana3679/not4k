import { interpolatedPaletteTable, paletteMappedArtwork } from './release-palette.mjs';

// Isolated-note anchors: pale lemon face, apricot rim and amber detail.
// These are sampled references with darker extensions, not an official color specification.
// One monotonic tone ramp keeps all five double-note components in the same palette.
export const criticalGoldStops = [
  [0, '#080609'], [.15, '#644418'], [.3, '#b1812f'], [.45, '#e8ad47'],
  [.6, '#feb94b'], [.72, '#feca80'], [.85, '#feea8c'], [.95, '#fffccc'], [1, '#ffffff'],
];

export function criticalGoldArtwork(source, { width = 200, height = 40, amount = 1 } = {}) {
  const table = interpolatedPaletteTable(criticalGoldStops);
  // Use a distinct outer filter ID even when the source already contains a palette filter.
  return paletteMappedArtwork(source, table, { width, height, amount })
    .replace('id="release-palette"', 'id="critical-gold-palette"')
    .replace('filter="url(#release-palette)"', 'filter="url(#critical-gold-palette)"');
}
