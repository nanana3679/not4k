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
      if (role === 'sustain') {
        if (kind === 'double') {
          const unitStates = [];
          for (const side of ['left', 'right']) {
            const remainingSide = side === 'left' ? 'right' : 'left';
            const file = await transform(`${role}-${kind}-unit-${remainingSide}`, normal, { onlySide: remainingSide });
            states.push({ id: `partial-success-${side}`, label: `${side === 'left' ? '왼쪽' : '오른쪽'} 성공 · 해당 표식 숨김`, file, alpha: 1, hiddenSide: side });
            unitStates.push({ id: `unit-${remainingSide}`, label: `${remainingSide === 'left' ? '왼쪽' : '오른쪽'} 몫`, file, alpha: 1, unitIndex: remainingSide === 'left' ? 0 : 1 });
          }
          layers.push({ id: `${role}-layers`, role, kind, label: '유지 · 남은 몫', targetSize: [200, 40], body: selection.heldBody, states: unitStates.sort((a, b) => a.unitIndex - b.unitIndex) });
        }
        states.push({ id: 'success', label: '모두 성공 · 숨김', file: normal, alpha: 0, aliasOf: 'pending' });
        groups.push({ id: `${role}-${kind}`, role, kind, label: `${kindName} 유지`, targetSize: [width, 40], body: selection.heldBody, states, grace: false });
        continue;
      }
      if (role === 'body') {
        states[0].id = 'idle';
        states.push({ id: 'held', label: '전체 유지', file: selection.heldBody, alpha: 1 });
      }
      const failed = await transform(`${role}-${kind}-failed`, normal, { failedSide: 'all' }, width);
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
        for (const item of states.filter(item => ['partial-success', 'success'].includes(item.id))) graceStates.push({ ...item, overlay, overlayAlpha: item.id === 'success' ? 0 : 1 });
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
    note: '현재 선택 도안의 파생본. 기존 stateGroups와 원본 파일은 이전 비교 기록으로 보존. 누름·릴리즈 일부 성공은 본체 전체 70%, Grace 외곽은 100%. 유지는 실패 에셋 없이 성공한 몫만 숨기고 남은 몫은 원래 위치·색·불투명도를 유지. 릴리즈 성공·실패 혼합의 최종 합성은 기존 미정 사항을 따름.',
    generatedFiles: generated, groups, graceOverlays, graceGroups, layers,
  };
  manifest.buildContract.currentStatePreview = 'selectedStatePreview';
  manifest.buildContract.confirmedDisplay.sustain = { failedAsset: false, partialSuccess: 'hide-successful-unit', remainingUnitAlpha: 1, successHidden: true };
  manifest.buildContract.unapproved = manifest.buildContract.unapproved.filter(item => !['더블 유지 표식 각 32px 확대·어두운 윤곽선', '릴리즈 중앙 꺾쇠 표시', '유지 노트의 성공·실패 표시 방식과 수명'].includes(item));
  if (!manifest.buildContract.unapproved.includes('유지 노트의 실패 시 표시 수명')) manifest.buildContract.unapproved.push('유지 노트의 실패 시 표시 수명');
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
