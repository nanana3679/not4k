import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildClassicAssets, CLASSIC_SOURCE_NAMES, RUNTIME_ASSET_MAP } from './states.mjs';
import { brightBodyState } from './bright-body.mjs';
import { AVAILABLE_SKINS } from '../../src/game/skin/skins';

const sources = Object.fromEntries(CLASSIC_SOURCE_NAMES.map(name => [name, readFileSync(new URL(`./sources/${name}.svg`, import.meta.url), 'utf8')]));
const assets = buildClassicAssets(sources);

describe('Classic 선택 에셋 상태', () => {
  it('선택 가능한 스킨의 모든 에셋은 Lab 경로에 의존하지 않고 public에 실제 PNG로 존재한다', () => {
    for (const skin of AVAILABLE_SKINS) {
      for (const path of Object.values(skin.assets).flat()) {
        expect(path, skin.theme.id).not.toMatch(/^\/lab\//);
        const png = readFileSync(new URL(`../../public${path}`, import.meta.url));
        expect([...png.subarray(0, 8)], path).toEqual([137,80,78,71,13,10,26,10]);
      }
    }
  });

  it.each(['single', 'double'])('%s 포인트는 가운데 분할을 제거한 기존 고채도 SVG와 일치한다', kind => {
    const selected = readFileSync(new URL(`./revisions/body-six-20260929/selected/point-${kind}.svg`, import.meta.url), 'utf8');
    expect(assets[`note-${kind}`]).toBe(selected);
    expect(selected).toContain('viewBox="0 0 1060 200"');
  });

  it.each(['single', 'double'])('%s 대기 바디는 선택한 아주 밝은 200×40 PNG를 색 변경 없이 포함한다', kind => {
    const idle = assets[`body-${kind}-idle`];
    const png = Buffer.from(idle.match(/data:image\/png;base64,([^"]+)/)![1], 'base64');
    expect(png).toEqual(readFileSync(new URL(`./revisions/body-six-20260929/selected/body-${kind}-200x40.png`, import.meta.url)));
    expect(idle).toBe(sources[`body-${kind}-bright`]);
    expect(idle).not.toContain('filter=');
    expect(idle).not.toContain('data-layer="emission"');
  });

  it('더블 1/2 충족은 중앙 흰빛만 켜고 2/2 충족은 주변 빛까지 켠다', () => {
    const partial = assets['body-double-partial-off'];
    const held = assets['body-double-on'];
    expect(partial).toContain('data-light="white" x="472" width="56"');
    expect(partial).not.toContain('data-light="spill"');
    expect(held).toContain('data-light="white"');
    expect(held).toContain('data-light="spill"');
    expect(assets[RUNTIME_ASSET_MAP.bodyDoublePartialHeldLeft]).toBe(partial);
    expect(assets[RUNTIME_ASSET_MAP.bodyDoublePartialHeldRight]).toBe(partial);
    expect(assets[RUNTIME_ASSET_MAP.bodyDoublePartialFailedLeft]).toBe(partial);
    expect(assets[RUNTIME_ASSET_MAP.bodyDoublePartialFailedRight]).toBe(partial);
  });

  it.each(['single', 'double'])('%s 실패 바디는 발광 없이 원본 재질을 무채색·45% 밝기로 표시한다', kind => {
    const failed = assets[`body-${kind}-off`];
    expect(failed).toContain('type="saturate" values="0"');
    expect(failed).toContain('slope="0.45"');
    expect(failed).not.toContain('data-layer="emission"');
  });

  it('밝은 바디에 정의하지 않은 unknown 상태를 요청하면 오류를 반환한다', () => {
    expect(() => brightBodyState(sources['body-single-bright'], 'unknown')).toThrow('Unknown bright body state');
  });

  it('트릴 8개 런타임 상태는 기존 석영 포인트·바디·터미널 원본을 유지한다', () => {
    expect(assets[RUNTIME_ASSET_MAP.noteTrill]).toBe(sources['point-trill']);
    expect(assets[RUNTIME_ASSET_MAP.bodyTrill]).toBe(sources['body-trill']);
    expect(assets[RUNTIME_ASSET_MAP.bodyTrillHeld]).toBe(sources['body-trill-on']);
    expect(assets[RUNTIME_ASSET_MAP.bodyTrillFailed]).toBe(sources['body-trill-failed']);
    expect(assets[RUNTIME_ASSET_MAP.terminalTrill]).toBe(sources['terminal-end-trill-on']);
    expect(assets[RUNTIME_ASSET_MAP.terminalTrillIdle]).toBe(sources['terminal-end-trill']);
    expect(assets[RUNTIME_ASSET_MAP.terminalTrillFailed]).toBe(sources['terminal-end-trill-failed']);
    expect(assets[RUNTIME_ASSET_MAP.noteTrillFailed]).toContain('data-artwork="trill-quartz-06"');
    expect(Object.keys(assets).some(name => name.startsWith('terminal-start-trill'))).toBe(false);
  });

  it('전체 런타임 매핑의 SVG를 생성하고 Grace는 터미널 바깥 120단위 여백을 유지한다', () => {
    for (const source of Object.values(RUNTIME_ASSET_MAP)) expect(assets[source], source).toBeTruthy();
    expect(assets['terminal-grace-overlay']).toContain('viewBox="0 0 1240 440"');
    expect(assets['terminal-grace-overlay']).toContain('data-max-alpha="0.8"');
    expect(assets['terminal-grace-overlay']).toContain('data-fade-distance="100"');
  });
});
