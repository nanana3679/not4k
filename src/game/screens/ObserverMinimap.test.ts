import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { beat, createChartTiming } from '../../shared';
import { explicitPlaytestCharts } from '../../lab/explicitPlaytestCharts';
import { color, minimapSurface } from '../../shared/theme';
import { ObserverMinimap } from './ObserverMinimap';

const document = { ...explicitPlaytestCharts[0].chart, notes: [
  { type: 'tap' as const, kind: 'double' as const, lane: 2, beat: beat(4) },
  { type: 'body' as const, holdCount: 1 as const, lane: 4, beat: beat(8), endBeat: beat(12) },
], events: [{ type: 'bpm' as const, beat: beat(0), bpm: 120 },
  { type: 'timeSignature' as const, beat: beat(0), beatPerMeasure: beat(4) }],
meta: { ...explicitPlaytestCharts[0].chart.meta, offsetMs: 0 } };
function render(positionMs = 12000, range = { startMs: 6000, endMs: 18000 }) {
  return renderToStaticMarkup(createElement(ObserverMinimap, { document, timing: createChartTiming(document),
    durationMs: 30000, range, positionMs, runtime: { current: null } }));
}
describe('ObserverMinimap 표시', () => {
  it('30초 곡의 6000～18000ms 선택은 높이 600px에서 y242.4·높이 230.4의 overlay와 A/B를 표시한다', () => {
    const html = render();
    expect(html).toContain('data-range-start-ms="6000" data-range-end-ms="18000"');
    const overlay = html.match(/data-testid="observer-minimap-range"[^>]+/)![0];
    expect(Number(overlay.match(/y="([^"]+)"/)![1])).toBeCloseTo(242.4);
    expect(Number(overlay.match(/height="([^"]+)"/)![1])).toBeCloseTo(230.4);
    expect(html).toContain(`fill="${minimapSurface.selection}"`);
    expect(html).toContain('>A</text>'); expect(html).toContain('>B</text>');
    expect(html).toContain('top:16px;bottom:16px;right:16px;width:60px;z-index:2');
  });
  it('현재 12000→15000ms 알림은 재생선을 y357.6→300으로 옮기고 L2·L4 원본 노트 path는 유지한다', () => {
    const before = render(); const after = render(15000);
    expect(before).toContain('data-testid="observer-minimap-playhead" d="M0,357.6h60"');
    expect(after).toContain(`data-testid="observer-minimap-playhead" d="M0,300h60" stroke="${color.neon}"`);
    const notes = (html: string) => [...html.matchAll(/<path[^>]*fill="#[^"]+"[^>]*>/g)].map(match => match[0]);
    expect(notes(before)).toHaveLength(2); expect(notes(after)).toEqual(notes(before));
    expect(before).toContain('fill="#ffcc00"'); expect(before).toContain('fill="#88bbff" fill-opacity="0.5"');
  });
  it('6000～18000ms 미니맵은 SVG를 숨기고 button·input·tabindex·키 단축키 없이 포인터 영역만 표시한다', () => {
    const html = render();
    expect(html).toContain('role="group" aria-label="Practice range 0:06–0:18, position 0:12"');
    expect(html).toMatch(/<svg\b[^>]*aria-hidden="true"/);
    expect(html).toContain('touch-action:none;user-select:none');
    expect(html).not.toMatch(/<button|<input|tabindex|aria-keyshortcuts/i);
  });
  it('6000～18000ms·현재 12000ms에서 구간을 9000～18000ms·현재 15000ms로 바꾸면 접근성 이름도 0:09–0:18·0:15로 갱신한다', () => {
    expect(render()).toContain('aria-label="Practice range 0:06–0:18, position 0:12"');
    expect(render(15000, { startMs: 9000, endMs: 18000 }))
      .toContain('aria-label="Practice range 0:09–0:18, position 0:15"');
  });
});
