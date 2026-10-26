import { readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { rasterArtwork, stateArtwork } from './state-artwork.mjs';

const generator = 'build-selected-states.mjs';
const roles = ['point', 'body', 'release', 'sustain'];
const roleNames = { point: '누름', body: '바디', release: '릴리즈', sustain: '유지' };
const sizeSvg = (source, width, height) => source.replace(/\bwidth="[\d.]+"/, `width="${width}"`).replace(/\bheight="[\d.]+"/, `height="${height}"`);

// Crop full-canvas artwork, keeping each unit in its original coordinates.
function bodyHalves(idle, held, side, failed) {
  const idleHalf = stateArtwork(idle, { onlySide: side, ...(failed ? { failedSide: 'all' } : {}) });
  const heldHalf = stateArtwork(held, { onlySide: side === 'left' ? 'right' : 'left' });
  const uniqueHeld = heldHalf.replaceAll('state-', 'held-state-');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="40" viewBox="0 0 200 40">${idleHalf}${uniqueHeld}</svg>`;
}

function graceComposite(body, overlay, width) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width + 48}" height="88" viewBox="0 0 ${width + 48} 88">${overlay}<g transform="translate(24 24)">${body}</g></svg>`;
}

export async function buildSelectedStates({ here, manifest, page }) {
  manifest.assets = manifest.assets.filter(asset => asset.generator !== generator);
  const read = file => readFile(new URL(file, here));
  const raster = async (file, scale, width = 200, height = 40) => rasterArtwork(await read(file.replace('.png', scale === 2 ? '@2x.png' : '.png')), width, height);
  const generated = [];
  async function emit(name, sources, { width = 200, height = 40, sourceFiles, operation, padding = [0, 0, 0, 0] }) {
    const variants = [{ suffix: '.svg', bytes: Buffer.from(sources[2]), width, height }];
    for (const scale of [1, 2]) {
      const data = await page.evaluate(async ({ source, width, height, scale }) => {
        const image = new Image(); image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(source); await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = width * scale; canvas.height = height * scale;
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/png').split(',')[1];
      }, { source: sources[scale], width, height, scale });
      variants.push({ suffix: scale === 1 ? '.png' : '@2x.png', bytes: Buffer.from(data, 'base64'), width: width * scale, height: height * scale });
    }
    for (const variant of variants) {
      const file = `assets/selected-${name}${variant.suffix}`;
      await writeFile(new URL(file, here), variant.bytes);
      generated.push(file);
      manifest.assets.push({ file, role: `선택 팔레트 · ${name}`, generator, sourceFiles: [...sourceFiles, generator, 'state-artwork.mjs'], operation,
        approval: 'proposed-state-treatment', skinKey: null, proposedRuntimePath: null,
        width: variant.width, height: variant.height, targetSize: [width, height], padding,
        bytes: variant.bytes.length, sha256: createHash('sha256').update(variant.bytes).digest('hex') });
    }
    return `assets/selected-${name}.png`;
  }
  const sourcePair = file => [file, file.replace('.png', '@2x.png')];
  async function transform(name, file, treatment, width = 200) {
    const sources = {};
    for (const scale of [1, 2]) sources[scale] = stateArtwork(await raster(file, scale, width), { width, ...treatment });
    return emit(name, sources, { width, sourceFiles: sourcePair(file), operation: { ...treatment, sourceResolution: 'matching native / 2x selected PNG; SVG embeds 2x' } });
  }

  const groups = [];
  const graceGroups = [];
  const layers = [];
  const pointOverlaySource = sizeSvg((await read('assets/point-grace-overlay.svg')).toString(), 260, 88);
  const pointOverlay = await emit('point-grace-overlay', { 1: pointOverlaySource, 2: pointOverlaySource }, {
    width: 260, height: 88, padding: [24, 24, 24, 24], sourceFiles: ['assets/point-grace-overlay.svg'],
    operation: { overlayOnly: true, silhouette: 'existing chamfered point contour', colorInvariant: true },
  });
  const graceOverlays = { point: pointOverlay, release: 'assets/release-grace-overlay.png' };
  for (const selection of manifest.selectedPalettePreview.kinds) {
    const kind = selection.kind;
    const kindName = kind === 'single' ? '싱글' : '더블';
    for (const role of roles) {
      const width = role === 'point' ? 212 : 200;
      const normal = role === 'body' ? selection.idleBody : selection[role];
      const states = [{ id: 'pending', label: role === 'body' ? '대기' : '정상', file: normal, alpha: 1 }];
      const failed = await transform(`${role}-${kind}-failed`, normal, { failedSide: 'all' }, width);
      if (role === 'sustain') {
        if (kind === 'double') {
          const unitStates = [];
          for (const side of ['left', 'right']) {
            const remainingSide = side === 'left' ? 'right' : 'left';
            const sideLabel = side === 'left' ? '왼쪽' : '오른쪽';
            states.push({ id: `partial-failed-${side}`, label: `${sideLabel} 실패`, file: await transform(`${role}-${kind}-partial-failed-${side}`, normal, { failedSide: side }), alpha: 1 });
            const file = await transform(`${role}-${kind}-unit-${remainingSide}`, normal, { onlySide: remainingSide });
            const failedFile = await transform(`${role}-${kind}-unit-${remainingSide}-failed`, failed, { onlySide: remainingSide });
            states.push({ id: `partial-success-${side}`, label: `${sideLabel} 성공 · 해당 표식 숨김`, file, alpha: 1, hiddenSide: side });
            states.push({ id: `success-${side}-failed-${remainingSide}`, label: `${sideLabel} 성공 · 반대쪽 실패`, file: failedFile, alpha: 1, hiddenSide: side });
            unitStates.push({ id: `unit-${remainingSide}`, label: `${remainingSide === 'left' ? '왼쪽' : '오른쪽'} 몫`, file, alpha: 1, unitIndex: remainingSide === 'left' ? 0 : 1 });
            unitStates.push({ id: `unit-${remainingSide}-failed`, label: `${remainingSide === 'left' ? '왼쪽' : '오른쪽'} 몫 · 실패`, file: failedFile, alpha: 1, unitIndex: remainingSide === 'left' ? 0 : 1 });
          }
          layers.push({ id: `${role}-layers`, role, kind, label: '유지 · 남은 몫', targetSize: [200, 40], body: selection.heldBody, states: unitStates.sort((a, b) => a.unitIndex - b.unitIndex) });
        }
        states.push({ id: 'failed', label: '전체 실패 · 화면 밖까지 잔류', file: failed, alpha: 1 });
        states.push({ id: 'success', label: '모두 성공 · 숨김', file: normal, alpha: 0, aliasOf: 'pending' });
        groups.push({ id: `${role}-${kind}`, role, kind, label: `${kindName} 유지`, targetSize: [width, 40], body: selection.heldBody, states, grace: false });
        continue;
      }
      if (role === 'body') {
        states[0].id = 'idle';
        states.push({ id: 'held', label: '전체 유지', file: selection.heldBody, alpha: 1 });
      }
      if (kind === 'double' && role !== 'point') {
        for (const side of ['left', 'right']) {
          const sideLabel = side === 'left' ? '왼쪽' : '오른쪽';
          if (role === 'body') {
            for (const isFailed of [false, true]) {
              const sources = {};
              for (const scale of [1, 2]) sources[scale] = bodyHalves(await raster(normal, scale), await raster(selection.heldBody, scale), side, isFailed);
              const id = `partial-${isFailed ? 'failed' : 'held'}-${side}`;
              states.push({ id, label: `${sideLabel} ${isFailed ? '실패' : '미충족'}`, alpha: 1,
                file: await emit(`${role}-${kind}-${id}`, sources, { sourceFiles: [...sourcePair(normal), ...sourcePair(selection.heldBody)], operation: { inactiveSide: side, failed: isFailed, activeSide: side === 'left' ? 'right' : 'left', composition: 'selected idle / held halves' } }) });
            }
          } else {
            const id = `partial-failed-${side}`;
            states.push({ id, label: `${sideLabel} 실패`, file: await transform(`${role}-${kind}-${id}`, normal, { failedSide: side }), alpha: 1 });
          }
        }
      }
      states.push({ id: 'failed', label: '전체 실패', file: failed, alpha: 1 });
      if (kind === 'double' && (role === 'point' || role === 'release')) states.push({ id: 'partial-success', label: '일부 성공 · 전체 70%', file: normal, alpha: .7, aliasOf: 'pending' });
      if (kind === 'double' && role === 'release') for (const side of ['left', 'right']) {
        const failedSide = side === 'left' ? 'right' : 'left';
        const partialFailed = states.find(state => state.id === `partial-failed-${failedSide}`);
        states.push({ id: `success-${side}-failed-${failedSide}`, label: `${side === 'left' ? '왼쪽' : '오른쪽'} 성공 · 반대쪽 실패 · 전체 70%`, file: partialFailed.file, alpha: .7, aliasOf: partialFailed.id });
      }
      if (role === 'point' || role === 'release') states.push({ id: 'success', label: '모두 성공 · 숨김', file: normal, alpha: 0, aliasOf: 'pending' });
      groups.push({ id: `${role}-${kind}`, role, kind, label: `${kindName} ${roleNames[role]}`, targetSize: [width, 40], body: selection.heldBody, states, grace: role === 'point' || role === 'release' });

      if (role === 'point' || role === 'release') {
        const overlay = graceOverlays[role];
        const graceStates = [];
        for (const item of states.filter(item => item.id === 'pending' || item.id.startsWith('partial-failed'))) {
          const sources = {};
          for (const scale of [1, 2]) sources[scale] = graceComposite(await raster(item.file, scale, width), await raster(overlay, scale, width + 48, 88), width);
          const composite = await emit(`${role}-${kind}-${item.id}-grace`, sources, {
            width: width + 48, height: 88, padding: [24, 24, 24, 24], sourceFiles: [...sourcePair(item.file), ...sourcePair(overlay)],
            operation: { compositeOnce: true, fullOutline: true, padding: 24, bodyAlpha: 1, overlayAlpha: 1 },
          });
          graceStates.push({ ...item, overlay, overlayAlpha: 1, composite });
        }
        for (const item of states.filter(item => ['partial-success', 'success'].includes(item.id) || item.id.startsWith('success-'))) graceStates.push({ ...item, overlay, overlayAlpha: item.id === 'success' ? 0 : 1 });
        graceGroups.push({ id: `${role}-${kind}-grace`, role, kind, label: `${kindName} ${roleNames[role]} · Grace`, targetSize: [width, 40], overlaySize: [width + 48, 88], body: selection.heldBody, states: graceStates });
      }
      if (kind === 'double' && role === 'release') {
        const states = [];
        for (const side of ['left', 'right']) for (const isFailed of [false, true]) {
          const id = `unit-${side}${isFailed ? '-failed' : ''}`;
          const sourceFile = isFailed ? failed : normal;
          states.push({ id, label: `${side === 'left' ? '왼쪽' : '오른쪽'} 몫${isFailed ? ' · 실패' : ''}`, alpha: 1, unitIndex: side === 'left' ? 0 : 1,
            file: await transform(`${role}-${kind}-${id}`, sourceFile, { onlySide: side }) });
        }
        layers.push({ id: `${role}-layers`, role, kind, label: `${roleNames[role]} · 몫별 레이어`, targetSize: [200, 40], body: selection.heldBody, states });
      }
    }
  }
  manifest.selectedStatePreview = {
    source: 'selectedPalettePreview.kinds', sourceSelection: { ...manifest.paletteMixPreview.selectedAmountByKind },
    note: '현재 선택 도안의 파생본. 기존 stateGroups와 원본 파일은 이전 비교 기록으로 보존. 릴리즈 성공·실패 혼합은 부분 실패 도안 전체 70%, Grace 외곽 100%. 유지는 성공한 몫만 숨기고 대기 몫의 위치·크기·밝기를 유지하며, 종속 0점을 포함한 실패 몫은 실패색으로 화면 밖까지 남김. RFD 0037 §7의 확정 표시를 따름.',
    generatedFiles: generated, groups, graceOverlays, graceGroups, layers,
  };
  manifest.buildContract.currentStatePreview = 'selectedStatePreview';
  manifest.buildContract.confirmedDisplay.sourceDecision = 'https://github.com/nanana3679/not4k/blob/c1c440e5c4a0bfc595e3c493a67fe73d529754f1/docs/rfd/0037-explicit-score-notes-and-body.md#7-표시와-확정-효과';
  manifest.buildContract.confirmedDisplay.sustain = { failedAsset: true, partialSuccess: 'hide-successful-unit', remainingUnitAlpha: 1, successHidden: true };
  manifest.buildContract.confirmedDisplay.failedSustain = { when: 'failure-confirmed', includesDependentZero: true, hideWhen: 'scrolled-out', pendingFailureStyle: false };
  manifest.buildContract.confirmedDisplay.releaseMixedSuccessFailure = { artwork: 'partial-failed', bodyAlpha: .7, graceOverlayAlpha: 1 };
  manifest.buildContract.unapproved = manifest.buildContract.unapproved.filter(item => !['더블 유지 표식 각 32px 확대·어두운 윤곽선', '릴리즈 중앙 꺾쇠 표시', '유지 노트의 성공·실패 표시 방식과 수명', '유지 노트의 실패 시 표시 수명', '일부 성공·실패가 함께 확정된 더블 릴리즈의 최종 합성'].includes(item));
  const generatedFiles = new Set(generated);
  for (const file of await readdir(new URL('assets/', here))) {
    if (file.startsWith('selected-') && !generatedFiles.has(`assets/${file}`)) await unlink(new URL(`assets/${file}`, here));
  }
  return generated.length;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const here = new URL('./', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('manifest.json', here), 'utf8'));
  const browser = await chromium.launch({ headless: true });
  try {
    const count = await buildSelectedStates({ here, manifest, page: await browser.newPage() });
    await writeFile(new URL('manifest.json', here), JSON.stringify(manifest, null, 2) + '\n');
    console.log(`${count} selected-state exports; ${manifest.assets.length} assets total`);
  } finally { await browser.close(); }
}
