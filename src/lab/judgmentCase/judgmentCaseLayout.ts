/** 판정 엔진에 의존하지 않는 사례 이미지 시간 축·텍스트 배치. */

export const MIN_GAP_PX = 22;
const TARGET_PLOT_PX = 720;
const MIN_AUTO_PX_PER_MS = 0.02;
const MAX_AUTO_PX_PER_MS = 1.2;
const MAX_GAP_PX = 220;

export interface CaseTimeAxis {
  /** 시각 t의 축 위치(px, 첫 주요 시각 = 0, 시간이 늦을수록 큼) */
  offsetOf(t: number): number;
  /** 첫 주요 시각 ~ 마지막 주요 시각의 높이(px) */
  height: number;
  keyTimes: number[];
  /** maxGapPx로 줄인 빈 구간(축에 물결 표시) */
  compressed: { startMs: number; endMs: number }[];
}

export interface CaseTimeAxisOptions {
  /** 인접 주요 시각 사이 최소 높이(px) */
  minGapPx?: number;
  /** 인접 주요 시각 사이 최대 높이(px). 넘는 빈 구간은 이 높이로 줄인다 */
  maxGapPx?: number;
}

/** 주요 시각 사이를 pxPerMs로 늘리되 인접 간격을 [minGapPx, maxGapPx]로 제한하는 구간별 선형 축 */
export function createCaseTimeAxis(times: readonly number[], pxPerMs: number, options: CaseTimeAxisOptions = {}): CaseTimeAxis {
  const minGapPx = options.minGapPx ?? MIN_GAP_PX;
  const maxGapPx = options.maxGapPx ?? Infinity;
  const keyTimes = [...new Set(times.filter((time) => Number.isFinite(time)))].sort((a, b) => a - b);
  const offsets = [0];
  const compressed: CaseTimeAxis["compressed"] = [];
  for (let i = 1; i < keyTimes.length; i++) {
    const linear = (keyTimes[i] - keyTimes[i - 1]) * pxPerMs;
    if (linear > maxGapPx) compressed.push({ startMs: keyTimes[i - 1], endMs: keyTimes[i] });
    offsets.push(offsets[i - 1] + Math.min(Math.max(linear, minGapPx), Math.max(maxGapPx, minGapPx)));
  }
  const offsetOf = (t: number): number => {
    if (keyTimes.length === 0) return t * pxPerMs;
    const last = keyTimes.length - 1;
    if (t <= keyTimes[0]) return (t - keyTimes[0]) * pxPerMs;
    if (t >= keyTimes[last]) return offsets[last] + (t - keyTimes[last]) * pxPerMs;
    let i = 0;
    while (keyTimes[i + 1] < t) i++;
    const ratio = (t - keyTimes[i]) / (keyTimes[i + 1] - keyTimes[i]);
    return offsets[i] + ratio * (offsets[i + 1] - offsets[i]);
  };
  return { offsetOf, height: offsets[offsets.length - 1] ?? 0, keyTimes, compressed };
}

/**
 * 자동 축: 빈 구간을 MAX_GAP_PX로 줄이고, 전체 높이가 TARGET_PLOT_PX를 넘지 않는 가장 큰 px/ms(최대 1.2)를 고른다.
 * 노트가 많아 최소 간격만으로 목표를 넘으면 가장 작은 배율을 쓴다.
 */
export function createAutoCaseTimeAxis(times: readonly number[]): CaseTimeAxis {
  const build = (pxPerMs: number) => createCaseTimeAxis(times, pxPerMs, { maxGapPx: MAX_GAP_PX });
  if (build(MAX_AUTO_PX_PER_MS).height <= TARGET_PLOT_PX) return build(MAX_AUTO_PX_PER_MS);
  let low = MIN_AUTO_PX_PER_MS;
  let high = MAX_AUTO_PX_PER_MS;
  for (let step = 0; step < 30; step++) {
    const middle = (low + high) / 2;
    if (build(middle).height <= TARGET_PLOT_PX) low = middle;
    else high = middle;
  }
  return build(low);
}

// ---------------------------------------------------------------------------
// 라벨 겹침 회피
// ---------------------------------------------------------------------------

/**
 * 1차원 라벨 위치를 겹치지 않게 벌린다. 겹치는 라벨 묶음은 원래 위치들의 평균을 중심으로
 * spacing 간격으로 쌓는다. 원래 순서(위치 오름차순, 같으면 입력 순서)는 유지하고 결과는 입력 순서로 돌려준다.
 *
 * sizes[i]는 라벨 i의 줄 수(기본 1)다. 위치는 첫 줄 기준이고 나머지 줄은 아래(작은 값 쪽)로 처지므로,
 * 바로 아래 라벨과는 sizes[i] × spacing만큼 떨어뜨린다.
 */
export function resolveLabelPositions(desired: readonly number[], spacing: number, sizes: readonly number[] = []): number[] {
  const size = (index: number) => sizes[index] ?? 1;
  const order = desired.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value || a.index - b.index);
  /** rel[k] = 묶음 첫 라벨에서 k번째 라벨까지의 거리 */
  interface Cluster { members: number[]; rel: number[]; start: number }
  const clusters: Cluster[] = [];
  for (const { value, index } of order) {
    clusters.push({ members: [index], rel: [0], start: value });
    while (clusters.length >= 2) {
      const last = clusters[clusters.length - 1];
      const previous = clusters[clusters.length - 2];
      const previousTop = previous.start + previous.rel[previous.rel.length - 1];
      if (last.start >= previousTop + size(last.members[0]) * spacing) break;
      const members = [...previous.members, ...last.members];
      const rel = [0];
      for (let k = 1; k < members.length; k++) rel.push(rel[k - 1] + size(members[k]) * spacing);
      const start = members.reduce((sum, member, k) => sum + desired[member] - rel[k], 0) / members.length;
      clusters.splice(clusters.length - 2, 2, { members, rel, start });
    }
  }
  const result: number[] = new Array(desired.length);
  for (const cluster of clusters) cluster.members.forEach((member, k) => { result[member] = cluster.start + cluster.rel[k]; });
  return result;
}

// ---------------------------------------------------------------------------
// 텍스트
// ---------------------------------------------------------------------------

/**
 * Noto Sans CJK KR 실측 폭(em)에 맞춘 어림값. 겹침 방지가 목적이라 굵은 글꼴을 감안해 5% 넉넉히 잡는다.
 * 숫자 0.555, 공백 0.224, 한글 0.92, 화살표·±·◇ 1.0 (Chromium canvas measureText 기준).
 */
export function estimateTextWidth(text: string, fontSize: number): number {
  let em = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (char >= "0" && char <= "9") em += 0.56;
    else if (char === " ") em += 0.23;
    else if ("il.,:;'|!()[]".includes(char)) em += 0.34;
    else if (char >= "a" && char <= "z") em += char === "m" || char === "w" ? 0.93 : 0.58;
    else if (char >= "A" && char <= "Z") em += char === "M" || char === "W" ? 0.88 : 0.7;
    else if (code < 0x80) em += 0.6;
    else if (code >= 0xac00 && code <= 0xd7a3) em += 0.93;
    else if ("·−–".includes(char)) em += 0.57;
    else em += 1;
  }
  return em * fontSize * 1.05;
}

export function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** maxWidth를 넘지 않게 줄을 나눈다. 공백에서 먼저 끊고, 한 단어가 넘치면 글자 단위로 끊는다. */
export function wrapText(text: string, maxWidth: number, fontSize: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/(\s+)/)) {
      if (word === "") continue;
      const candidate = line + word;
      if (estimateTextWidth(candidate, fontSize) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line.trim() !== "") lines.push(line.trimEnd());
      line = word.trimStart();
      while (estimateTextWidth(line, fontSize) > maxWidth && line.length > 1) {
        let cut = line.length - 1;
        while (cut > 1 && estimateTextWidth(line.slice(0, cut), fontSize) > maxWidth) cut--;
        lines.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

export function formatMs(ms: number): string {
  return Number.isInteger(ms) ? `${ms}` : `${Math.round(ms * 100) / 100}`;
}
