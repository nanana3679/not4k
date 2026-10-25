import { readFile, writeFile, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium } from '@playwright/test';
import { halfMask, rasterArtwork, rectangularGraceArtwork, stateArtwork } from './state-artwork.mjs';
import { outlinedSustain } from './sustain-visibility.mjs';
import { releaseChevron } from './release-chevron.mjs';

const here = new URL('./', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', here), 'utf8'));
// Retire only generated terminal states; selected J2-C raster masters remain release inputs.
for (const asset of manifest.assets.filter(asset => asset.generator === 'build-states.mjs' && /^assets\/terminal-(single|double)-(failed|partial-failed-(left|right))/.test(asset.file))) {
  await unlink(new URL(asset.file, here)).catch(error => { if (error.code !== 'ENOENT') throw error; });
}
// Keep the selected masters immutable; replace generated records and the superseded release artwork.
manifest.assets = manifest.assets.filter(asset => asset.generator !== 'build-states.mjs' && !asset.file.startsWith('assets/release-'));
manifest.selections.release = 'J2-C';
delete manifest.selections.terminal;
for (const asset of manifest.assets.filter(asset => asset.file.startsWith('assets/terminal-'))) {
  asset.skinKey = null;
  asset.proposedRuntimePath = null;
  asset.usage = asset.file.includes('terminal-j2-') ? 'release-source' : 'historical-reference';
  asset.role = asset.file.includes('terminal-j2-') ? 'J2-C 릴리즈 선택 원본 · 출처 파일명 보존' : '과거 바디 끝 Grace 참고본 · 새 모델 미사용';
}
manifest.stateGroups = [];
manifest.sustainVisibilityPreview = {
  approval: 'proposed-display-treatment', targetSize: [200, 40], outlineWidth: 2.4,
  selected: { single: 'assets/sustain-single-rail-outline.png' },
  note: '싱글은 다음 파란선까지 닿는 44px·어두운 윤곽선 안을 사용자 선택. 36px와 기존 원본을 비교용으로 보존. 더블 각 32px는 시안이며 런타임은 별도 적용.',
  kinds: [],
};
manifest.releaseSymbolPreview = {
  approval: 'proposed-artwork', targetSize: [200, 40],
  note: '2단 B와 아래로 흐려지는 3단 두 안을 비교. 3단은 14px 경로 폭·2.2px 선, 위부터 alpha 1·0.55·0.2. 윤곽도 함께 흐려짐. 아이콘 중심은 바디 광선 좌표를 공유.',
  comparisonIds: ['ratio-b', 'triple-fade', 'triple-tight'],
  reference: 'https://lucide.dev/icons/chevrons-up',
  kinds: [],
};
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const read = name => readFile(new URL(`assets/${name}`, here));
const svg = async name => (await read(`${name}.svg`)).toString();
const target = (key, width = 200, height = 40) => ({ key, width, height });

async function emit(name, source, { width = 200, height = 40, role, sourceFiles, operation, skinKey = null, nativeSource = source, pngSources = {}, padding = [0, 0, 0, 0], approval = 'proposed-state-treatment' }) {
  const records = [
    { suffix: '.svg', bytes: Buffer.from(source), width, height },
    ...await Promise.all([1, 2].map(async scale => {
      const png = pngSources[scale] ? null : await page.evaluate(async ({ source, width, height, scale }) => {
        const image = new Image();
        image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(source);
        await image.decode();
        const canvas = document.createElement('canvas');
        // Explicit target dimensions: do not divide the SVG natural size by five.
        canvas.width = width * scale; canvas.height = height * scale;
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/png').split(',')[1];
      }, { source: scale === 1 ? nativeSource : source, width, height, scale });
      return { suffix: scale === 1 ? '.png' : '@2x.png', bytes: pngSources[scale] ?? Buffer.from(png, 'base64'), width: width * scale, height: height * scale };
    })),
  ];
  for (const record of records) {
    const file = `assets/${name}${record.suffix}`;
    await writeFile(new URL(file, here), record.bytes);
    manifest.assets.push({ file, role, generator: 'build-states.mjs', sourceFiles, operation, approval, skinKey,
      proposedRuntimePath: skinKey && record.suffix === '.png' ? `public/skins/classic/${name}.png` : null,
      width: record.width, height: record.height, targetSize: [width, height], padding, bytes: record.bytes.length,
      sha256: createHash('sha256').update(record.bytes).digest('hex') });
  }
  return `assets/${name}.png`;
}

function group(id, label, states, extra = {}) {
  manifest.stateGroups.push({ id, label, targetSize: [200, 40], states, ...extra });
}
function state(id, label, file, extra = {}) { return { id, label, file, ...extra }; }

try {
  for (const kind of ['single', 'double']) {
    const cap = kind === 'single' ? 'Single' : 'Double';
    const bodyName = kind === 'single' ? 'body-single' : 'body-double-center-dual-beam';
    const source = await svg(bodyName);
    const centers = kind === 'single' ? [100] : [84, 116];
    const states = [state('idle', '대기', `assets/${bodyName}.png`, { skinKey: `body${cap}` })];
    for (const [id, label, treatment, key] of [
      ['held', '전체 유지', { heldCenters: centers, spill: true }, `body${cap}Held`],
      ['failed', '전체 실패', { failedSide: 'all' }, `body${cap}Failed`],
      ...(kind === 'double' ? ['left', 'right'].flatMap(side => {
        const sideCap = side === 'left' ? 'Left' : 'Right';
        const activeCenter = side === 'left' ? 116 : 84;
        return [
          [`partial-held-${side}`, `${side === 'left' ? '왼쪽' : '오른쪽'} 미충족`, { heldCenters: [activeCenter] }, `bodyDoublePartialHeld${sideCap}`],
          [`partial-failed-${side}`, `${side === 'left' ? '왼쪽' : '오른쪽'} 실패`, { failedSide: side, heldCenters: [activeCenter] }, `bodyDoublePartialFailed${sideCap}`],
        ];
      }) : []),
    ]) states.push(state(id, label, await emit(`body-${kind}-${id}`, stateArtwork(source, treatment), { role: `${kind} 바디 · ${label}`, sourceFiles: [`assets/${bodyName}.svg`], operation: treatment, skinKey: key }), { skinKey: key }));
    group(`body-${kind}`, `${kind === 'single' ? '싱글' : '더블'} 바디`, states, { beamCenters: centers });

    const sustainName = `sustain-${kind}`;
    const sustainSource = await svg(sustainName);
    const sustainStates = [state('pending', '미처리', `assets/${sustainName}.png`)];
    for (const side of ['all', ...(kind === 'double' ? ['left', 'right'] : [])]) {
      const id = side === 'all' ? 'failed' : `partial-failed-${side}`;
      const label = side === 'all' ? '전체 실패' : `${side === 'left' ? '왼쪽' : '오른쪽'} 실패`;
      sustainStates.push(state(id, label, await emit(`${sustainName}-${id}`, stateArtwork(sustainSource, { failedSide: side }), { role: `유지 ${kind} · ${label}`, sourceFiles: [`assets/${sustainName}.svg`], operation: { failedSide: side }, skinKey: side === 'all' ? `sustain${cap}Failed` : `sustainDoublePartialFailed${side === 'left' ? 'Left' : 'Right'}` })));
    }
    group(sustainName, `${kind === 'single' ? '싱글' : '더블'} 유지 표식`, sustainStates, { beamCenters: centers, grace: false });
    const markerWidth = kind === 'single' ? 36 : 32;
    const outlineColor = kind === 'single' ? '#05243a' : '#3b2906';
    const candidate = await emit(`${sustainName}-channel-outline`, outlinedSustain(sustainSource, { markerWidth, outlineColor }), {
      role: `${kind} 유지 · 광선 홈 폭 + 어두운 윤곽선 시안`, sourceFiles: [`assets/${sustainName}.svg`],
      operation: { markerWidth, outlineWidth: 2.4, outlineColor, beamCenters: centers, grace: false },
    });
    const railPreview = kind === 'single' ? {
      railMarkerWidth: 44,
      railCandidate: await emit(`${sustainName}-rail-outline`, outlinedSustain(sustainSource, { markerWidth: 44, outlineColor }), {
        role: 'single 유지 · 다음 파란선 폭 + 어두운 윤곽선 시안', sourceFiles: [`assets/${sustainName}.svg`],
        operation: { markerWidth: 44, outlineWidth: 2.4, outlineColor, beamCenters: centers, grace: false },
      }),
    } : {};
    manifest.sustainVisibilityPreview.kinds.push({ kind, markerWidth, beamCenters: centers,
      original: `assets/${sustainName}.png`, candidate, idleBody: `assets/${bodyName}.png`, heldBody: `assets/body-${kind}-held.png`,
      ...railPreview,
    });
  }

  const m6 = await svg('note-double-anodized-contrast-070');
  const failedM6 = await emit('note-double-failed', stateArtwork(m6, { width: 212, failedSide: 'all' }), { width: 212, role: 'M6 70% 더블 누름 · 전체 실패', sourceFiles: ['assets/note-double-anodized-contrast-070.svg'], operation: { failedSide: 'all' }, skinKey: 'noteDoubleFailed' });
  group('point-double', 'M6 70% 더블 누름', [
    state('pending', '미처리', 'assets/note-double-anodized-contrast-070.png', { skinKey: 'noteDouble' }),
    state('failed', '전체 실패', failedM6, { skinKey: 'noteDoubleFailed' }),
    state('partial-left', '일부 처리 · 전체 70%', 'assets/note-double-anodized-contrast-070.png', { skinKey: 'noteDoublePartialFailedLeft', aliasOf: 'pending', alpha: 0.7 }),
    state('partial-right', '일부 처리 · 전체 70%', 'assets/note-double-anodized-contrast-070.png', { skinKey: 'noteDoublePartialFailedRight', aliasOf: 'pending', alpha: 0.7 }),
  ], { targetSize: [212, 40], note: '일반 더블 포인트의 일부 성공과 같은 전체 alpha 0.7로 표시. 기존 일부 실패 키의 정상 도안 공유는 제안이며 좌우 실패 바디와 다른 표시.' });

  for (const kind of ['single', 'double']) {
    const cap = kind === 'single' ? 'Single' : 'Double';
    const master = `terminal-j2-shadow-3-${kind}`;
    const pngSources = { 1: await read(`${master}.png`), 2: await read(`${master}@2x.png`) };
    const source = rasterArtwork(pngSources[2]);
    const nativeSource = rasterArtwork(pngSources[1]);
    const sourceFiles = [`assets/${master}.png`, `assets/${master}@2x.png`];
    await emit(`release-${kind}`, source, { role: `J2-C ${kind} 릴리즈`, sourceFiles,
      operation: { artwork: 'J2-C', png: '선택 PNG를 바이트 그대로 복사', svg: '@2x PNG 내장 래퍼' },
      pngSources, approval: 'approved-artwork', skinKey: `release${cap}` });
    const symbolCenters = manifest.stateGroups.find(group => group.id === `body-${kind}`).beamCenters;
    const symbolVariants = [{ id: 'original', label: '기존', file: `assets/release-${kind}.png` }];
    for (const { id, label, ...geometry } of [
      { id: 'thin', label: '가는 표시', strokeWidth: 2, pathWidth: 16, chevronRise: 8, chevronOffset: 8 },
      { id: 'bold', label: '직전 안', strokeWidth: 3, pathWidth: 16, chevronRise: 8, chevronOffset: 8 },
      { id: 'ratio-a', label: 'A · 높이만 낮춤', strokeWidth: 2.5, pathWidth: 16, chevronRise: 6, chevronOffset: 6 },
      { id: 'ratio-b', label: 'B · 완만한 각도', strokeWidth: 2.5, pathWidth: 18, chevronRise: 5, chevronOffset: 6 },
      { id: 'ratio-c', label: 'C · 납작하게', strokeWidth: 2.5, pathWidth: 16, chevronRise: 4, chevronOffset: 5.5 },
      { id: 'triple-fade', label: '3단 · 아래로 흐리게', strokeWidth: 2.2, pathWidth: 14, chevronRise: 4.5, chevronOffset: 6,
        layerAlphas: [1, 0.55, 0.2], outlineWidth: 0.6, outlineOpacity: 0.55, lineCap: 'round', lineJoin: 'round' },
      { id: 'triple-tight', label: '3단 · 촘촘하게', strokeWidth: 2.2, pathWidth: 14, chevronRise: 4.5, chevronOffset: 5,
        layerAlphas: [1, 0.55, 0.2], outlineWidth: 0.6, outlineOpacity: 0.55, lineCap: 'round', lineJoin: 'round' },
    ]) {
      const file = await emit(`release-${kind}-chevron-${id}`, releaseChevron(source, { kind, centers: symbolCenters, ...geometry }), {
        nativeSource: releaseChevron(nativeSource, { kind, centers: symbolCenters, ...geometry }),
        role: `J2-C ${kind} 릴리즈 · 꺾쇠 ${label} 시안`, sourceFiles,
        operation: { symbol: 'stacked-up-chevrons', symbolCenters, ...geometry, indicates: 'release-action' },
        approval: 'proposed-artwork',
      });
      symbolVariants.push({ id, label, file, ...geometry });
    }
    manifest.releaseSymbolPreview.kinds.push({ kind, symbolCenters, heldBody: `assets/body-${kind}-held.png`, variants: symbolVariants });
    const states = [state('pending', '미처리 · J2-C', `assets/release-${kind}.png`)];
    for (const side of ['all', ...(kind === 'double' ? ['left', 'right'] : [])]) {
      const id = side === 'all' ? 'failed' : `partial-failed-${side}`;
      const label = side === 'all' ? '전체 실패' : `${side === 'left' ? '왼쪽' : '오른쪽'} 실패`;
      const treatment = { failedSide: side };
      const key = side === 'all' ? `release${cap}Failed` : `releaseDoublePartialFailed${side === 'left' ? 'Left' : 'Right'}`;
      const file = await emit(`release-${kind}-${id}`, stateArtwork(source, treatment), { nativeSource: stateArtwork(nativeSource, treatment),
        role: `J2-C ${kind} 릴리즈 · ${label}`, sourceFiles, operation: treatment, skinKey: key });
      states.push(state(id, label, file));
    }
    group(`release-${kind}`, `J2-C ${kind === 'single' ? '싱글' : '더블'} 릴리즈`, states);
    for (const suffix of ['', ...(kind === 'double' ? ['-partial-failed-left', '-partial-failed-right'] : [])]) {
      const name = `release-${kind}${suffix}`;
      await emit(`${name}-grace`, rectangularGraceArtwork(await svg(name)), {
        nativeSource: rectangularGraceArtwork(rasterArtwork(await read(`${name}.png`))),
        width: 248, height: 88, padding: [24, 24, 24, 24], role: `J2-C ${kind} 릴리즈${suffix} · Grace 합성 참고본`,
        sourceFiles: [`assets/${name}.png`, `assets/${name}.svg`], operation: { grace: '전체 200×40 외곽', compositeOnce: true },
      });
    }
  }
  await emit('release-grace-overlay', rectangularGraceArtwork('', { overlayOnly: true }), {
    width: 248, height: 88, padding: [24, 24, 24, 24], role: 'J2-C 릴리즈 전체 외곽 Grace overlay',
    sourceFiles: ['assets/terminal-j2-shadow-3-single@2x.png', 'assets/terminal-j2-shadow-3-double@2x.png'],
    operation: { silhouette: 'J2-C 전체 픽셀의 alpha >= 0.5인 직사각 외곽', overlayOnly: true }, skinKey: 'releaseGraceOverlay',
  });

  for (const role of ['release', 'sustain']) {
    const states = [];
    for (const side of ['left', 'right']) for (const failed of [false, true]) {
      const inputName = `${role}-double${failed ? '-failed' : ''}`;
      // Mask the exact base PNG so native-size halves recombine byte-for-byte.
      const nativeSource = stateArtwork(rasterArtwork(await read(`${inputName}.png`)), { onlySide: side });
      // Both failure sets use stateArtwork: apply failure and clipping once to the normal source.
      const svgInputName = `${role}-double`;
      const treatment = { onlySide: side, ...(failed ? { failedSide: 'all' } : {}) };
      const source = stateArtwork(await svg(svgInputName), treatment);
      const id = `unit-${side}${failed ? '-failed' : ''}`;
      const label = `${side === 'left' ? '왼쪽' : '오른쪽'} 몫만${failed ? ' · 실패' : ''}`;
      states.push(state(id, label, await emit(`${role}-double-${id}`, source, { nativeSource, role: `${role} · ${label}`, sourceFiles: [`assets/${inputName}.png`, `assets/${svgInputName}.svg`], operation: { ...treatment, nativePixels: '기본 PNG에서 분리', highResolution: role === 'release' ? 'J2-C @2x PNG를 내장한 SVG에서 렌더링' : '벡터 SVG에서 렌더링' }, skinKey: null }), { unitIndex: side === 'left' ? 0 : 1 }));
    }
    group(`${role}-layers`, `${role === 'release' ? '릴리즈' : '유지'} · 남은 몫 분리`, states, { note: role === 'release' ? '기본 200×40 좌표를 보존한 참고 레이어. 일부 성공의 반쪽 숨김은 전체 70%로 대체됐으며 성공·실패 혼합의 최종 합성은 미확정.' : '기본 200×40 좌표와 투명 여백을 유지. 유지 표식의 표시 방식·수명은 별도 검토.' });
  }
  const masks = [];
  for (const side of ['left', 'right']) masks.push(state(side, `${side === 'left' ? '왼쪽' : '오른쪽'} 몫 마스크`, await emit(`unit-mask-${side}`, halfMask(side), { role: '200×40 절반 알파 마스크', sourceFiles: [], operation: { side, alphaMask: true } })));
  group('unit-masks', '몫별 알파 마스크', masks);

  manifest.pointSuccessPreview = {
    targetSize: [212, 40],
    bodySize: [200, 40],
    backgrounds: [
      { id: 'solid', label: '단색 배경', color: '#080c12' },
      { id: 'body', label: '더블 바디 위', color: '#080c12', file: 'assets/body-double-center-dual-beam.png' },
    ],
    progression: [
      state('pending', '대기 · 전체 100%', 'assets/note-double-anodized-contrast-070.png', { alpha: 1 }),
      state('partial-success', '일부 성공 · 전체 70%', 'assets/note-double-anodized-contrast-070.png', { alpha: 0.7 }),
      state('success', '모두 성공 · 숨김', 'assets/note-double-anodized-contrast-070.png', { alpha: 0 }),
    ],
    note: '선택한 M6 도안에 일반 더블 포인트의 표시 alpha 1→0.7→0을 적용. 바디와 중심을 맞추고 포인트가 양옆으로 6px씩 나오며 바디 알파는 유지.',
  };

  manifest.releaseSuccessPreview = {
    approval: 'approved-display-treatment',
    targetSize: [200, 40],
    grace: false,
    backgrounds: [
      { id: 'solid', label: '단색 배경', color: '#080c12' },
      { id: 'body', label: '더블 바디 위', color: '#080c12', file: 'assets/body-double-center-dual-beam.png' },
    ],
    progression: [
      state('pending', '대기 · 전체 100%', 'assets/release-double.png', { alpha: 1 }),
      state('partial-success', '일부 성공 · 전체 70%', 'assets/release-double.png', { alpha: 0.7 }),
      state('success', '모두 성공 · 숨김', 'assets/release-double.png', { alpha: 0 }),
    ],
    graceOverlay: { file: 'assets/release-grace-overlay.png', targetSize: [248, 88], padding: 24 },
    graceProgression: [
      state('pending', '대기 · 본체·외곽 100%', 'assets/release-double.png', { alpha: 1, overlayAlpha: 1 }),
      state('partial-success', '일부 성공 · 본체 70% · 외곽 100%', 'assets/release-double.png', { alpha: 0.7, overlayAlpha: 1 }),
      state('success', '모두 성공 · 본체·외곽 숨김', 'assets/release-double.png', { alpha: 0, overlayAlpha: 0 }),
    ],
    note: '일부 성공은 정상 도안 전체 70%로 확정. Grace 외곽은 원래 밝기를 유지하며 모두 성공하면 본체·외곽을 함께 숨김. 반쪽 숨김은 대체됨. 원본과 별도 overlay에 표시 알파만 적용.',
  };

  manifest.bodyCompositionPreview = {
    bodyFile: 'assets/body-double-center-dual-beam.png', bodySize: [200, 160], stageSize: [212, 200],
    cases: [
      { id: 'bare', label: 'Point 없음 · 릴리즈 없음', point: null, release: null },
      { id: 'point', label: 'Point 있음 · 릴리즈 없음', point: 'assets/note-double-anodized-contrast-070.png', release: null },
      { id: 'release', label: 'Point 없음 · 릴리즈 있음', point: null, release: 'assets/release-double.png' },
      { id: 'both', label: 'Point 있음 · 릴리즈 있음', point: 'assets/note-double-anodized-contrast-070.png', release: 'assets/release-double.png' },
    ],
    note: '위는 끝, 아래는 시작. 바디 자체의 경계는 같고 명시된 Point·릴리즈만 추가. 시작·끝 마감은 없음.',
  };

  // Original artwork is regenerated at explicit target sizes, or copied for raster masters.
  manifest.buildContract = {
    command: 'node assets-lab/classic/revisions/approved-notes-20261025/build-states.mjs',
    generatedFrom: '동일 폴더 assets/의 확정 원본; build-states.mjs + state-artwork.mjs',
    rasterMasters: ['assets/terminal-j2-shadow-3-single.png', 'assets/terminal-j2-shadow-3-double.png'],
    rasterCopy: 'J2-C 릴리즈 정상본은 선택 PNG를 그대로 사용. 릴리즈 기본/2배 PNG는 해당 원본을 바이트 그대로 복사하며 릴리즈 SVG·실패 SVG는 @2x PNG를 내장한 래퍼다.',
    targets: [target('point', 212), target('body'), target('release'), target('sustain'), target('pointGrace', 260, 88), target('releaseGrace', 248, 88)],
    scale: 'PNG 기본 크기는 targetSize, @2x는 각 변 2배. SVG 자연 크기 / 5 규칙을 사용하지 않음.',
    grace: { sourcePadding: 24, releaseSilhouette: 'J2-C의 alpha >= 0.5인 전체 200×40 직사각 외곽', referenceOnly: ['terminal-grace-overlay'], composeOnce: true },
    failureStyle: '무채색 + 밝기 45%; 실패색의 구체 강도는 시안. 확정된 표시 수명은 confirmedDisplay를 따름.',
    confirmedDisplay: {
      sourceComments: ['https://github.com/nanana3679/not4k/pull/339#issuecomment-6390804166', 'https://github.com/nanana3679/not4k/pull/339#issuecomment-6390954414'],
      releasePartialSuccessAlpha: 0.7, gracePartialSuccessOverlayAlpha: 1, releaseSuccessHidden: true,
      failedRelease: { when: 'failure-confirmed', includesDependentZero: true, hideWhen: 'scrolled-out', pendingFailureStyle: false },
      bodyStartCap: false, bodyEndCap: false, implicitPoint: false, implicitRelease: false,
    },
    missingRequestedStates: [],
    unapproved: ['새 상태별 색·강도', '일부 성공·실패가 함께 확정된 더블 릴리즈의 최종 합성', '유지 노트의 성공·실패 표시 방식과 수명', '더블 유지 표식 각 32px 확대·어두운 윤곽선', '릴리즈 중앙 꺾쇠 표시'],
  };
  const assetsByFile = new Map(manifest.assets.map(asset => [asset.file, asset]));
  for (const asset of manifest.assets) {
    const basePng = assetsByFile.get(asset.file.replace('@2x', '').replace('.svg', '.png'));
    asset.targetSize ??= [basePng.width, basePng.height];
    asset.padding ??= asset.file.includes('grace') ? [24, 24, 24, 24] : [0, 0, 0, 0];
    asset.approval ??= 'approved-artwork';
    asset.sourceFiles ??= [asset.file.replace('@2x', '')];
  }
  await writeFile(new URL('manifest.json', here), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`${manifest.assets.length} assets; ${manifest.stateGroups.length} groups. Runtime untouched.`);
} finally { await browser.close(); }
