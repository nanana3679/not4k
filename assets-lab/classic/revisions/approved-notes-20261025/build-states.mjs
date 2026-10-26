import { readFile, writeFile, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium } from '@playwright/test';
import { halfMask, rasterArtwork, rectangularGraceArtwork, stateArtwork } from './state-artwork.mjs';
import { outlinedSustain } from './sustain-visibility.mjs';
import { releaseChevron } from './release-chevron.mjs';
import { paletteMappedArtwork, sampleArtworkPalette } from './release-palette.mjs';
import { releaseMaterialArtwork } from './release-material.mjs';
import { splitReleaseHighlight, releaseWideMaterialArtwork } from './release-highlight.mjs';
import { releaseBeamEndsArtwork } from './release-beam-ends.mjs';
import { releaseSteppedJunctionArtwork } from './release-stepped-junctions.mjs';
import { releaseForkedJunctionArtwork } from './release-forked-junctions.mjs';
import { releaseCleanJunctionArtwork } from './release-clean-junctions.mjs';
import { releaseStraightJunctionArtwork, straightJunctionGeometry } from './release-straight-junctions.mjs';
import { releaseSimpleFrameArtwork } from './release-simple-frame.mjs';
import { releaseSimplifiedOriginalArtwork } from './release-simplified-original.mjs';
import { releaseCelBalanceArtwork } from './release-cel-balance.mjs';

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
  note: '촘촘한 3단을 선택하고 중심을 고정한 채 경로·선·윤곽을 10% 확대. 확대 전과 비교하며 위부터 alpha 1·0.8·0.5를 유지. 아이콘 중심은 바디 광선 좌표를 공유.',
  selectedVariant: 'triple-tight-large',
  comparisonIds: ['triple-tight', 'triple-tight-large'],
  reference: 'https://lucide.dev/icons/chevrons-up',
  kinds: [],
};
manifest.releasePalettePreview = {
  approval: 'proposed-artwork', targetSize: [200, 40],
  note: 'ImageGen은 포인트·바디를 참고한 색 방향만 제공. 생성본에서 색을 추출해 원래 J2-C의 sRGB 가중 밝기·알파에 적용하고 선택한 3단을 다시 합성. 포인트·바디는 원본 그대로 비교.',
  kinds: [],
};
manifest.paletteAnchorPreview = {
  approval: 'proposed-artwork',
  note: '기존 조합과 포인트·기존 릴리즈·기존 바디 기준의 3안을 비교. 기준 에셋은 원본을 유지하고 나머지 둘만 같은 팔레트로 변환. 포인트 기준은 앞선 색 방향을 바디까지 확장.',
  feedback: { point: '너무 칙칙함', release: '너무 쨍함', body: '포인트가 너무 많이 바뀜' },
  kinds: [],
};
manifest.paletteBalancePreview = {
  approval: 'proposed-artwork',
  note: '포인트 원본은 고정. 바디는 20%·35%, 릴리즈는 45%·65%만 앞선 포인트 팔레트로 이동해 원색을 살린 중간 강도 비교. 명암 배치·알파·3단 표식은 유지.',
  kinds: [],
};
manifest.releaseMaterialPreview = {
  approval: 'proposed-artwork', targetSize: [200, 40],
  note: '3번은 어두운 홈, 4번은 바디처럼 명암을 나눈 면, 5번은 약한 가로빛. ImageGen 결과에서 지정 영역만 합성하고 원래 중앙 면·꺾쇠·아랫면·양끝 띠를 유지. 8번 중앙 흰빛의 코어도 보존.',
  parts: [3, 4, 5], kinds: [],
};
manifest.releaseWideMaterialPreview = {
  approval: 'proposed-artwork', targetSize: [200, 40],
  note: '넓은 부분은 꺾쇠 뒤 중앙 바탕면으로 해석한 시안. 바디 광선 주변의 어두운 색을 적용. 5번은 합쳐진 원본에서 추정 분리한 흰빛 레이어의 위치·크기를 고정하고 alpha 1·0.5·0만 바꾼다. 4번 셀채색 유지.',
  darkSurface: 'central-face', whiteLightAlphas: [1, .5, 0], kinds: [],
};
const browser = await chromium.launch({ headless: true });
manifest.releaseJunctionPreview = {
  approval: 'proposed-artwork', targetSize: [200, 40],
  feedback: '사용자 확인: 아래 접점이 갈라지지 않았음. 흰 띠 끝만 바뀐 직전 시안으로 보존하며 releaseForkPreview에서 하단 분기를 재수정.',
  note: '사용자가 확인한 양옆 가로 띠와 중앙 경사 테두리 접점에 짧은 옆면을 추가. 경계가 두 갈래로 나뉘어 낮은 어두운 면과 높은 면의 단차를 표현하며 기존 색·꺾쇠·싱글 한 빛·더블 두 빛을 유지.',
  kinds: [],
};
manifest.releaseForkPreview = {
  approval: 'proposed-artwork', targetSize: [200, 40],
  feedback: '위·바깥쪽의 기존 사선이 남아 X처럼 보인다는 사용자 확인. releaseCleanForkPreview에서 기존 사선을 제거해 세 면의 꼭짓점으로 수정.',
  note: '직전 시안은 흰 띠 끝만 사선으로 바뀌고 아래 접점은 갈라지지 않았다는 사용자 피드백 반영. y=47의 낮은 수평 경계에서 위·아래 가지가 실제로 갈라지는 구조. y<32의 흰 띠와 중앙 도안은 원본 유지.',
  kinds: [],
};
manifest.releaseCleanForkPreview = {
  approval: 'proposed-artwork', targetSize: [200, 40],
  feedback: '세 면의 꼭짓점은 맞지만 주변 공간이 찌그러졌다는 사용자 확인. releaseStraightJunctionPreview에서 원본 테두리와 면의 폭을 복원.',
  note: '앞면·윗면·옆면을 잇는 꼭짓점. 기존 위·바깥쪽 사선을 지워 세 경계만 한 점에서 만나도록 수정. 중앙 도안·광선 끝 흰빛·외곽·알파 유지.',
  kinds: [],
};
manifest.releaseStraightJunctionPreview = {
  approval: 'proposed-artwork', targetSize: [200, 40],
  note: '변형 전 원본 위에 꼭짓점 안쪽 면만 합성. 긴 대각선 테두리·가로 흰 띠·아래 사선을 원본 좌표로 보존하며 세 면의 꼭짓점 유지.',
  kinds: [],
};
manifest.releaseHorizontalJunctionPreview = {
  approval: 'proposed-artwork', targetSize: [200, 40],
  note: '접점의 위로 꺾이는 경계를 수평 연결로 단순화. 가로 경계가 같은 높이로 안쪽 테두리까지 이어지고 면의 명암으로 단차를 표시. 원래 테두리 폭·색·중앙 도안 유지.',
  kinds: [],
};
manifest.releaseSimpleFramePreview = {
  approval: 'proposed-artwork', targetSize: [200, 40],
  note: '릴리즈만 복잡하다는 피드백에 따른 전체 면 구성 단순화. 중앙 방패형 홈·분할 장식을 없애고 포인트·바디처럼 넓은 면과 끝 띠로 통일. 기존 3단 표식과 광선 끝 위치 유지.',
  kinds: [],
};
manifest.releaseSimplifiedOriginalPreview = {
  approval: 'proposed-artwork', targetSize: [200, 40],
  feedback: '사용자가 형태를 선호함. 셀 채색과 광원 그라데이션 비중은 releaseCelBalancePreview에서 추가 비교.',
  note: '원래 릴리즈의 중앙 사선 면·테두리·화살표·광선 끝을 원본 그대로 유지하고 양옆 흰 띠와 작은 면 분할만 제거한 시안.',
  kinds: [],
};
const celVariants = JSON.parse(await readFile(new URL('cel-balance-reference/variants.json', here), 'utf8'));
manifest.releaseCelBalancePreview = {
  approval: 'proposed-artwork', targetSize: [200, 40],
  note: '선호한 단순화 형태 위에서 넓은 면의 셀 채색과 광원 부근 그라데이션을 조율한 A～D. 테두리·광선 끝·3단 표식은 기존 위치 유지.',
  variants: celVariants.map(({ id, label, note }) => ({ id, label, note })), kinds: [],
};
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
        layerAlphas: [1, 0.8, 0.5], outlineWidth: 0.6, outlineOpacity: 0.55, lineCap: 'round', lineJoin: 'round' },
      { id: 'triple-tight', label: '3단 · 촘촘하게', strokeWidth: 2.2, pathWidth: 14, chevronRise: 4.5, chevronOffset: 5,
        layerAlphas: [1, 0.8, 0.5], outlineWidth: 0.6, outlineOpacity: 0.55, lineCap: 'round', lineJoin: 'round' },
      { id: 'triple-tight-large', label: '선택 · 10% 확대', sizeScale: 1.1, strokeWidth: 2.42, pathWidth: 15.4, chevronRise: 4.95, chevronOffset: 5.5,
        layerAlphas: [1, 0.8, 0.5], outlineWidth: 0.66, outlineOpacity: 0.55, lineCap: 'round', lineJoin: 'round' },
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
    const paletteReference = `palette-reference/${kind}.png`;
    const referenceBytes = await readFile(new URL(paletteReference, here));
    const paletteTable = await page.evaluate(sampleArtworkPalette, `data:image/png;base64,${referenceBytes.toString('base64')}`);
    const selectedSymbol = symbolVariants.find(variant => variant.id === manifest.releaseSymbolPreview.selectedVariant);
    const materialReference = `material-reference/${kind}.png`;
    const materialBytes = await readFile(new URL(materialReference, here));
    const materialCrop = JSON.parse(await readFile(new URL('material-reference/crops.json', here), 'utf8'))[kind];
    const originalMaterialFile = selectedSymbol.file.slice(7);
    const materialCandidate = await emit(`release-${kind}-material-body`, releaseMaterialArtwork(await read(originalMaterialFile.replace('.png', '@2x.png')), materialBytes, materialCrop), {
      nativeSource: releaseMaterialArtwork(await read(originalMaterialFile), materialBytes, materialCrop),
      role: `${kind} 릴리즈 · 3번 어두운 홈·4번 명암 면·5번 가로빛 완화`,
      sourceFiles: [selectedSymbol.file, selectedSymbol.file.replace('.png', '@2x.png'), materialReference, 'material-reference/prompts.json', 'material-reference/crops.json'],
      operation: { parts: [3, 4, 5], materialReference, referenceSha256: createHash('sha256').update(materialBytes).digest('hex'), ...materialCrop,
        preserve: 'original pixels outside requested regions, chevron size and alignment, center highlight core', symbolVariant: selectedSymbol.id },
      approval: 'proposed-artwork',
    });
    manifest.releaseMaterialPreview.kinds.push({ kind, original: selectedSymbol.file, candidate: materialCandidate,
      point: kind === 'single' ? 'assets/note-single.png' : 'assets/note-double-anodized-contrast-070.png',
      idleBody: kind === 'single' ? 'assets/body-single.png' : 'assets/body-double-center-dual-beam.png', heldBody: `assets/body-${kind}-held.png`,
    });
    const bodyFile = kind === 'single' ? 'body-single.png' : 'body-double-center-dual-beam.png';
    const bodyBytes = await read(bodyFile);
    const darkColor = await page.evaluate(async ({ dataUrl, x }) => {
      const image = new Image(); image.src = dataUrl; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = 200; canvas.height = 40;
      const context = canvas.getContext('2d'); context.drawImage(image, 0, 0, 200, 40);
      return [...context.getImageData(x, 20, 1, 1).data].slice(0, 3);
    }, { dataUrl: `data:image/png;base64,${bodyBytes.toString('base64')}`, x: kind === 'single' ? 92 : 100 });
    const whiteLayers = await page.evaluate(splitReleaseHighlight, `data:image/png;base64,${pngSources[2].toString('base64')}`);
    const nativeWhiteLayers = await page.evaluate(splitReleaseHighlight, `data:image/png;base64,${pngSources[1].toString('base64')}`);
    const wideVariants = [];
    for (const whiteOpacity of manifest.releaseWideMaterialPreview.whiteLightAlphas) {
      const id = String(whiteOpacity * 100).padStart(3, '0');
      const options = { ...materialCrop, darkColor, whiteOpacity };
      const file = await emit(`release-${kind}-material-wide-light-${id}`, releaseChevron(releaseWideMaterialArtwork(pngSources[2], materialBytes, whiteLayers, options), { kind, centers: symbolCenters, ...selectedSymbol }), {
        nativeSource: releaseChevron(releaseWideMaterialArtwork(pngSources[1], materialBytes, nativeWhiteLayers, options), { kind, centers: symbolCenters, ...selectedSymbol }),
        role: `${kind} 릴리즈 · 넓은 중앙 면 어둡게 + 원래 폭의 흰빛 ${whiteOpacity * 100}%`,
        sourceFiles: [...sourceFiles, `assets/${bodyFile}`, materialReference, 'material-reference/crops.json'],
        operation: { darkSurface: 'central-face', darkColor, whiteOpacity, whiteLight: 'estimated source-over layer from original flattened pixels; fixed image and geometry', preserve: 'selected chevron geometry and 100/80/50 alpha; original stripe dimensions', symbolVariant: selectedSymbol.id },
        approval: 'proposed-artwork',
      });
      wideVariants.push({ id, label: `흰빛 ${whiteOpacity * 100}%`, whiteOpacity, file });
    }
    manifest.releaseWideMaterialPreview.kinds.push({ kind, original: selectedSymbol.file, previous: materialCandidate, variants: wideVariants, darkColor,
      point: kind === 'single' ? 'assets/note-single.png' : 'assets/note-double-anodized-contrast-070.png', idleBody: `assets/${bodyFile}`, heldBody: `assets/body-${kind}-held.png`,
    });
    const candidate = await emit(`release-${kind}-palette-point`, releaseChevron(paletteMappedArtwork(source, paletteTable), { kind, centers: symbolCenters, ...selectedSymbol }), {
      nativeSource: releaseChevron(paletteMappedArtwork(nativeSource, paletteTable), { kind, centers: symbolCenters, ...selectedSymbol }),
      role: `${kind} 릴리즈 · 포인트 팔레트에 맞춘 색 시안`,
      sourceFiles: [...sourceFiles, paletteReference, 'palette-reference/prompts.json'],
      operation: { paletteReference, paletteReferenceSha256: createHash('sha256').update(referenceBytes).digest('hex'), paletteSamples: paletteTable.length,
        preserve: 'sRGB weighted intensity, alpha, geometry, selected chevrons', symbolVariant: selectedSymbol.id },
      approval: 'proposed-artwork',
    });
    manifest.releasePalettePreview.kinds.push({ kind, original: selectedSymbol.file, candidate,
      point: kind === 'single' ? 'assets/note-single.png' : 'assets/note-double-anodized-contrast-070.png',
      idleBody: kind === 'single' ? 'assets/body-single.png' : 'assets/body-double-center-dual-beam.png',
      heldBody: `assets/body-${kind}-held.png`, paletteReference,
    });
    const originals = {
      point: kind === 'single' ? 'assets/note-single.png' : 'assets/note-double-anodized-contrast-070.png',
      idleBody: kind === 'single' ? 'assets/body-single.png' : 'assets/body-double-center-dual-beam.png',
      heldBody: `assets/body-${kind}-held.png`, release: selectedSymbol.file,
    };
    const anchorVariants = [{ id: 'original', label: '기존 조합', ...originals }];
    for (const [anchor, label] of [['point', '포인트 기준'], ['release', '기존 릴리즈 기준'], ['body', '기존 바디 기준']]) {
      const referenceFile = anchor === 'point' ? paletteReference : anchor === 'release' ? sourceFiles[1] : originals.idleBody;
      const bytes = anchor === 'point' ? referenceBytes : await readFile(new URL(referenceFile, here));
      const table = anchor === 'point' ? paletteTable : await page.evaluate(sampleArtworkPalette, `data:image/png;base64,${bytes.toString('base64')}`);
      const variant = { id: anchor, label, ...originals };
      for (const [role, prefix] of [['point', 'note'], ['idleBody', 'body'], ['heldBody', 'body-held'], ['release', 'release']]) {
        if (role === anchor || (anchor === 'body' && role.endsWith('Body'))) continue;
        if (anchor === 'point' && role === 'release') { variant.release = candidate; continue; }
        const width = role === 'point' ? 212 : 200;
        const sourceFile = originals[role];
        const svgFile = sourceFile.replace('.png', '.svg');
        const originalSource = role === 'release' ? source : (await readFile(new URL(svgFile, here))).toString();
        const native = role === 'release' ? nativeSource : rasterArtwork(await readFile(new URL(sourceFile, here)), width);
        const recolor = input => {
          const artwork = paletteMappedArtwork(input, table, { width });
          return role === 'release' ? releaseChevron(artwork, { kind, centers: symbolCenters, ...selectedSymbol }) : artwork;
        };
        variant[role] = await emit(`${prefix}-${kind}-palette-${anchor}`, recolor(originalSource), {
          nativeSource: recolor(native), width,
          role: `${kind} ${role} · ${label} 색 시안`, sourceFiles: [...(role === 'release' ? sourceFiles : []), sourceFile, svgFile, referenceFile],
          operation: { anchor, role, referenceFile, referenceSha256: createHash('sha256').update(bytes).digest('hex'),
            paletteSamples: table.length, preserve: 'sRGB weighted intensity, alpha, geometry', symbolVariant: role === 'release' ? selectedSymbol.id : null },
          approval: 'proposed-artwork',
        });
      }
      anchorVariants.push(variant);
    }
    manifest.paletteAnchorPreview.kinds.push({ kind, variants: anchorVariants });
    if (kind === 'double') {
      const original = anchorVariants.find(variant => variant.id === 'body').release;
      const reference = 'beam-end-reference/double.png';
      const referenceBytes = await readFile(new URL(reference, here));
      const geometry = JSON.parse(await readFile(new URL('beam-end-reference/crop.json', here), 'utf8'));
      const file = await emit('release-double-palette-body-dual-ends', releaseBeamEndsArtwork(await readFile(new URL(original.replace('.png', '@2x.png'), here)), referenceBytes, geometry), {
        nativeSource: releaseBeamEndsArtwork(await readFile(new URL(original, here)), referenceBytes, geometry),
        role: '더블 릴리즈 · 두 광선 끝에 맞춘 흰빛 두 지점',
        sourceFiles: [original, original.replace('.png', '@2x.png'), reference, 'beam-end-reference/prompts.json', 'beam-end-reference/crop.json'],
        operation: { ...geometry, reference, referenceSha256: createHash('sha256').update(referenceBytes).digest('hex'), preserve: 'original pixels outside lower central rim, chevrons, selected body palette and alpha' },
        approval: 'proposed-artwork',
      });
      manifest.releaseBeamEndPreview = {
        approval: 'proposed-artwork', targetSize: [200, 40], beamCenters: geometry.beamCenters,
        original, candidate: file, point: originals.point, idleBody: originals.idleBody, heldBody: originals.heldBody,
        note: '바디에 맞춘 릴리즈 색 방향을 유지. 중앙 흰빛 하나를 x=84·116의 두 광선 끝으로 나누며 싱글은 기존 한 지점을 유지.',
      };
    }
    const junctionOriginal = kind === 'double' ? manifest.releaseBeamEndPreview.candidate : anchorVariants.find(variant => variant.id === 'body').release;
    const junctionReference = `junction-reference/${kind}.png`;
    const junctionBytes = await readFile(new URL(junctionReference, here));
    const junctionGeometry = JSON.parse(await readFile(new URL('junction-reference/crops.json', here), 'utf8'))[kind];
    const junctionCandidate = await emit(`release-${kind}-stepped-junctions`, releaseSteppedJunctionArtwork(await readFile(new URL(junctionOriginal.replace('.png', '@2x.png'), here)), junctionBytes, junctionGeometry), {
      nativeSource: releaseSteppedJunctionArtwork(await readFile(new URL(junctionOriginal, here)), junctionBytes, junctionGeometry),
      role: `${kind} 릴리즈 · 가로 띠와 경사 테두리의 짧은 단차 옆면`,
      sourceFiles: [junctionOriginal, junctionOriginal.replace('.png', '@2x.png'), junctionReference, 'junction-reference/prompts.json', 'junction-reference/crops.json', 'junction-reference/explanation.png'],
      operation: { ...junctionGeometry, junctions2x: [[104, 42], [296, 42]], patchBounds2x: [[82, 22, 45, 44], [273, 22, 45, 44]], referenceSha256: createHash('sha256').update(junctionBytes).digest('hex'), preserve: 'original pixels outside junctions, chevrons, palette, beam-end hotspots and alpha' },
      approval: 'proposed-artwork',
    });
    manifest.releaseJunctionPreview.kinds.push({ kind, original: junctionOriginal, candidate: junctionCandidate, point: originals.point, idleBody: originals.idleBody, heldBody: originals.heldBody });
    const forkReference = `fork-reference/${kind}.png`;
    const forkBytes = await readFile(new URL(forkReference, here));
    const forkGeometry = JSON.parse(await readFile(new URL('fork-reference/crops.json', here), 'utf8'))[kind];
    const forkCandidate = await emit(`release-${kind}-forked-junctions`, releaseForkedJunctionArtwork(await readFile(new URL(junctionOriginal.replace('.png', '@2x.png'), here)), forkBytes, forkGeometry), {
      nativeSource: releaseForkedJunctionArtwork(await readFile(new URL(junctionOriginal, here)), forkBytes, forkGeometry),
      role: `${kind} 릴리즈 · 아래 수평 경계의 실제 두 갈래 접점`,
      sourceFiles: [junctionOriginal, junctionOriginal.replace('.png', '@2x.png'), forkReference, 'fork-reference/prompts.json', 'fork-reference/crops.json', 'fork-reference/guide.png'],
      operation: { ...forkGeometry, vertices2x: [[99, 47], [301, 47]], patchBounds2x: [[87, 32, 43, 47], [270, 32, 43, 47]], referenceSha256: createHash('sha256').update(forkBytes).digest('hex'), preserve: 'original upper white bar, central icons, beam-end highlights, pixels outside lower junctions and alpha' },
      approval: 'proposed-artwork',
    });
    manifest.releaseForkPreview.kinds.push({ kind, original: junctionOriginal, previous: junctionCandidate, candidate: forkCandidate, point: originals.point, idleBody: originals.idleBody, heldBody: originals.heldBody });
    const cleanReference = `clean-fork-reference/${kind}.png`;
    const cleanBytes = await readFile(new URL(cleanReference, here));
    const cleanCandidate = await emit(`release-${kind}-clean-junctions`, releaseCleanJunctionArtwork(await readFile(new URL(forkCandidate.replace('.png', '@2x.png'), here)), cleanBytes), {
      nativeSource: releaseCleanJunctionArtwork(await readFile(new URL(forkCandidate, here)), cleanBytes),
      role: `${kind} 릴리즈 · 세 면의 꼭짓점에서 기존 교차 사선 제거`,
      sourceFiles: [forkCandidate, forkCandidate.replace('.png', '@2x.png'), cleanReference, 'clean-fork-reference/prompts.json', `clean-fork-reference/${kind}-target.png`],
      operation: { crop2x: [80, 20, 50, 50], patchBounds2x: [[82, 26, 27, 24], [291, 26, 27, 24]], mirroredRight: true, referenceSha256: createHash('sha256').update(cleanBytes).digest('hex'), preserve: 'original pixels outside obsolete diagonal edges, icons, beam-end highlights, outline and alpha' },
      approval: 'proposed-artwork',
    });
    manifest.releaseCleanForkPreview.kinds.push({ kind, previous: forkCandidate, candidate: cleanCandidate, point: originals.point, idleBody: originals.idleBody, heldBody: originals.heldBody });
    const straightReference = `straight-junction-reference/${kind}.png`;
    const straightBytes = await readFile(new URL(straightReference, here));
    const straightCandidate = await emit(`release-${kind}-straight-junctions`, releaseStraightJunctionArtwork(await readFile(new URL(junctionOriginal.replace('.png', '@2x.png'), here)), straightBytes, kind), {
      nativeSource: releaseStraightJunctionArtwork(await readFile(new URL(junctionOriginal, here)), straightBytes, kind),
      role: `${kind} 릴리즈 · 세 면의 꼭짓점과 원본 직선 테두리`,
      sourceFiles: [junctionOriginal, junctionOriginal.replace('.png', '@2x.png'), straightReference, 'straight-junction-reference/prompts.json', `straight-junction-reference/${kind}-original.png`, `straight-junction-reference/${kind}-previous.png`],
      operation: { ...straightJunctionGeometry[kind], crop2x: [80, 20, 50, 50], patchBounds2x: [[82, 30, 30, 19], [288, 30, 30, 19]], mirroredRight: true, referenceSha256: createHash('sha256').update(straightBytes).digest('hex'), preserve: 'original straight inner rim, upper white bar, lower diagonal below y=49, pixels outside local face, icons, highlights and alpha' },
      approval: 'proposed-artwork',
    });
    manifest.releaseStraightJunctionPreview.kinds.push({ kind, original: junctionOriginal, previous: cleanCandidate, candidate: straightCandidate, point: originals.point, idleBody: originals.idleBody, heldBody: originals.heldBody });
    const horizontalReference = `horizontal-junction-reference/${kind}.png`;
    const horizontalBytes = await readFile(new URL(horizontalReference, here));
    const horizontalGeometry = JSON.parse(await readFile(new URL('horizontal-junction-reference/geometry.json', here), 'utf8'))[kind];
    const horizontalOptions = { geometry: horizontalGeometry, treatment: 'horizontal-surface-seam' };
    const horizontalCandidate = await emit(`release-${kind}-horizontal-junctions`, releaseStraightJunctionArtwork(await readFile(new URL(junctionOriginal.replace('.png', '@2x.png'), here)), horizontalBytes, kind, horizontalOptions), {
      nativeSource: releaseStraightJunctionArtwork(await readFile(new URL(junctionOriginal, here)), horizontalBytes, kind, horizontalOptions),
      role: `${kind} 릴리즈 · 아래 접점 경계의 수평 연결`,
      sourceFiles: [junctionOriginal, junctionOriginal.replace('.png', '@2x.png'), horizontalReference, 'horizontal-junction-reference/prompts.json', 'horizontal-junction-reference/geometry.json', `straight-junction-reference/${kind}-original.png`],
      operation: { ...horizontalGeometry, crop2x: [80, 20, 50, 50], patchBounds2x: [[82, 30, 30, 19], [288, 30, 30, 19]], mirroredRight: true, referenceSha256: createHash('sha256').update(horizontalBytes).digest('hex'), preserve: 'original straight rim, upper white bar, lower diagonal below y=49, pixels outside local face, icons, highlights and alpha' },
      approval: 'proposed-artwork',
    });
    manifest.releaseHorizontalJunctionPreview.kinds.push({ kind, previous: straightCandidate, candidate: horizontalCandidate, point: originals.point, idleBody: originals.idleBody, heldBody: originals.heldBody });
    const simpleReference = `simple-frame-reference/${kind}.png`;
    const simpleBytes = await readFile(new URL(simpleReference, here));
    const simpleGeometry = JSON.parse(await readFile(new URL('simple-frame-reference/geometry.json', here), 'utf8'))[kind];
    const simpleCandidate = await emit(`release-${kind}-simple-frame`, releaseChevron(releaseSimpleFrameArtwork(simpleBytes, simpleGeometry), { kind, centers: symbolCenters, ...selectedSymbol }), {
      role: `${kind} 릴리즈 · 넓은 면과 끝 띠로 단순화한 시안`,
      sourceFiles: [simpleReference, 'simple-frame-reference/prompts.json', 'simple-frame-reference/geometry.json', horizontalCandidate, originals.point, originals.idleBody],
      operation: { ...simpleGeometry, referenceSha256: createHash('sha256').update(simpleBytes).digest('hex'), symbolVariant: selectedSymbol.id, symbolCenters, preserve: 'selected vector chevron geometry and 100/80/50 alpha; point and body originals unchanged' },
      approval: 'proposed-artwork',
    });
    manifest.releaseSimpleFramePreview.kinds.push({ kind, previous: horizontalCandidate, candidate: simpleCandidate, point: originals.point, idleBody: originals.idleBody, heldBody: originals.heldBody, symbolCenters });
    const simplifiedReference = `simplified-original-reference/${kind}.png`;
    const simplifiedBytes = await readFile(new URL(simplifiedReference, here));
    const simplifiedGeometry = JSON.parse(await readFile(new URL('simplified-original-reference/geometry.json', here), 'utf8'))[kind];
    const simplifiedCandidate = await emit(`release-${kind}-simplified-original`, releaseSimplifiedOriginalArtwork(await readFile(new URL(horizontalCandidate.replace('.png', '@2x.png'), here)), simplifiedBytes, simplifiedGeometry), {
      nativeSource: releaseSimplifiedOriginalArtwork(await readFile(new URL(horizontalCandidate, here)), simplifiedBytes, simplifiedGeometry),
      role: `${kind} 릴리즈 · 원래 중앙 구조를 보존하고 양옆 장식만 단순화`,
      sourceFiles: [horizontalCandidate, horizontalCandidate.replace('.png', '@2x.png'), simplifiedReference, 'simplified-original-reference/prompts.json', 'simplified-original-reference/geometry.json'],
      operation: { ...simplifiedGeometry, referenceSha256: createHash('sha256').update(simplifiedBytes).digest('hex'), mirroredRight: true, protectedCenter2x: [[90, 0], [310, 0], [282, 80], [118, 80]], preserve: 'original central face, sloping rim, chevrons, beam-end highlights and alpha; replace outer wings only' },
      approval: 'proposed-artwork',
    });
    manifest.releaseSimplifiedOriginalPreview.kinds.push({ kind, previous: horizontalCandidate, candidate: simplifiedCandidate, point: originals.point, idleBody: originals.idleBody, heldBody: originals.heldBody });
    const celKind = { kind, original: simplifiedCandidate, point: originals.point, idleBody: originals.idleBody, heldBody: originals.heldBody, variants: [] };
    for (const variant of celVariants) {
      const reference = `cel-balance-reference/${variant.id}-${kind}.png`;
      const bytes = await readFile(new URL(reference, here));
      const geometry = variant.kinds[kind];
      const artwork = original => releaseChevron(releaseCelBalanceArtwork(original, bytes, geometry), { kind, centers: symbolCenters, ...selectedSymbol });
      const file = await emit(`release-${kind}-cel-${variant.id}`, artwork(await readFile(new URL(simplifiedCandidate.replace('.png', '@2x.png'), here))), {
        nativeSource: artwork(await readFile(new URL(simplifiedCandidate, here))),
        role: `${kind} 릴리즈 · ${variant.label}`,
        sourceFiles: [simplifiedCandidate, simplifiedCandidate.replace('.png', '@2x.png'), reference, 'cel-balance-reference/prompts.json', 'cel-balance-reference/variants.json'],
        operation: { ...geometry, referenceSha256: createHash('sha256').update(bytes).digest('hex'), symbolVariant: selectedSymbol.id, symbolCenters, preserve: 'approved outer alpha, U rim and beam-end highlights; identical selected chevron vectors; replace painted faces only' },
        approval: 'proposed-artwork',
      });
      celKind.variants.push({ id: variant.id, label: variant.label, file });
    }
    manifest.releaseCelBalancePreview.kinds.push(celKind);
    const balanceVariants = [{ id: 'original', label: '기존 조합', ...originals }];
    for (const treatment of [
      { id: 'gentle', label: 'A · 원색을 더 살림', bodyAmount: .2, releaseAmount: .45 },
      { id: 'unified', label: 'B · 색 차이를 더 줄임', bodyAmount: .35, releaseAmount: .65 },
    ]) {
      const variant = { ...treatment, ...originals };
      for (const [role, prefix] of [['idleBody', 'body'], ['heldBody', 'body-held'], ['release', 'release']]) {
        const amount = role === 'release' ? treatment.releaseAmount : treatment.bodyAmount;
        const sourceFile = originals[role];
        const svgFile = sourceFile.replace('.png', '.svg');
        const originalSource = role === 'release' ? source : (await readFile(new URL(svgFile, here))).toString();
        const native = role === 'release' ? nativeSource : rasterArtwork(await readFile(new URL(sourceFile, here)));
        const recolor = input => {
          const artwork = paletteMappedArtwork(input, paletteTable, { amount });
          return role === 'release' ? releaseChevron(artwork, { kind, centers: symbolCenters, ...selectedSymbol }) : artwork;
        };
        variant[role] = await emit(`${prefix}-${kind}-balance-${treatment.id}`, recolor(originalSource), {
          nativeSource: recolor(native), role: `${kind} ${role} · 포인트 고정 ${treatment.label}`,
          sourceFiles: [...(role === 'release' ? sourceFiles : []), sourceFile, svgFile, paletteReference],
          operation: { balance: treatment.id, role, amount, paletteReference,
            preserve: 'point original, sRGB weighted intensity, alpha, geometry', symbolVariant: role === 'release' ? selectedSymbol.id : null },
          approval: 'proposed-artwork',
        });
      }
      balanceVariants.push(variant);
    }
    manifest.paletteBalancePreview.kinds.push({ kind, variants: balanceVariants });
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
