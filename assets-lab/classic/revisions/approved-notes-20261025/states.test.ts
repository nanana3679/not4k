import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface Asset { file: string; bytes: number; sha256: string; width: number; height: number; targetSize?: number[]; generator?: string; sourceFiles?: string[]; skinKey?: string | null; proposedRuntimePath?: string | null; usage?: string }
interface State { id: string; file: string; aliasOf?: string; waitingSide?: string; alpha?: number; overlayAlpha?: number }
interface Group { id: string; states: State[]; beamCenters?: number[] }
interface ReleaseSuccessPreview {
  approval: string; targetSize: number[]; grace: boolean;
  backgrounds: { id: string; file?: string }[];
  progression: State[]; graceProgression: State[]; graceOverlay: { file: string; targetSize: number[]; padding: number };
}
interface PointSuccessPreview {
  targetSize: number[]; bodySize: number[];
  backgrounds: { id: string; file?: string }[];
  progression: State[];
}
const here = new URL('./', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', here), 'utf8')) as { assets: Asset[]; releaseSymbolPreview: { approval: string; selectedVariant: string; comparisonIds: string[]; kinds: { kind: string; symbolCenters: number[]; variants: { id: string; file: string; strokeWidth?: number; layerAlphas?: number[] }[] }[] }; sustainVisibilityPreview: { approval: string; outlineWidth: number; selected: { single: string }; kinds: { kind: string; markerWidth: number; beamCenters: number[]; original: string; candidate: string; railCandidate?: string; railMarkerWidth?: number; heldBody: string }[] }; stateGroups: Group[]; pointSuccessPreview: PointSuccessPreview; releaseSuccessPreview: ReleaseSuccessPreview; bodyCompositionPreview: { cases: { id: string; point: string | null; release: string | null }[] }; buildContract: { targets: { key: string }[]; confirmedDisplay: Record<string, unknown>; missingRequestedStates: string[]; unapproved: string[] } };
const group = (id: string) => manifest.stateGroups.find(entry => entry.id === id)!;

describe('Classic 확정 도안의 상태별 전달 자료', () => {
  it('에셋 306개는 중복 경로 없이 해시·바이트 수가 일치하며 PNG 기본/2배 크기를 명시한다', () => {
    expect(manifest.assets).toHaveLength(306);
    expect(new Set(manifest.assets.map(asset => asset.file)).size).toBe(306);
    for (const asset of manifest.assets) {
      const bytes = readFileSync(new URL(asset.file, here));
      expect(bytes.length, asset.file).toBe(asset.bytes);
      expect(createHash('sha256').update(bytes).digest('hex'), asset.file).toBe(asset.sha256);
      if (asset.file.endsWith('.png')) {
        expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], asset.file).toEqual([asset.width, asset.height]);
        if (asset.targetSize) {
          const scale = asset.file.endsWith('@2x.png') ? 2 : 1;
          expect([asset.width, asset.height], asset.file).toEqual(asset.targetSize.map(value => value * scale));
        }
      }
    }
  });

  it('싱글·더블 릴리즈의 기본/2배 PNG는 최종 J2-C 원본과 바이트가 같고 SVG도 같은 2배 원본을 내장한다', () => {
    for (const kind of ['single', 'double']) {
      for (const suffix of ['.png', '@2x.png']) {
        const original = readFileSync(new URL(`assets/terminal-j2-shadow-3-${kind}${suffix}`, here));
        expect(readFileSync(new URL(`assets/release-${kind}${suffix}`, here)).equals(original)).toBe(true);
      }
      const original2x = readFileSync(new URL(`assets/terminal-j2-shadow-3-${kind}@2x.png`, here));
      expect(readFileSync(new URL(`assets/release-${kind}.svg`, here), 'utf8')).toContain(`data:image/png;base64,${original2x.toString('base64')}`);
    }
    for (const asset of manifest.assets.filter(asset => asset.file.startsWith('assets/release-'))) {
      expect(asset.generator, asset.file).toBe('build-states.mjs');
      expect(asset.sourceFiles?.length, asset.file).toBeGreaterThan(0);
    }
  });

  it('200×40 유지 SVG로 만든 실패본은 200×40·400×80이며 40×8로 축소되지 않는다', () => {
    for (const kind of ['single', 'double']) {
      const file = `assets/sustain-${kind}-failed`;
      expect(manifest.assets.find(asset => asset.file === `${file}.png`)).toMatchObject({ width: 200, height: 40, targetSize: [200, 40] });
      expect(manifest.assets.find(asset => asset.file === `${file}@2x.png`)).toMatchObject({ width: 400, height: 80 });
    }
  });

  it('각 SVG 안의 id가 중복되지 않아 필터·클립·도안 참조가 다른 요소를 가리키지 않는다', () => {
    for (const asset of manifest.assets.filter(asset => asset.file.endsWith('.svg'))) {
      const source = readFileSync(new URL(asset.file, here), 'utf8');
      const ids = [...source.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
      expect(new Set(ids).size, asset.file).toBe(ids.length);
    }
  });

  it('더블 바디는 광선 x=84·116과 대기·전체 유지·좌우 미충족·전체 실패·좌우 실패 7개 상태를 구별한다', () => {
    expect(group('body-double').beamCenters).toEqual([84, 116]);
    expect(group('body-double').states.map(state => state.id).sort()).toEqual(['failed', 'held', 'idle', 'partial-failed-left', 'partial-failed-right', 'partial-held-left', 'partial-held-right']);
    expect(new Set(group('body-double').states.map(state => state.file)).size).toBe(7);
  });

  it('바디 시작·끝 terminal 상태와 스킨 키는 없고 J2-C 원본은 릴리즈 입력으로만 보존한다', () => {
    expect(manifest.stateGroups.some(entry => entry.id.startsWith('terminal-'))).toBe(false);
    expect(manifest.buildContract.targets.some(target => target.key === 'terminal')).toBe(false);
    for (const asset of manifest.assets.filter(asset => asset.file.startsWith('assets/terminal-'))) {
      expect(asset.skinKey).toBeNull();
      expect(asset.proposedRuntimePath).toBeNull();
      expect(asset.usage).toBe(asset.file.includes('terminal-j2-') ? 'release-source' : 'historical-reference');
    }
    expect(manifest.bodyCompositionPreview.cases.map(({ id, point, release }) => [id, !!point, !!release])).toEqual([
      ['bare', false, false], ['point', true, false], ['release', false, true], ['both', true, true],
    ]);
    expect(manifest.buildContract.confirmedDisplay).toMatchObject({ bodyStartCap: false, bodyEndCap: false, implicitPoint: false, implicitRelease: false });
  });

  it('더블 포인트는 M6 212×40 원본에 alpha 1→0.7→0을 적용하고 바디 폭 200을 유지한다', () => {
    const preview = manifest.pointSuccessPreview;
    expect(preview).toMatchObject({ targetSize: [212, 40], bodySize: [200, 40] });
    expect(preview.progression.map(({ id, file, alpha }) => ({ id, file, alpha }))).toEqual([
      { id: 'pending', file: 'assets/note-double-anodized-contrast-070.png', alpha: 1 },
      { id: 'partial-success', file: 'assets/note-double-anodized-contrast-070.png', alpha: 0.7 },
      { id: 'success', file: 'assets/note-double-anodized-contrast-070.png', alpha: 0 },
    ]);
    expect(preview.backgrounds).toMatchObject([{ id: 'solid' }, { id: 'body', file: 'assets/body-double-center-dual-beam.png' }]);
    for (const item of [...preview.progression, ...preview.backgrounds]) {
      if (item.file) expect(manifest.assets.some(asset => asset.file === item.file), item.file).toBe(true);
    }
    for (const side of ['left', 'right']) expect(group('point-double').states.find(state => state.id === `partial-${side}`)).toMatchObject({ aliasOf: 'pending', alpha: 0.7 });
  });

  it('더블 릴리즈 본체는 alpha 1→0.7→0이며 Grace 외곽은 1→1→0으로 별도 표시한다', () => {
    const preview = manifest.releaseSuccessPreview;
    expect(preview).toMatchObject({ approval: 'approved-display-treatment', targetSize: [200, 40], grace: false });
    expect(preview.progression.map(({ id, file, alpha }) => ({ id, file, alpha }))).toEqual([
      { id: 'pending', file: 'assets/release-double.png', alpha: 1 },
      { id: 'partial-success', file: 'assets/release-double.png', alpha: 0.7 },
      { id: 'success', file: 'assets/release-double.png', alpha: 0 },
    ]);
    expect(preview.graceOverlay).toEqual({ file: 'assets/release-grace-overlay.png', targetSize: [248, 88], padding: 24 });
    expect(preview.graceProgression.map(({ id, file, alpha, overlayAlpha }) => ({ id, file, alpha, overlayAlpha }))).toEqual([
      { id: 'pending', file: 'assets/release-double.png', alpha: 1, overlayAlpha: 1 },
      { id: 'partial-success', file: 'assets/release-double.png', alpha: 0.7, overlayAlpha: 1 },
      { id: 'success', file: 'assets/release-double.png', alpha: 0, overlayAlpha: 0 },
    ]);
    expect(preview.backgrounds).toMatchObject([{ id: 'solid' }, { id: 'body', file: 'assets/body-double-center-dual-beam.png' }]);
    expect(manifest.buildContract.confirmedDisplay).toMatchObject({ releasePartialSuccessAlpha: 0.7, gracePartialSuccessOverlayAlpha: 1, releaseSuccessHidden: true });
    expect(manifest.buildContract.unapproved.join(' ')).not.toMatch(/alpha 0.7|Grace 외곽|실패·종속 0점 표시 수명/);
    for (const item of [...preview.progression, ...preview.graceProgression, preview.graceOverlay, ...preview.backgrounds]) {
      if (item.file) expect(manifest.assets.some(asset => asset.file === item.file), item.file).toBe(true);
    }
  });

  it('유지 확대안은 싱글 36px·44px와 더블 각 32px를 비교하며 기존 정상 도안과 스킨 연결을 보존한다', () => {
    const preview = manifest.sustainVisibilityPreview;
    expect(preview).toMatchObject({ approval: 'proposed-display-treatment', outlineWidth: 2.4 });
    expect(preview.kinds.map(({ kind, markerWidth, beamCenters }) => ({ kind, markerWidth, beamCenters }))).toEqual([
      { kind: 'single', markerWidth: 36, beamCenters: [100] },
      { kind: 'double', markerWidth: 32, beamCenters: [84, 116] },
    ]);
    expect(preview.kinds[0]).toMatchObject({ railMarkerWidth: 44, railCandidate: 'assets/sustain-single-rail-outline.png' });
    expect(preview.selected.single).toBe(preview.kinds[0].railCandidate);
    expect(preview.kinds[1].railCandidate).toBeUndefined();
    for (const item of preview.kinds) {
      expect(group(`sustain-${item.kind}`).states.find(state => state.id === 'pending')!.file).toBe(item.original);
      expect(item.candidate).not.toBe(item.original);
      for (const file of [item.candidate, ...(item.railCandidate ? [item.railCandidate] : [])]) {
        const candidate = manifest.assets.find(asset => asset.file === file)!;
        expect(candidate).toMatchObject({ width: 200, height: 40, skinKey: null, proposedRuntimePath: null });
      }
      for (const file of [item.original, item.candidate, item.heldBody]) expect(manifest.assets.some(asset => asset.file === file)).toBe(true);
    }
  });

  it('릴리즈 3단은 alpha 1·0.8·0.5로 흐려지고 표식 중심은 바디 광선과 일치하며 기존 J2-C 상태를 보존한다', () => {
    expect(manifest.releaseSymbolPreview.approval).toBe('proposed-artwork');
    expect(manifest.releaseSymbolPreview.selectedVariant).toBe('triple-tight-large');
    expect(manifest.releaseSymbolPreview.comparisonIds).toEqual(['triple-tight', 'triple-tight-large']);
    expect(manifest.releaseSymbolPreview.kinds.map(item => item.kind)).toEqual(['single', 'double']);
    for (const item of manifest.releaseSymbolPreview.kinds) {
      expect(item.symbolCenters).toEqual(item.kind === 'single' ? [100] : [84, 116]);
      expect(item.symbolCenters).toEqual(group(`body-${item.kind}`).beamCenters);
      expect(item.variants.map(({ id, strokeWidth }) => ({ id, strokeWidth }))).toEqual([
        { id: 'original', strokeWidth: undefined }, { id: 'thin', strokeWidth: 2 }, { id: 'bold', strokeWidth: 3 },
        { id: 'ratio-a', strokeWidth: 2.5 }, { id: 'ratio-b', strokeWidth: 2.5 }, { id: 'ratio-c', strokeWidth: 2.5 },
        { id: 'triple-fade', strokeWidth: 2.2 }, { id: 'triple-tight', strokeWidth: 2.2 },
        { id: 'triple-tight-large', strokeWidth: 2.42 },
      ]);
      expect(group(`release-${item.kind}`).states.find(state => state.id === 'pending')!.file).toBe(item.variants[0].file);
      for (const variant of item.variants.slice(1)) {
        expect(manifest.assets.find(asset => asset.file === variant.file)).toMatchObject({ width: 200, height: 40, skinKey: null, proposedRuntimePath: null });
        if (variant.id.startsWith('triple-')) expect(variant.layerAlphas).toEqual([1, 0.8, 0.5]);
        const source = readFileSync(new URL(variant.file.replace('.png', '.svg'), here), 'utf8');
        expect(source.match(/data-release-symbol="stacked-up-chevrons"/g)).toHaveLength(item.kind === 'single' ? 1 : 2);
        for (const center of item.symbolCenters) expect(source).toContain(`transform="translate(${center} 0)"`);
      }
    }
  });

  it('릴리즈는 실패 확정·종속 0점일 때 실패색으로 화면 밖까지 남고 판정 대기에는 실패색을 쓰지 않는다', () => {
    expect(manifest.buildContract.confirmedDisplay.failedRelease).toEqual({ when: 'failure-confirmed', includesDependentZero: true, hideWhen: 'scrolled-out', pendingFailureStyle: false });
    expect(manifest.buildContract.unapproved).toContain('일부 성공·실패가 함께 확정된 더블 릴리즈의 최종 합성');
    expect(manifest.buildContract.unapproved).toContain('유지 노트의 성공·실패 표시 방식과 수명');
  });

  it('릴리즈·유지는 좌우 정상/실패 분리 파일을 제공하고 생성물의 입력은 같은 묶음 안에서 모두 찾을 수 있다', () => {
    for (const role of ['release', 'sustain']) expect(group(`${role}-layers`).states.map(state => state.id).sort()).toEqual(['unit-left', 'unit-left-failed', 'unit-right', 'unit-right-failed']);
    for (const asset of manifest.assets) for (const source of asset.sourceFiles ?? []) expect(readFileSync(new URL(source, here)).length).toBeGreaterThan(0);
    expect(manifest.buildContract.missingRequestedStates).toEqual([]);
    for (const asset of manifest.assets.filter(asset => asset.file.endsWith('.svg'))) expect(readFileSync(new URL(asset.file, here), 'utf8'), asset.file).not.toMatch(/\b(?:href|xlink:href)="(?!#|data:)/);
  });
});
