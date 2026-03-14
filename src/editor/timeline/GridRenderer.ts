/**
 * GridRenderer — 그리드/배경 렌더링 담당
 * TimelineRenderer에서 Composition 패턴으로 사용된다.
 */

import { Container, Graphics, Text, TextStyle } from "pixi.js";
import { beatToMs, measureStartBeat, beat, beatAdd, beatMulInt } from "../../shared";
import type { BpmMarker, TimeSignatureMarker } from "../../shared";
import {
  LANE_COUNT,
  AUXILIARY_LANES,
  LANE_WIDTH,
  AUX_LANE_WIDTH,
  NOTE_HEIGHT,
  TIMELINE_WIDTH,
  EXTRA_LANE_WIDTH,
  COLORS,
} from "./constants";

/** GridRenderer가 TimelineRenderer에서 필요로 하는 인터페이스 */
export interface GridHost {
  readonly chart: import("../../shared").Chart | null;
  readonly zoom: number;
  readonly snap: number;
  readonly extraLaneCount: number;
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

/** Container의 자식을 모두 destroy하고 제거 */
function destroyChildren(container: Container): void {
  for (const child of container.children) {
    child.destroy();
  }
  container.removeChildren();
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

    // Auxiliary lanes (event only)
    const auxStartX = LANE_COUNT * LANE_WIDTH;
    for (let i = 0; i < AUXILIARY_LANES; i++) {
      const bg = new Graphics();
      bg.rect(auxStartX + i * AUX_LANE_WIDTH, topY, AUX_LANE_WIDTH, laneHeight);
      bg.fill(COLORS.AUX_LANE_BG);
      this.host.laneBackgrounds.addChild(bg);
    }

    // Extra lanes (editor-only, right of event lane)
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
    const auxStartX = LANE_COUNT * LANE_WIDTH;
    const { minTimeMs, maxTimeMs } = this.host.getVisibleTimeRange();

    for (const evt of events) {
      const startMs = beatToMs(evt.beat, bpmMarkers, meta.offsetMs);
      const endMs = beatToMs(evt.endBeat, bpmMarkers, meta.offsetMs);

      const lo = Math.min(startMs, endMs);
      const hi = Math.max(startMs, endMs);
      if (hi < minTimeMs || lo > maxTimeMs) continue;

      const startY = this.host.timeToY(startMs);
      const endY = this.host.timeToY(endMs);
      const rawHeight = Math.abs(endY - startY);
      const height = rawHeight > 0 ? rawHeight : NOTE_HEIGHT;
      const topY = rawHeight > 0 ? Math.min(startY, endY) : Math.min(startY, endY) - NOTE_HEIGHT / 2;
      const gfx = new Graphics();
      gfx.rect(auxStartX, topY, AUX_LANE_WIDTH, height);
      gfx.fill({ color: COLORS.EVENT_MARKER, alpha: 0.5 });
      gfx.stroke({ width: 1.5, color: 0xffbbdd, alpha: 0.6, alignment: 0 });
      noteLayer.addChild(gfx);

      const parts: string[] = [];
      if (evt.stop) parts.push('STOP');
      if (evt.bpm !== undefined) parts.push(`BPM:${evt.bpm}`);
      if (evt.beatPerMeasure !== undefined) {
        const bp = evt.beatPerMeasure;
        parts.push(`TS:${bp.n}/${bp.d}`);
      }
      if (evt.text !== undefined) parts.push(evt.text);
      const displayText = parts.join(' | ') || '(empty)';
      if (!eventLabelStyle) {
        eventLabelStyle = new TextStyle({
          fontSize: 11,
          fill: 0xffffff,
          fontFamily: "monospace",
          wordWrap: true,
          wordWrapWidth: AUX_LANE_WIDTH - 4,
        });
        setEventLabelStyle(eventLabelStyle);
      }
      const label = new Text({
        text: displayText,
        style: eventLabelStyle,
      });
      if (label.height > height) {
        const charsPerLine = Math.floor((AUX_LANE_WIDTH - 4) / 7);
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
      label.x = auxStartX + AUX_LANE_WIDTH / 2;
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

    for (const zone of trillZones) {
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

      const bg = new Graphics();
      bg.rect(x, adjustedTopY, width, height);
      bg.fill({ color: COLORS.TRILL_ZONE, alpha: COLORS.TRILL_ZONE_ALPHA });
      this.host.trillZoneLayer.addChild(bg);
    }
  }
}
