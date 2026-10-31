import { memo, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { ChartDocument, ChartTiming } from '../../shared';
import { isMainLane } from '../../shared';
import { minimapNoteRect } from '../../shared/minimapNote';
import { color, font, minimapColor, minimapSurface } from '../../shared/theme';
import { attachObserverMinimapDrag } from '../observer/observerMinimapDrag';
import { minimapOverlay, minimapTimeToY, MINIMAP_HANDLE_MARKER_WIDTH,
  OBSERVER_MINIMAP_EDGE_MARGIN, OBSERVER_MINIMAP_WIDTH } from '../observer/observerMinimapGeometry';
import type { ObserverRange } from '../observer/observerRepetitionPlan';
import type { ObserverPlayRuntime } from './ObserverPlayRuntime';

interface ObserverMinimapProps {
  document: ChartDocument;
  timing: ChartTiming;
  durationMs: number;
  range: ObserverRange;
  positionMs: number;
  runtime: RefObject<ObserverPlayRuntime | null>;
}

const width = OBSERVER_MINIMAP_WIDTH;
const cssColor = (value: number) => `#${value.toString(16).padStart(6, '0')}`;
const formatTime = (ms: number) => {
  const seconds = Math.floor(Math.max(0, ms) / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

/** 정적인 차트는 재생 위치 알림마다 다시 계산하지 않는다. 노트 수와 무관하게 색별 SVG path로 묶는다. */
const MinimapChart = memo(function MinimapChart({ document, timing, durationMs, height }:
  Pick<ObserverMinimapProps, 'document' | 'timing' | 'durationMs'> & { height: number }) {
  const toY = (ms: number) => minimapTimeToY(ms, durationMs, height);
  const beatToY = (beat: Parameters<ChartTiming['beatToMs']>[0]) => toY(timing.beatToMs(beat));
  const pathsByStyle = new Map<string, { color: number; alpha: number; path: string }>();
  for (const note of document.notes) {
    const rect = minimapNoteRect(note, beatToY, width / 4);
    if (!rect) continue;
    const key = `${rect.color}:${rect.alpha}`;
    const batch = pathsByStyle.get(key) ?? { color: rect.color, alpha: rect.alpha, path: '' };
    batch.path += `M${rect.x},${rect.y}h${rect.width}v${rect.height}h${-rect.width}z`;
    pathsByStyle.set(key, batch);
  }
  return <g aria-hidden="true" pointerEvents="none">
    <rect width={width} height={height} fill={minimapSurface.background} />
    {[0, 1, 2, 3].map(lane => <rect key={lane} x={lane * width / 4} width={width / 4} height={height}
      fill={cssColor(lane % 2 ? minimapColor.LANE_BG_ODD : minimapColor.LANE_BG_EVEN)} fillOpacity={0.4} />)}
    <path d={timing.measureStartsMs(durationMs).map(ms => `M0,${toY(ms)}h${width}`).join('')}
      stroke={minimapSurface.measure} fill="none" />
    {[...document.trillZones.map(zone => ({ zone, color: minimapColor.TRILL_ZONE, alpha: minimapColor.TRILL_ZONE_ALPHA })),
      ...(document.restZones ?? []).map(zone => ({ zone, color: minimapColor.REST_ZONE, alpha: minimapColor.REST_ZONE_ALPHA }))]
      .filter(({ zone }) => isMainLane(zone.lane)).map(({ zone, color, alpha }, index) =>
        <rect key={index} x={(zone.lane - 1) * width / 4} y={beatToY(zone.endBeat)} width={width / 4}
          height={Math.max(1, beatToY(zone.beat) - beatToY(zone.endBeat))} fill={cssColor(color)} fillOpacity={alpha} />)}
    {[...pathsByStyle.entries()].sort((a, b) => a[1].alpha - b[1].alpha).map(([key, batch]) =>
      <path key={key} d={batch.path} fill={cssColor(batch.color)} fillOpacity={batch.alpha} />)}
  </g>;
});

/** 기존 비행 배경 위 오른쪽 60px. 에디터 팔레트·아래→위 시간축에 A/B 핸들과 재생선만 더한다. */
export function ObserverMinimap({ document, timing, durationMs, range, positionMs, runtime }: ObserverMinimapProps) {
  const element = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(600);
  useEffect(() => {
    const host = element.current;
    if (!host) return;
    const resize = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) setHeight(entry.contentRect.height);
    });
    resize.observe(host);
    return () => resize.disconnect();
  }, []);
  useEffect(() => {
    const host = element.current;
    if (!host) return;
    const detach = attachObserverMinimapDrag(host, () => runtime.current, durationMs);
    // 좌표계가 바뀌면 기존 드래그를 마치고 새 높이에서 다음 down을 받는다.
    return detach;
  }, [runtime, durationMs, height]);
  const overlay = minimapOverlay(range, positionMs, durationMs, height);
  return <div ref={element} className="observer-minimap" role="group"
    aria-label={`Practice range ${formatTime(range.startMs)}–${formatTime(range.endMs)}, position ${formatTime(positionMs)}`}
    data-testid="observer-minimap" data-range-start-ms={range.startMs} data-range-end-ms={range.endMs}
    data-position-ms={positionMs} data-duration-ms={durationMs}
    style={{ position: 'absolute', top: OBSERVER_MINIMAP_EDGE_MARGIN, bottom: OBSERVER_MINIMAP_EDGE_MARGIN, right: OBSERVER_MINIMAP_EDGE_MARGIN, width, zIndex: 2,
      touchAction: 'none', userSelect: 'none' }}>
    <svg aria-hidden="true" width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none"
      style={{ display: 'block', overflow: 'hidden' }}>
      <title>Drag A or B to resize the range. Drag between them to move it.</title>
      <MinimapChart document={document} timing={timing} durationMs={durationMs} height={height} />
      <g pointerEvents="none">
        <rect data-testid="observer-minimap-range" x={0.5} y={overlay.top} width={width - 1} height={overlay.height}
          fill={minimapSurface.selection} stroke={minimapSurface.selectionBorder} />
        <g data-testid="observer-minimap-start" transform={`translate(0 ${overlay.startY})`}>
          <path d={`M0,0h${width}`} stroke={color.inkStrong} strokeWidth={2} />
          <rect y={-7} width={MINIMAP_HANDLE_MARKER_WIDTH} height={14} fill={color.inkStrong} />
          <text x={MINIMAP_HANDLE_MARKER_WIDTH / 2} y={4} textAnchor="middle" fontFamily={font.display} fontSize={11} fill={color.bg}>A</text>
        </g>
        <g data-testid="observer-minimap-end" transform={`translate(0 ${overlay.endY})`}>
          <path d={`M0,0h${width}`} stroke={color.inkStrong} strokeWidth={2} />
          <rect x={width - MINIMAP_HANDLE_MARKER_WIDTH} y={-7} width={MINIMAP_HANDLE_MARKER_WIDTH} height={14} fill={color.inkStrong} />
          <text x={width - MINIMAP_HANDLE_MARKER_WIDTH / 2} y={4} textAnchor="middle" fontFamily={font.display} fontSize={11} fill={color.bg}>B</text>
        </g>
        <path data-testid="observer-minimap-playhead" d={`M0,${overlay.playheadY}h${width}`}
          stroke={color.neon} strokeWidth={2} />
      </g>
    </svg>
  </div>;
}
