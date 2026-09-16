import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { startTerminalSvg, endTerminalSvg } from './terminals.mjs';
import { buildClassicAssets, CLASSIC_SOURCE_NAMES } from './states.mjs';

const sources = Object.fromEntries(CLASSIC_SOURCE_NAMES.map(name => [name, readFileSync(new URL(`./sources/${name}.svg`, import.meta.url), 'utf8')]));
const assets = buildClassicAssets(sources);

describe('이음새 없는 Classic 터미널', () => {
  it.each(['single','double'])('%s을 1000×200으로 만들 때 중앙광·색면·금속 띠의 모든 대각선을 45도로 유지', flavor => {
    const svg = assets[`terminal-start-${flavor}`];
    let diagonals = 0;
    for (const [, path] of svg.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)) {
      let x = 0, y = 0, startX = 0, startY = 0;
      for (const [, command, args] of path.matchAll(/([A-Za-z])([^A-Za-z]*)/g)) {
        const numbers = args.trim().split(/[\s,]+/).map(Number);
        let nextX = x, nextY = y;
        switch (command) {
          case 'M': [x, y] = numbers; startX = x; startY = y; continue;
          case 'L': [nextX, nextY] = numbers; break;
          case 'H': [nextX] = numbers; break;
          case 'V': [nextY] = numbers; break;
          case 'Z': nextX = startX; nextY = startY; break;
          default: throw new Error(`각도 검증에서 지원하지 않는 명령: ${command}`);
        }
        const dx = Math.abs(nextX - x), dy = Math.abs(nextY - y);
        if (dx > 0 && dy > 0) {
          expect(dy, `${path}: (${x},${y})→(${nextX},${nextY})`).toBeCloseTo(dx, 8);
          diagonals++;
        }
        x = nextX; y = nextY;
      }
    }
    expect(diagonals).toBeGreaterThan(10);
    const bends = [...svg.matchAll(/transform="matrix\(([^)]+)\)"/g)];
    for (const [, matrix] of bends) {
      const [, , dx, dy] = matrix.trim().split(/[\s,]+/).map(Number);
      expect(Math.atan2(Math.abs(dy), Math.abs(dx)) * 180 / Math.PI).toBe(45);
    }
  });

  it.each(['single','double'])('%s 시작과 끝은 1000×200의 독립 벡터이며 끝은 시작을 정확히 상하반전', flavor => {
    const start = assets[`terminal-start-${flavor}`];
    const end = assets[`terminal-end-${flavor}`];
    expect(end).toBe(endTerminalSvg(start));
    for (const svg of [start, end]) {
      expect(svg).toContain('viewBox="0 0 1000 200"');
      expect(svg).not.toMatch(/<image\b|data:image|<foreignObject/);
      expect(svg).toContain('data-layer="terminal-finish"');
    }
    expect(start).toContain('data-open-edge="top"');
    expect(end).toContain('data-open-edge="bottom"');
    expect(end).toContain('transform="translate(0 200) scale(1 -1)"');
    expect(assets[`terminal-${flavor}`]).toBe(end);
  });

  it.each(['start','end'])('%s 더블의 흰빛을 그룹으로 나눠도 부분충족 시 양쪽 가장자리에서 노란색을 제거', direction => {
    const partial = assets[`terminal-${direction}-double-partial-off`];
    const white = sources['body-double-dark'].match(/<g data-light="white">[\s\S]*?<\/g>/)![0];
    // The approved double uses the body's same edge gradients for both the
    // V-shaped light and the open join, rather than a second reference layer.
    const ids = [...white.matchAll(/url\(#([^)]*)\)/g)].map(match => `terminal-double-${match[1]}`);
    expect(ids).toHaveLength(2);
    for (const id of ids) {
      const gradient = partial.match(new RegExp(`<linearGradient id="${id}"[\\s\\S]*?<\\/linearGradient>`))![0];
      const colors = [...gradient.matchAll(/stop-color="([^"]+)"/g)].map(match => match[1]);
      expect(colors, id).toEqual(['#ffffff', '#ffffff']);
    }
  });

  it.each(['start','end'])('%s 더블의 대기는 흰빛만 끄고 부분충족은 노란빛만 끄며 금속 마감을 보존', direction => {
    const prefix = `terminal-${direction}-double`;
    const idle = assets[`${prefix}-idle`];
    const partial = assets[`${prefix}-partial-off`];
    expect(idle).toContain('<g opacity="0" data-light="white">');
    const whiteGroups = [...idle.matchAll(/<g\b[^>]*data-light="white"[^>]*>/g)].map(match => match[0]);
    expect(whiteGroups).toHaveLength(2);
    expect(whiteGroups.every(group => group.includes('opacity="0"'))).toBe(true);
    expect(idle).toContain('<g data-light="yellow">');
    expect(partial).toContain('<g data-light="white">');
    expect(partial).not.toContain('data-light="yellow"');
    expect(partial).not.toContain('data-light="spill"');
    for (const state of ['', '-idle', '-partial-off', '-failed']) {
      expect(assets[prefix + state]).toContain('data-layer="terminal-finish"');
    }
  });

  it('1000×200 이외의 바디는 늘여 맞추지 않고 생성 오류를 반환', () => {
    expect(() => startTerminalSvg('<svg viewBox="0 0 1040 200"></svg>', 'single')).toThrow('1000×200');
  });
});
