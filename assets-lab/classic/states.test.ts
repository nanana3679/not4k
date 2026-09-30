import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildClassicAssets, CLASSIC_SOURCE_NAMES, RUNTIME_ASSET_MAP } from './states.mjs';
import { brightBodyState } from './bright-body.mjs';
import { AVAILABLE_SKINS } from '../../src/game/skin/skins';
import { COLORS as EDITOR_COLORS } from '../../src/editor/timeline/constants';

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

  it.each(['single', 'double'])('%s 포인트는 흰 레일 안쪽 검은 세로띠·바깥 외곽선이 없는 흰빛 중앙 면 원본을 그대로 쓴다', kind => {
    expect(assets[`note-${kind}`]).toBe(sources[`point-${kind}`]);
    expect(sources[`point-${kind}`]).toContain('viewBox="0 0 1060 200"');
    expect(sources[`point-${kind}`]).toContain('data-side-panels="bright" data-contrast-band="point-bright"');
  });

  it.each(['single', 'double'])('%s 대기 바디는 imagegen 세로 트렌치 1000×200 타일을 색 변경 없이 포함한다', kind => {
    const idle = assets[`body-${kind}-idle`];
    const png = Buffer.from(idle.match(/data:image\/png;base64,([^"]+)/)![1], 'base64');
    expect(png.equals(readFileSync(new URL(`./revisions/body-trench-20260930/tiles/trench-${kind}-1000x200.png`, import.meta.url)))).toBe(true);
    expect(idle).toBe(sources[`body-${kind}-bright`]);
    expect(idle).toContain('data-design="trench-imagegen-20260930"');
    expect(idle).not.toContain('filter=');
    expect(idle).not.toContain('data-layer="emission"');
  });

  it('트릴 접촉 그림자는 1000×200 마름모 포인트 위아래 50단위(5px) 여백에서 테두리를 따라 옅어지고 포인트 영역은 비운다', () => {
    const svg = assets['point-contact-shadow-trill'];
    expect(RUNTIME_ASSET_MAP.pointContactShadowTrill).toBe('point-contact-shadow-trill');
    expect(svg).toContain('viewBox="0 0 1000 300"');
    expect(svg).toContain('data-reach="50" data-peak="0.7" data-inset="10"');
    // 포인트 마름모(M0 100 500 0 1000 100 500 200Z)를 50단위 내린 자리에서 테두리 10단위 안쪽을 마스크로 비운다.
    // 불투명한 포인트의 안티에일리어싱 가장자리 밑에도 가장 짙은 그림자가 남는다.
    expect(svg).toMatch(/<path d="M(\d+\.?\d*) 150 500 (\d+\.?\d*) (\d+\.?\d*) 150 500 (\d+\.?\d*)Z" fill="#000"\/>/);
    const [, cutLeft, cutTop, cutRight, cutBottom] = svg.match(/<path d="M(\d+\.?\d*) 150 500 (\d+\.?\d*) (\d+\.?\d*) 150 500 (\d+\.?\d*)Z" fill="#000"\/>/)!.map(Number);
    expect(cutLeft).toBeCloseTo(51, 0);
    expect(cutRight).toBeCloseTo(949, 0);
    expect(cutTop).toBeCloseTo(60.2, 0);
    expect(cutBottom).toBeCloseTo(239.8, 0);
    const layers = [...svg.matchAll(/<path d="M(-?[\d.]+) 150 500 (-?[\d.]+) [^"]+" fill-opacity="([\d.]+)"\/>/g)]
      .map(([, left, top, opacity]) => ({ left: Number(left), top: Number(top), opacity: Number(opacity) }));
    expect(layers).toHaveLength(25);
    // 바깥 층부터 안쪽 층으로 그려 테두리에 가까울수록 겹친 층이 많아진다.
    for (let i = 1; i < layers.length; i++) expect(layers[i].top).toBeGreaterThan(layers[i - 1].top);
    const edgeCoverage = 1 - layers.reduce((rest, layer) => rest * (1 - layer.opacity), 1);
    expect(edgeCoverage).toBeCloseTo(0.7, 3);
    expect(layers[0].opacity).toBeLessThan(layers[layers.length - 1].opacity);
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

  it('트릴 포인트·대기 바디·실패 바디 런타임 상태는 기존 석영 원본을 유지한다', () => {
    expect(assets[RUNTIME_ASSET_MAP.noteTrill]).toBe(sources['point-trill']);
    expect(assets[RUNTIME_ASSET_MAP.bodyTrill]).toBe(sources['body-trill']);
    expect(assets[RUNTIME_ASSET_MAP.bodyTrillFailed]).toBe(sources['body-trill-failed']);
    expect(assets[RUNTIME_ASSET_MAP.noteTrillFailed]).toContain('data-artwork="trill-quartz-06"');
    expect(Object.keys(assets).some(name => name.startsWith('terminal-start-trill'))).toBe(false);
  });

  it('트릴 켜짐 바디는 반투명 사각 기둥 내부 조명(frosted-fill) 1000×200 타일을 색 변경 없이 내장한 원본을 쓴다', () => {
    const held = assets[RUNTIME_ASSET_MAP.bodyTrillHeld];
    expect(held).toBe(sources['body-trill-on-frosted']);
    expect(held).toContain('data-design="trill-on-frosted-fill-20261001"');
    expect(held).toContain('viewBox="0 0 1000 200"');
    const png = Buffer.from(held.match(/data:image\/png;base64,([^"]+)/)![1], 'base64');
    expect(png.equals(readFileSync(new URL('./revisions/trill-body-on-imagegen-20261001/tiles/frosted-fill-1000x200.png', import.meta.url)))).toBe(true);
  });

  it('트릴 끝 터미널 대기·켜짐·실패는 에디터 트릴 롱 끝과 같은 색(COLORS.TRILL_LONG_END)의 납작한 마름모 원본 하나를 함께 쓴다', () => {
    const editor = sources['terminal-end-trill-editor'];
    const fill = EDITOR_COLORS.TRILL_LONG_END.toString(16).padStart(6, '0');
    expect(editor).toContain(`<path d="M0 100 500 0 1000 100 500 200Z" fill="#${fill}"/>`);
    expect(editor).not.toContain('<linearGradient');
    for (const key of ['terminalTrill', 'terminalTrillIdle', 'terminalTrillFailed'] as const) {
      expect(assets[RUNTIME_ASSET_MAP[key]], key).toBe(editor);
    }
  });

  it('석영 미리보기 생성기가 쓰는 석영 켜짐 바디·끝 터미널 원본 4개는 Classic 빌드 입력에서 빠져 덮어써도 Classic 트릴 켜짐 바디·끝 터미널이 바뀌지 않는다', () => {
    for (const name of ['body-trill-on', 'terminal-end-trill', 'terminal-end-trill-on', 'terminal-end-trill-failed']) {
      expect(CLASSIC_SOURCE_NAMES).not.toContain(name);
      expect(readFileSync(new URL(`./sources/${name}.svg`, import.meta.url), 'utf8')).toContain('data-artwork="trill-quartz-06"');
    }
  });

  it('전체 런타임 매핑의 SVG를 생성하고 Grace는 터미널 바깥 120단위 여백을 유지한다', () => {
    for (const source of Object.values(RUNTIME_ASSET_MAP)) expect(assets[source], source).toBeTruthy();
    expect(assets['terminal-grace-overlay']).toContain('viewBox="0 0 1240 440"');
    expect(assets['terminal-grace-overlay']).toContain('data-max-alpha="0.8"');
    expect(assets['terminal-grace-overlay']).toContain('data-fade-distance="100"');
  });
});
