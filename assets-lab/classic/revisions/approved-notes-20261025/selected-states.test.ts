import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface State { id: string; file: string; alpha: number; overlay?: string; overlayAlpha?: number; composite?: string }
interface Group { id: string; role: string; kind: string; states: State[] }
const here = new URL('./', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', here), 'utf8')) as {
  assets: { file: string; generator?: string; sourceFiles: string[]; targetSize: number[] }[];
  selectedPalettePreview: { kinds: ({ kind: string } & Record<'point' | 'idleBody' | 'heldBody' | 'release' | 'sustain', string>)[] };
  selectedStatePreview: { sourceSelection: Record<string, number>; generatedFiles: string[]; groups: Group[]; graceGroups: Group[]; layers: Group[] };
  buildContract: { currentStatePreview: string; unapproved: string[] };
};

describe('선택한 파랑 50%·금색 75%의 상태별 파생 에셋', () => {
  it('93개 출력은 선택한 10종 도안을 사용하며 기본·2배 PNG와 SVG 및 출처 파일이 모두 존재한다', () => {
    const preview = manifest.selectedStatePreview;
    expect(preview.sourceSelection).toEqual({ single: .5, double: .75 });
    expect(preview.generatedFiles).toHaveLength(93);
    expect(new Set(preview.generatedFiles).size).toBe(93);
    for (const file of preview.generatedFiles) {
      const asset = manifest.assets.find(asset => asset.file === file)!;
      expect(asset.generator, file).toBe('build-selected-states.mjs');
      for (const source of asset.sourceFiles) expect(readFileSync(new URL(source, here)).length, source).toBeGreaterThan(0);
      if (file.endsWith('.png') && !file.endsWith('@2x.png')) for (const suffix of ['.svg', '@2x.png']) {
        expect(preview.generatedFiles).toContain(file.replace('.png', suffix));
      }
    }
    for (const selected of manifest.selectedPalettePreview.kinds) for (const role of ['point', 'body', 'release', 'sustain'] as const) {
      const group = preview.groups.find(group => group.id === `${role}-${selected.kind}`)!;
      expect(group.states[0].file).toBe(role === 'body' ? selected.idleBody : selected[role]);
      if (role === 'body') expect(group.states.find(state => state.id === 'held')?.file).toBe(selected.heldBody);
    }
    expect(manifest.buildContract.currentStatePreview).toBe('selectedStatePreview');
    expect(manifest.buildContract.unapproved.join(' ')).not.toMatch(/32px 확대|중앙 꺾쇠/);
  });

  it('더블 바디 7상태와 좌우 몫 8개를 제공하고 일부 성공은 전체 70%·Grace 외곽 100%를 유지한다', () => {
    const preview = manifest.selectedStatePreview;
    expect(preview.groups).toHaveLength(8);
    expect(preview.groups.find(group => group.id === 'body-double')?.states.map(state => state.id).sort()).toEqual(['failed', 'held', 'idle', 'partial-failed-left', 'partial-failed-right', 'partial-held-left', 'partial-held-right']);
    expect(preview.layers.flatMap(group => group.states)).toHaveLength(8);
    expect(preview.graceGroups.map(group => group.role)).toEqual(['point', 'release', 'point', 'release']);
    for (const group of preview.graceGroups.filter(group => group.kind === 'double')) {
      const normal = group.states.find(state => state.id === 'pending')!;
      expect(group.states.find(state => state.id === 'partial-success')).toMatchObject({ file: normal.file, alpha: .7, overlay: normal.overlay, overlayAlpha: 1 });
      expect(group.states.find(state => state.id === 'success')).toMatchObject({ alpha: 0, overlayAlpha: 0 });
      for (const state of group.states.filter(state => state.id.startsWith('partial-failed'))) expect(state).toMatchObject({ overlay: normal.overlay, overlayAlpha: 1 });
    }
  });
});
