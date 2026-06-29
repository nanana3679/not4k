/**
 * GridRenderer — 그리드/배경 렌더링 담당
 * TimelineRenderer에서 Composition 패턴으로 사용된다.
 */

import { Container, Graphics, Text, TextStyle } from "pixi.js";
import { beatToMs, measureStartBeat, beat, beatAdd, beatMulInt } from "../../shared";
import type { BpmMarker, TimeSignatureMarker } from "../../shared";
import {
  LANE_COUNT,
  LANE_WIDTH,
  NOTE_HEIGHT,
  TRILL_ZONE_HANDLE_SIZE,
  TRILL_ZONE_RESIZE_BAR_HEIGHT,
  TIMELINE_WIDTH,
  EXTRA_LANE_WIDTH,
  COLORS,
} from "./constants";
import { destroyChildren } from "./utils";

/** GridRenderer가 TimelineRenderer에서 필요로 하는 인터페이스 */
export interface GridHost {
  readonly chart: import("../../shared").Chart | null;
  readonly zoom: number;
  readonly snap: number;
  readonly extraLaneCount: number;
  readonly selectedTrillZones: ReadonlySet<number>;
  readonly currentTimelineWidth: number;
  readonly waveformPeaks: Float32Array | null;
  readonly waveformDurationMs: number;
  readonly cachedBpmMarkers: BpmMarker[];
  readonly cachedTimeSignatures: TimeSignatureMarker[];
  readonly measureLabelStyle: TextStyle | null;
  setMeasureLabelStyle(style: TextStyle): void;
  getVisibleTimeRange(): { minTimeMs: number; maxTimeMs: number };
  timeToY(timeMs: number): number;
  getTotalTimelineMs(): number;

  // Layer containers
  readonly laneBackgrounds: Container;
  readonly waveformLayer: Container;
  readonly measureLines: Container;
  readonly beatLines: Container;
  readonly snapLines: Container;
  readonly trillZoneLayer: Container;
  readonly measureLabels: Container;
}

export class GridRenderer {
  constructor(private host: GridHost) {}

  /**
   * 레인 배경 렌더링
   */
  renderLaneBackgrounds(): void {
    destroyChildren(this.host.laneBackgrounds);
    const chart = this.host.chart;

    const totalTimeMs = this.host.getTotalTimelineMs();
    const beat0Ms = chart ? chart.meta.offsetMs : 0;
    const topY = this.host.timeToY(totalTimeMs);
    const bottomY = this.host.timeToY(beat0Ms);
    const laneHeight = bottomY - topY;

    // Note lanes (L1~L4)
    for (let i = 0; i < LANE_COUNT; i++) {
      const bg = new Graphics();
      const color = i % 2 === 0 ? COLORS.LANE_BG_EVEN : COLORS.LANE_BG_ODD;
      bg.rect(i * LANE_WIDTH, topY, LANE_WIDTH, laneHeight);
      bg.fill(color);
      this.host.laneBackgrounds.addChild(bg);
    }

    // Extra lanes (editor-only, right of note lanes)
    const extraStartX = TIMELINE_WIDTH;
    for (let i = 0; i < this.host.extraLaneCount; i++) {
      const bg = new Graphics();
      const color = i % 2 === 0 ? COLORS.EXTRA_LANE_BG_EVEN : COLORS.EXTRA_LANE_BG_ODD;
      bg.rect(extraStartX + i * EXTRA_LANE_WIDTH, topY, EXTRA_LANE_WIDTH, laneHeight);
      bg.fill(color);
      this.host.laneBackgrounds.addChild(bg);
    }
  }

  /**
   * 파형 렌더링
   */
  renderWaveform(): void {
    if (!this.host.waveformPeaks || this.host.waveformDurationMs === 0) return;

    const laneAreaWidth = LANE_COUNT * LANE_WIDTH;
    const centerX = laneAreaWidth / 2;

    const peaks = this.host.waveformPeaks;
    const peakCount = peaks.length;

    let maxPeak = 0;
    for (let i = 0; i < peaks.length; i++) {
      if (peaks[i] > maxPeak) maxPeak = peaks[i];
    }
    const scale = maxPeak > 0 ? 1 / maxPeak : 1;

    const msPerPeak = this.host.waveformDurationMs / peakCount;

    const { minTimeMs, maxTimeMs } = this.host.getVisibleTimeRange();
    const startIdx = Math.max(0, Math.floor(minTimeMs / msPerPeak) - 1);
    const endIdx = Math.min(peakCount - 1, Math.ceil(maxTimeMs / msPerPeak) + 1);
    if (startIdx > endIdx) return;

    const waveform = new Graphics();

    waveform.moveTo(centerX, this.host.timeToY(startIdx * msPerPeak));

    for (let i = startIdx; i <= endIdx; i++) {
      const timeMs = i * msPerPeak;
      const y = this.host.timeToY(timeMs);
      const normalized = peaks[i] * scale;
      const x = centerX + (normalized * laneAreaWidth) / 2;
      waveform.lineTo(x, y);
    }

    for (let i = endIdx; i >= startIdx; i--) {
      const timeMs = i * msPerPeak;
      const y = this.host.timeToY(timeMs);
      const normalized = peaks[i] * scale;
      const x = centerX - (normalized * laneAreaWidth) / 2;
      waveform.lineTo(x, y);
    }

    waveform.lineTo(centerX, this.host.timeToY(startIdx * msPerPeak));
    waveform.fill({ color: 0x0078ff, alpha: 0.3 });

    this.host.waveformLayer.addChild(waveform);
  }

  /**
   * 그리드 선 렌더링 (마디선, 비트선, 스냅선)
   */
  renderGridLines(): void {
    const chart = this.host.chart;
    if (!chart) return;

    const bpmMarkers = this.host.cachedBpmMarkers;
    const timeSignatures = this.host.cachedTimeSignatures;
    const meta = chart.meta;
    if (bpmMarkers.length === 0 || timeSignatures.length === 0) return;

    const totalTimelineMs = this.host.getTotalTimelineMs();
    const sortedTS = [...timeSignatures].sort((a, b) => a.measure - b.measure);
    const { minTimeMs, maxTimeMs } = this.host.getVisibleTimeRange();

    // Ensure measureLabelStyle is created
    let measureLabelStyle = this.host.measureLabelStyle;
    if (!measureLabelStyle) {
      measureLabelStyle = new TextStyle({
        fontSize: 11,
        fill: 0x999999,
        fontFamily: "monospace",
      });
      this.host.setMeasureLabelStyle(measureLabelStyle);
    }

    for (let m = 0; ; m++) {
      const mStartBeat = measureStartBeat(m, timeSignatures);
      const mStartMs = beatToMs(mStartBeat, bpmMarkers, meta.offsetMs);
      if (mStartMs > totalTimelineMs || mStartMs > maxTimeMs) break;

      const nextMStartBeat = measureStartBeat(m + 1, timeSignatures);
      const nextMStartMs = beatToMs(nextMStartBeat, bpmMarkers, meta.offsetMs);
      if (nextMStartMs < minTimeMs) continue;

      const y = this.host.timeToY(mStartMs);

      // Measure line
      const line = new Graphics();
      line.moveTo(0, y);
      line.lineTo(this.host.currentTimelineWidth, y);
      line.stroke({ width: 2, color: COLORS.MEASURE_LINE });
      this.host.measureLines.addChild(line);

      // Measure number label (left side)
      const label = new Text({
        text: String(m + 1),
        style: measureLabelStyle,
      });
      label.anchor.set(1, 0);
      label.x = -4;
      label.y = y - 14;
      this.host.measureLabels.addChild(label);

      // Active beatPerMeasure for this measure
      let bpm = sortedTS[0].beatPerMeasure;
      for (const ts of sortedTS) {
        if (ts.measure <= m) bpm = ts.beatPerMeasure;
        else break;
      }

      const subdivBeat = beat(1, bpm.d);

      // Beat lines (skip the first = measure line)
      for (let b = 1; b < bpm.n; b++) {
        const bBeat = beatAdd(mStartBeat, beatMulInt(subdivBeat, b));
        const bMs = beatToMs(bBeat, bpmMarkers, meta.offsetMs);
        if (bMs > totalTimelineMs) break;

        const bY = this.host.timeToY(bMs);
        const beatLine = new Graphics();
        beatLine.moveTo(0, bY);
        beatLine.lineTo(this.host.currentTimelineWidth, bY);
        beatLine.stroke({ width: 1, color: COLORS.BEAT_LINE });
        this.host.beatLines.addChild(beatLine);
      }

      // Snap lines within this measure
      const measureBeats = bpm.n / bpm.d;
      const gridBeats = 4 / this.host.snap;
      const snapCount = Math.round(measureBeats / gridBeats);

      for (let s = 1; s < snapCount; s++) {
        if ((s * 4 * bpm.d) % this.host.snap === 0) continue;

        const snapBeatVal = beatAdd(mStartBeat, beat(s * 4, this.host.snap));
        const snapMs = beatToMs(snapBeatVal, bpmMarkers, meta.offsetMs);
        if (snapMs > totalTimelineMs) break;

        const snapY = this.host.timeToY(snapMs);
        const snapLine = new Graphics();
        snapLine.moveTo(0, snapY);
        snapLine.lineTo(this.host.currentTimelineWidth, snapY);
        snapLine.stroke({ width: 1, color: COLORS.SNAP_LINE, alpha: 0.3 });
        this.host.snapLines.addChild(snapLine);
      }
    }

    // End-of-audio marker line
    if (this.host.waveformDurationMs > 0 && this.host.waveformDurationMs >= minTimeMs && this.host.waveformDurationMs <= maxTimeMs) {
      const endY = this.host.timeToY(this.host.waveformDurationMs);
      const endLine = new Graphics();
      endLine.moveTo(0, endY);
      endLine.lineTo(this.host.currentTimelineWidth, endY);
      endLine.stroke({ width: 1, color: 0x66aaff, alpha: 0.5 });
      this.host.measureLines.addChild(endLine);
    }
  }

  /**
   * 마커 렌더링 (BPM/박자 마커, 이벤트 마커)
   */
  renderMarkers(noteLayer: Container, eventLabelStyle: TextStyle | null, setEventLabelStyle: (style: TextStyle) => void): void {
    const chart = this.host.chart;
    if (!chart) return;

    const bpmMarkers = this.host.cachedBpmMarkers;
    const { events, meta } = chart;
    const eventRenderBaseX = TIMELINE_WIDTH; // start of extra lanes
    const eventRenderWidth = EXTRA_LANE_WIDTH;
    const { minTimeMs, maxTimeMs } = this.host.getVisibleTimeRange();

    for (let i = 0; i < events.length; i++) {
      const evt = events[i];
      const col = (evt.editorLane ?? 1) - 1; // 1-based → 0-based
      const eventRenderX = eventRenderBaseX + col * EXTRA_LANE_WIDTH;

      const startMs = beatToMs(evt.beat, bpmMarkers, meta.offsetMs);
      const endMs = 'endBeat' in evt ? beatToMs(evt.endBeat, bpmMarkers, meta.offsetMs) : startMs;

      const lo = Math.min(startMs, endMs);
      const hi = Math.max(startMs, endMs);
      if (hi < minTimeMs || lo > maxTimeMs) continue;

      const startY = this.host.timeToY(startMs);
      const endY = this.host.timeToY(endMs);
      const rawHeight = Math.abs(endY - startY);
      const height = rawHeight > 0 ? rawHeight : NOTE_HEIGHT;
      const topY = rawHeight > 0 ? Math.min(startY, endY) : Math.min(startY, endY) - NOTE_HEIGHT / 2;
      const gfx = new Graphics();
      gfx.rect(eventRenderX, topY, eventRenderWidth, height);
      gfx.fill({ color: COLORS.EVENT_MARKER, alpha: 0.5 });
      gfx.stroke({ width: 1.5, color: 0xffbbdd, alpha: 0.6, alignment: 0 });
      noteLayer.addChild(gfx);

      const parts: string[] = [];
      if (evt.type === 'stop') parts.push('STOP');
      if (evt.type === 'bpm') parts.push(`BPM:${evt.bpm}`);
      if (evt.type === 'timeSignature') {
        const bp = evt.beatPerMeasure;
        parts.push(`TS:${bp.d === 1 ? bp.n : `${bp.n}/${bp.d}`}`);
      }
      if (evt.type === 'text') parts.push(evt.text);
      if (evt.type === 'auto') parts.push('AUTO');
      const displayText = parts.join(' | ') || '(empty)';
      if (!eventLabelStyle) {
        eventLabelStyle = new TextStyle({
          fontSize: 11,
          fill: 0xffffff,
          fontFamily: "monospace",
          wordWrap: true,
          wordWrapWidth: eventRenderWidth - 4,
        });
        setEventLabelStyle(eventLabelStyle);
      }
      const label = new Text({
        text: displayText,
        style: eventLabelStyle,
      });
      if (label.height > height) {
        const charsPerLine = Math.floor((eventRenderWidth - 4) / 7);
        const lines = Math.max(1, Math.floor(height / 13));
        const maxChars = charsPerLine * lines - 1;
        const truncated = displayText.length > maxChars ? displayText.slice(0, maxChars) + '\u2026' : displayText;
        label.text = truncated;
        label.style = new TextStyle({
          fontSize: 11,
          fill: 0xffffff,
          fontFamily: "monospace",
        });
      }
      label.anchor.set(0.5, 0.5);
      label.x = eventRenderX + eventRenderWidth / 2;
      label.y = topY + height / 2;
      noteLayer.addChild(label);
    }
  }

  /**
   * 트릴존 렌더링
   */
  renderTrillZones(): void {
    const chart = this.host.chart;
    if (!chart) return;

    const { trillZones, meta } = chart;
    const bpmMarkers = this.host.cachedBpmMarkers;
    const { minTimeMs, maxTimeMs } = this.host.getVisibleTimeRange();

    for (let i = 0; i < trillZones.length; i++) {
      const zone = trillZones[i];
      const startMs = beatToMs(zone.beat, bpmMarkers, meta.offsetMs);
      const endMs = beatToMs(zone.endBeat, bpmMarkers, meta.offsetMs);

      const lo = Math.min(startMs, endMs);
      const hi = Math.max(startMs, endMs);
      if (hi < minTimeMs || lo > maxTimeMs) continue;
      const startY = this.host.timeToY(startMs);
      const endY = this.host.timeToY(endMs);

      const x = (zone.lane - 1) * LANE_WIDTH;
      const width = LANE_WIDTH;
      const topY = Math.min(startY, endY);
      const rawHeight = Math.abs(endY - startY);
      const height = rawHeight > 0 ? rawHeight : NOTE_HEIGHT;
      const adjustedTopY = rawHeight > 0 ? topY : topY - NOTE_HEIGHT / 2;

      const selected = this.host.selectedTrillZones.has(i);

      const bg = new Graphics();
      bg.rect(x, adjustedTopY, width, height);
      bg.fill({ color: COLORS.TRILL_ZONE, alpha: COLORS.TRILL_ZONE_ALPHA });
      // 구간 단위로 선택된 트릴존은 선택 강조 테두리를 그린다
      if (selected) {
        bg.rect(x, adjustedTopY, width, height);
        bg.stroke({ color: COLORS.SELECTED_OUTLINE, width: 2 });
      }
      this.host.trillZoneLayer.addChild(bg);

      const handleColor = selected ? COLORS.SELECTED_OUTLINE : COLORS.TRILL_ZONE;

      // 끝점 리사이즈 핸들 (구간 끝=위쪽 가장자리의 얇은 수평 바 + 수직 양방향 화살표 ↕).
      // 끝 가장자리를 드래그하면 endBeat가 변경된다. ↕는 끝점이 세로(시간축)로만 늘어남을 알린다.
      const resizeBar = new Graphics();
      resizeBar.rect(x, endY - TRILL_ZONE_RESIZE_BAR_HEIGHT / 2, width, TRILL_ZONE_RESIZE_BAR_HEIGHT);
      resizeBar.fill({ color: handleColor, alpha: 0.95 });
      drawResizeIcon(resizeBar, x + width / 2, endY);
      this.host.trillZoneLayer.addChild(resizeBar);

      // 구간 단위 선택(이동) 핸들 마커 (구간 시작=아래쪽의 좌측 코너 + 그립 점 ⠿).
      // 끝의 리사이즈 바와 양 끝으로 분리해 동작을 구분한다. 클릭 시 구간 단위 선택, 드래그 시
      // 구간째 이동. 점 형태로 리사이즈 ↕와 구분된다.
      const handle = new Graphics();
      handle.rect(x, startY - TRILL_ZONE_HANDLE_SIZE / 2, TRILL_ZONE_HANDLE_SIZE, TRILL_ZONE_HANDLE_SIZE);
      handle.fill({ color: handleColor, alpha: 0.95 });
      drawMoveIcon(handle, x + TRILL_ZONE_HANDLE_SIZE / 2, startY);
      this.host.trillZoneLayer.addChild(handle);
    }
  }
}

/** 핸들 아이콘 색 — 밝은 핸들(초록/선택 시 빨강) 위에서 대비되는 어두운 색 */
const TRILL_HANDLE_ICON_COLOR = 0x07101f;

/**
 * 이동 핸들용 그립 점(⠿) 아이콘을 핸들 중심(cx, cy)에 그린다.
 * 2열 × 3행의 점으로 "잡아서 옮기는" 드래그 핸들임을 나타낸다(리사이즈 ↕와 형태로 구분).
 */
function drawMoveIcon(g: Graphics, cx: number, cy: number): void {
  const dx = 2.4; // 점 가로 간격(중심 기준)
  const dy = 3;   // 점 세로 간격
  const r = 1;    // 점 반지름
  for (const ox of [-dx, dx]) {
    for (const oy of [-dy, 0, dy]) {
      g.circle(cx + ox, cy + oy, r);
    }
  }
  g.fill({ color: TRILL_HANDLE_ICON_COLOR });
}

/**
 * 리사이즈 핸들용 수직 양방향 화살표(↕) 아이콘을 (cx, cy)에 그린다.
 * 끝점이 세로(시간축)로만 늘어남을 의미한다.
 */
function drawResizeIcon(g: Graphics, cx: number, cy: number): void {
  const a = 5;    // 화살표 절반 길이
  const hw = 3;   // 화살촉 반폭
  const hl = 2.5; // 화살촉 길이
  g.moveTo(cx, cy - a).lineTo(cx, cy + a);
  g.stroke({ color: TRILL_HANDLE_ICON_COLOR, width: 1.2 });
  g.poly([cx, cy - a - hl, cx - hw, cy - a, cx + hw, cy - a]); // 위 화살촉
  g.poly([cx, cy + a + hl, cx - hw, cy + a, cx + hw, cy + a]); // 아래 화살촉
  g.fill({ color: TRILL_HANDLE_ICON_COLOR });
}
