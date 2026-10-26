import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface State { id: string; file: string; alpha: number; overlay?: string; overlayAlpha?: number; composite?: string }
interface Group { id: string; role: string; kind: string; states: State[] }
const here = new URL('./', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', here), 'utf8')) as {
  assets: { file: string; generator?: string; sourceFiles: string[]; targetSize: number[] }[];
  selectedPalettePreview: { kinds: ({ kind: string } & Record<'point' | 'idleBody' | 'heldBody' | 'release' | 'sustain', string>)[] };
  selectedStatePreview: { sourceSelection: Record<string, number>; generatedFiles: string[]; groups: Group[]; graceGroups: Group[]; layers: Group[] };
  buildContract: { currentStatePreview: string; unapproved: string[]; confirmedDisplay: Record<string, unknown> };
};

describe('선택한 파랑 50%·금색 75%의 상태별 파생 에셋', () => {
  it('75개 출력은 선택한 10종 도안을 사용하며 기본·2배 PNG와 SVG 및 출처 파일이 모두 존재한다', () => {
    const preview = manifest.selectedStatePreview;
    expect(preview.sourceSelection).toEqual({ single: .5, double: .75 });
    expect(preview.generatedFiles).toHaveLength(75);
    expect(new Set(preview.generatedFiles).size).toBe(75);
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

  it('더블 바디 7상태와 좌우 몫 6개를 제공하고 누름·릴리즈 일부 성공은 전체 70%·Grace 외곽 100%를 유지한다', () => {
    const preview = manifest.selectedStatePreview;
    expect(preview.groups).toHaveLength(8);
    expect(preview.groups.find(group => group.id === 'body-double')?.states.map(state => state.id).sort()).toEqual(['failed', 'held', 'idle', 'partial-failed-left', 'partial-failed-right', 'partial-held-left', 'partial-held-right']);
    expect(preview.layers.flatMap(group => group.states)).toHaveLength(6);
    expect(preview.graceGroups.map(group => group.role)).toEqual(['point', 'release', 'point', 'release']);
    for (const group of preview.graceGroups.filter(group => group.kind === 'double')) {
      const normal = group.states.find(state => state.id === 'pending')!;
      expect(group.states.find(state => state.id === 'partial-success')).toMatchObject({ file: normal.file, alpha: .7, overlay: normal.overlay, overlayAlpha: 1 });
      expect(group.states.find(state => state.id === 'success')).toMatchObject({ alpha: 0, overlayAlpha: 0 });
      for (const state of group.states.filter(state => state.id.startsWith('partial-failed'))) expect(state).toMatchObject({ overlay: normal.overlay, overlayAlpha: 1 });
    }
  });

  it('유지는 실패 에셋 없이 왼쪽 성공이면 오른쪽 몫만, 오른쪽 성공이면 왼쪽 몫만 남기고 모두 성공하면 숨긴다', () => {
    const preview = manifest.selectedStatePreview;
    const single = preview.groups.find(group => group.id === 'sustain-single')!;
    const double = preview.groups.find(group => group.id === 'sustain-double')!;
    const layers = preview.layers.find(group => group.id === 'sustain-layers')!;
    expect(single.states.map(state => state.id)).toEqual(['pending', 'success']);
    expect(double.states.map(state => state.id)).toEqual(['pending', 'partial-success-left', 'partial-success-right', 'success']);
    expect(layers.states.map(state => state.id)).toEqual(['unit-left', 'unit-right']);
    for (const side of ['left', 'right']) {
      const remaining = side === 'left' ? 'right' : 'left';
      expect(double.states.find(state => state.id === `partial-success-${side}`)).toMatchObject({ file: layers.states.find(state => state.id === `unit-${remaining}`)!.file, alpha: 1 });
    }
    for (const group of [single, double]) expect(group.states.find(state => state.id === 'success')).toMatchObject({ file: group.states[0].file, alpha: 0 });
    expect(manifest.buildContract.confirmedDisplay.sustain).toEqual({ failedAsset: false, partialSuccess: 'hide-successful-unit', remainingUnitAlpha: 1, successHidden: true });
    expect(manifest.buildContract.unapproved.join(' ')).not.toContain('유지 노트의 성공·실패 표시 방식');
    for (const directory of [new URL('assets/', here), new URL('../../../../lab/image-galleries/classic-approved-states-20261025/assets/', here)]) {
      expect(readdirSync(directory).filter(file => file.startsWith('selected-sustain-') && file.includes('failed'))).toEqual([]);
    }
    expect(manifest.assets.filter(asset => asset.file.startsWith('assets/selected-sustain-') && asset.file.includes('failed'))).toEqual([]);
  });
});
