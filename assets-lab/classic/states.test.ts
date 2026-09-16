import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bodyState, buildClassicAssets, CLASSIC_SOURCE_NAMES, RUNTIME_ASSET_MAP, terminalState } from './states.mjs';
import { AVAILABLE_SKINS } from '../../src/game/skin/skins';

const sources = Object.fromEntries(CLASSIC_SOURCE_NAMES.map(name => [name, readFileSync(new URL(`./sources/${name}.svg`, import.meta.url), 'utf8')]));

describe('Classic 에셋 상태', () => {
  it('선택 가능한 스킨의 모든 에셋은 Lab 경로에 의존하지 않고 public에 실제 PNG로 존재한다', () => {
    for (const skin of AVAILABLE_SKINS) {
      for (const path of Object.values(skin.assets).flat()) {
        expect(path, skin.theme.id).not.toMatch(/^\/lab\//);
        const png = readFileSync(new URL(`../../public${path}`, import.meta.url));
        expect([...png.subarray(0, 8)], path).toEqual([137,80,78,71,13,10,26,10]);
      }
    }
  });
  it('트릴8개 런타임 상태는 흰 포인트와 바디·끝 터미널의 대기·켜짐·실패 원본을 각각 사용', () => {
    const assets = buildClassicAssets(sources);
    expect(assets[RUNTIME_ASSET_MAP.noteTrill]).toBe(sources['point-trill']);
    expect(assets[RUNTIME_ASSET_MAP.bodyTrill]).toBe(sources['body-trill']);
    expect(assets[RUNTIME_ASSET_MAP.bodyTrillHeld]).toBe(sources['body-trill-on']);
    expect(assets[RUNTIME_ASSET_MAP.bodyTrillFailed]).toBe(sources['body-trill-failed']);
    expect(assets[RUNTIME_ASSET_MAP.terminalTrill]).toBe(sources['terminal-end-trill-on']);
    expect(assets[RUNTIME_ASSET_MAP.terminalTrillFailed]).toBe(sources['terminal-end-trill-failed']);
    expect(assets[RUNTIME_ASSET_MAP.terminalTrillIdle]).toBe(sources['terminal-end-trill']);
    for (const key of ['noteTrillFailed', 'bodyTrillFailed', 'terminalTrillFailed'] as const) {
      const svg = assets[RUNTIME_ASSET_MAP[key]];
      expect(svg).toContain('data-artwork="trill-quartz-06"');
      expect(svg).toContain('viewBox="0 0 1000 200"');
      for (const [, hex] of svg.matchAll(/#([0-9a-f]{6})(?=")/gi)) {
        expect(hex.slice(0, 2)).toBe(hex.slice(2, 4));
        expect(hex.slice(2, 4)).toBe(hex.slice(4, 6));
      }
    }
    expect(Object.keys(assets).some(name => name.startsWith('terminal-start-trill'))).toBe(false);
  });
  it('확정 싱글 시작 SVG가 있으면 재생성하지 않고 그대로 사용하며 바디도 확정본을 사용', () => {
    const assets=buildClassicAssets(sources);
    expect(assets['terminal-start-single']).toBe(sources['terminal-start-single']);
    expect(assets['body-single-on']).toBe(sources['body-single-dark']);
    expect(assets['terminal-start-single']).toContain('data-artwork="penpot-20260915-r2"');
    expect(assets['body-single-on']).toContain('data-artwork="penpot-20260915-r2"');
  });
  it('더블 시작 SVG도 독립 원본으로 읽어 싱글과 같은 수정 디자인을 이전 생성기로 덮어쓰지 않는다', () => {
    expect(CLASSIC_SOURCE_NAMES).toContain('terminal-start-double');
    const assets = buildClassicAssets(sources);
    expect(assets['terminal-start-double']).toBe(sources['terminal-start-double']);
    expect(assets['terminal-start-double']).toContain('data-artwork="penpot-20260915-r2-double"');
    expect(assets['body-double-on']).toBe(sources['body-double-dark']);
  });
  it('확정 싱글의 대기 상태는 중앙광과 번짐만 끄고 외곽 발광과 금속을 유지', () => {
    const assets=buildClassicAssets(sources);
    for(const [name,count] of [['body-single-idle',2],['terminal-start-single-idle',3],['terminal-end-single-idle',3]] as const){
      const svg=assets[name];
      const whites=[...svg.matchAll(/<g\b[^>]*data-light="white"[^>]*>/g)].map(match=>match[0]);
      expect(whites).toHaveLength(count);
      expect(whites.every(group=>group.includes('opacity="0"'))).toBe(true);
      expect(svg).toContain('data-light="spill"');
      expect(svg).toContain('data-layer="metal"');
    }
  });
  it('확정 싱글 실패 상태는 바디·양 끝 터미널에서 발광을 없애고 남은 색을 무채색으로 변환', () => {
    const assets=buildClassicAssets(sources);
    for(const name of ['body-single-off','terminal-start-single-failed','terminal-end-single-failed']){
      const svg=assets[name];
      expect(svg).not.toContain('data-layer="emission"');
      for(const [,hex] of svg.matchAll(/#([0-9a-f]{6})(?=")/gi))expect([hex.slice(0,2),hex.slice(2,4),hex.slice(4,6)]).toEqual([hex.slice(0,2),hex.slice(0,2),hex.slice(0,2)]);
    }
  });
  it('대기 바디는 흰빛만 끄고 양쪽 고유색 발광과 금속 레이어를 유지', () => {
    const idle = bodyState(sources['body-double-dark'], 'idle');
    expect(idle).toContain('<g opacity="0" data-light="white">');
    expect(idle).toContain('<g data-light="yellow">');
    expect(idle.replace('<g opacity="0" data-light="white">','<g data-light="white">')).toBe(sources['body-double-dark']);
  });
  it('더블 부분 실패는 좌우 방향 없이 노란 발광을 끄고 56단위 흰빛을 유지', () => {
    const partial = bodyState(sources['body-double-dark'], 'partial-off');
    expect(partial).not.toContain('<g data-light="yellow">');
    expect(partial).not.toContain('<g data-light="spill">');
    expect(partial).toContain('x="472" y="0" width="56" height="200" fill="#fcfeff"');
  });
  it('실패 바디와 터미널은 발광을 제거하고 모든 고유색을 무채색으로 변환', () => {
    const terminal = buildClassicAssets(sources)['terminal-double'];
    for(const svg of [bodyState(sources['body-double-dark'],'off'), terminalState(terminal,'failed')]) {
      expect(svg).not.toContain('data-layer="emission"');
      for(const [,hex] of svg.matchAll(/#([0-9a-f]{6})(?=")/gi)) {
        expect(hex.slice(0,2)).toBe(hex.slice(2,4));
        expect(hex.slice(2,4)).toBe(hex.slice(4,6));
      }
    }
  });
  it('노트1060×200을 유지하고 바디와 터미널을 같은1000×200으로 생성', () => {
    const assets = buildClassicAssets(sources);
    expect(assets['note-single']).toBe(sources['point-single']);
    expect(assets['note-double']).toBe(sources['point-double']);
    expect(assets['body-single-on']).toContain('viewBox="0 0 1000 200"');
    expect(assets['terminal-double']).toContain('viewBox="0 0 1000 200"');
    for(const source of Object.values(RUNTIME_ASSET_MAP)) expect(assets[source]).toBeTruthy();
  });
  it('Grace overlay는 터미널1000×200 바깥에120단위 여백을 더해1240×440으로 생성', () => {
    const svg = buildClassicAssets(sources)['terminal-grace-overlay'];
    expect(svg).toContain('viewBox="0 0 1240 440"');
    expect(svg).toContain('data-max-alpha="0.8"');
    expect(svg).toContain('data-fade-distance="100"');
  });
});
