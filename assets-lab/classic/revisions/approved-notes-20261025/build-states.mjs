import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium } from '@playwright/test';
import { halfMask, rasterArtwork, rectangularGraceArtwork, stateArtwork } from './state-artwork.mjs';

const here = new URL('./', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', here), 'utf8'));
// Keep the selected masters immutable; replace generated records and the superseded release artwork.
manifest.assets = manifest.assets.filter(asset => asset.generator !== 'build-states.mjs' && !asset.file.startsWith('assets/release-'));
manifest.selections.release = 'J2-C';
manifest.stateGroups = [];
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

    const terminalName = `terminal-j2-shadow-3-${kind}`;
    const terminalSource = rasterArtwork(await read(`${terminalName}@2x.png`));
    const terminalStates = [
      state('idle', '대기', `assets/${terminalName}.png`, { skinKey: `terminal${cap}Idle` }),
      state('held', '전체 유지 · 대기와 같은 그림', `assets/${terminalName}.png`, { skinKey: `terminal${cap}`, aliasOf: 'idle' }),
    ];
    if (kind === 'double') for (const side of ['left', 'right']) terminalStates.push(state(`partial-held-${side}`, `${side === 'left' ? '왼쪽' : '오른쪽'} 미충족 · 같은 그림`, `assets/${terminalName}.png`, { aliasOf: 'idle', waitingSide: side, skinKey: `terminalDoublePartialHeld${side === 'left' ? 'Left' : 'Right'}` }));
    for (const side of ['all', ...(kind === 'double' ? ['left', 'right'] : [])]) {
      const id = side === 'all' ? 'failed' : `partial-failed-${side}`;
      const label = side === 'all' ? '전체 실패' : `${side === 'left' ? '왼쪽' : '오른쪽'} 실패`;
      const key = side === 'all' ? `terminal${cap}Failed` : `terminalDoublePartialFailed${side === 'left' ? 'Left' : 'Right'}`;
      terminalStates.push(state(id, label, await emit(`terminal-${kind}-${id}`, stateArtwork(terminalSource, { failedSide: side }), { role: `J2-C ${kind} · ${label}`, sourceFiles: [`assets/${terminalName}@2x.png`], operation: { failedSide: side }, skinKey: key }), { skinKey: key }));
    }
    group(`terminal-${kind}`, `J2-C ${kind === 'single' ? '싱글' : '더블'} 마감`, terminalStates, { heldTreatment: '바디만 켜짐을 표시하고 터미널은 승인 그림을 재사용하는 시안. 부분 충족과 실패 상태는 별도로 유지.' });

    const sustainName = `sustain-${kind}`;
    const sustainSource = await svg(sustainName);
    const sustainStates = [state('pending', '미처리', `assets/${sustainName}.png`)];
    for (const side of ['all', ...(kind === 'double' ? ['left', 'right'] : [])]) {
      const id = side === 'all' ? 'failed' : `partial-failed-${side}`;
      const label = side === 'all' ? '전체 실패' : `${side === 'left' ? '왼쪽' : '오른쪽'} 실패`;
      sustainStates.push(state(id, label, await emit(`${sustainName}-${id}`, stateArtwork(sustainSource, { failedSide: side }), { role: `유지 ${kind} · ${label}`, sourceFiles: [`assets/${sustainName}.svg`], operation: { failedSide: side }, skinKey: side === 'all' ? `sustain${cap}Failed` : `sustainDoublePartialFailed${side === 'left' ? 'Left' : 'Right'}` })));
    }
    group(sustainName, `${kind === 'single' ? '싱글' : '더블'} 유지 표식`, sustainStates, { beamCenters: centers, grace: false });
  }

  const m6 = await svg('note-double-anodized-contrast-070');
  const failedM6 = await emit('note-double-failed', stateArtwork(m6, { width: 212, failedSide: 'all' }), { width: 212, role: 'M6 70% 더블 누름 · 전체 실패', sourceFiles: ['assets/note-double-anodized-contrast-070.svg'], operation: { failedSide: 'all' }, skinKey: 'noteDoubleFailed' });
  group('point-double', 'M6 70% 더블 누름', [
    state('pending', '미처리', 'assets/note-double-anodized-contrast-070.png', { skinKey: 'noteDouble' }),
    state('failed', '전체 실패', failedM6, { skinKey: 'noteDoubleFailed' }),
    state('partial-left', '일부 처리 · 전체 alpha 0.5', 'assets/note-double-anodized-contrast-070.png', { skinKey: 'noteDoublePartialFailedLeft', aliasOf: 'pending', alpha: 0.5 }),
    state('partial-right', '일부 처리 · 전체 alpha 0.5', 'assets/note-double-anodized-contrast-070.png', { skinKey: 'noteDoublePartialFailedRight', aliasOf: 'pending', alpha: 0.5 }),
  ], { targetSize: [212, 40], note: '기존 누름 렌더러의 일부 처리 alpha 방식을 참고한 도안 공유. 좌우 실패 바디와 다른 표시.' });

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
    group(`${role}-layers`, `${role === 'release' ? '릴리즈' : '유지'} · 남은 몫 분리`, states, { note: '기본 200×40 좌표와 투명 여백을 유지. 표시 수명은 미확정이며 성공한 몫을 숨기는 안의 자료.' });
  }
  const masks = [];
  for (const side of ['left', 'right']) masks.push(state(side, `${side === 'left' ? '왼쪽' : '오른쪽'} 몫 마스크`, await emit(`unit-mask-${side}`, halfMask(side), { role: '200×40 절반 알파 마스크', sourceFiles: [], operation: { side, alphaMask: true } })));
  group('unit-masks', '몫별 알파 마스크', masks);

  manifest.releaseSuccessPreview = {
    approval: 'proposed-display-treatment',
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
    alternatives: [
      state('hide-left-success', '왼쪽 성공 · 오른쪽만 남김', 'assets/release-double-unit-right.png', { alpha: 1 }),
      state('left-failed', '왼쪽 실패 · 일부 실패색', 'assets/release-double-partial-failed-left.png', { alpha: 1 }),
    ],
    note: '일반 더블 릴리즈의 일부 성공 비교 시안. 원본에 표시 알파만 적용하며 반투명 PNG를 만들지 않음. 70%·성공 몫 숨김·Grace 외곽·실패 표시 수명은 미확정.',
  };

  // Original artwork is regenerated at explicit target sizes, or copied for raster masters.
  manifest.buildContract = {
    command: 'node assets-lab/classic/revisions/approved-notes-20261025/build-states.mjs',
    generatedFrom: '동일 폴더 assets/의 확정 원본; build-states.mjs + state-artwork.mjs',
    rasterMasters: ['assets/terminal-j2-shadow-3-single.png', 'assets/terminal-j2-shadow-3-double.png'],
    rasterCopy: 'J2-C 마감과 릴리즈 정상본은 선택 PNG를 그대로 사용. 릴리즈 기본/2배 PNG는 해당 원본을 바이트 그대로 복사하며 릴리즈 SVG·실패 SVG는 @2x PNG를 내장한 래퍼다.',
    targets: [target('point', 212), target('body'), target('terminal'), target('release'), target('sustain'), target('pointGrace', 260, 88), target('releaseGrace', 248, 88)],
    scale: 'PNG 기본 크기는 targetSize, @2x는 각 변 2배. SVG 자연 크기 / 5 규칙을 사용하지 않음.',
    grace: { sourcePadding: 24, releaseSilhouette: 'J2-C의 alpha >= 0.5인 전체 200×40 직사각 외곽', referenceOnly: ['terminal-grace-overlay'], composeOnce: true },
    failureStyle: '무채색 + 밝기 45%; 시각 시안이며 표시 수명·판정 정책은 구현하지 않음',
    missingRequestedStates: [],
    unapproved: ['새 상태별 색·강도', 'J2-C 유지/부분 충족의 대기 그림 재사용', '더블 릴리즈 일부 성공의 전체 alpha 0.7', '한 몫 성공 후 나머지 몫만 표시', '실패·종속 0점 표시 수명'],
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
