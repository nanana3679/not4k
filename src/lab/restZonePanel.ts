export interface RestPanelTiming {
  startMs: number;
  endMs: number;
  animMs: number;
}

export type RestPanelPhase = 'up' | 'falling' | 'down' | 'rising';

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

/**
 * startMs에 꺼짐을, endMs에 올라옴을 끝낸다(실제 시각은 restPanelTiming이 정한다).
 * 짧은 구간은 두 곡선 중 작은 진행도를 쓴다.
 */
export function restPanelState(songMs: number, timing: RestPanelTiming): { progress: number; phase: RestPanelPhase } {
  const { startMs, endMs, animMs } = timing;
  if (animMs <= 0) {
    return songMs >= startMs && songMs < endMs
      ? { progress: 1, phase: 'down' }
      : { progress: 0, phase: 'up' };
  }
  const fallU = clamp01((songMs - (startMs - animMs)) / animMs);
  const riseU = clamp01((songMs - (endMs - animMs)) / animMs);
  const fallProgress = fallU ** 2;
  const riseProgress = (1 - riseU) ** 2;
  const progress = Math.min(fallProgress, riseProgress);
  const phase = progress <= 0 ? 'up'
    : riseProgress < fallProgress ? 'rising'
      : fallProgress < 1 ? 'falling' : 'down';
  return { progress, phase };
}

/**
 * 노트가 레인 위쪽에 처음 보이고 판정선에 닿기까지 걸리는 시간(ms). travelPx는 그동안 노트가 움직이는 거리다.
 * 스크롤 속도·리프트(판정선 높이)·서든(레인이 보이는 위끝)이 모두 이 값 하나로 모인다.
 */
export function noteDwellMs(travelPx: number, scrollPxPerSecond: number): number {
  return scrollPxPerSecond > 0 ? (Math.max(0, travelPx) / scrollPxPerSecond) * 1000 : Infinity;
}

/**
 * restZone 구간과 노트가 레인에 머무는 시간으로 판넬 전환 시각을 정한다. 판넬은 판정선 위 레인에 노트가 하나도 안 보일 때만 움직인다.
 * restZone 시작 시각에는 앞 노트가 모두 판정선에 닿았고, (끝 − dwellMs)에 뒤 노트가 레인 위끝에 나타나므로
 * 빈 레인 창은 [startMs, endMs − dwellMs]다. 꺼짐은 창이 열린 뒤 animMs 동안 하고, 올라옴은 창이 닫힐 때 끝난다.
 * 창이 2 × animMs보다 짧으면 restPanelState가 덜 꺼지게 하고, 창이 없으면 꺼지지 않는다.
 * dwellMs에 차트 난이도별 추정 녹숫을 넣으면 모든 사용자가 같은 시각에 같은 연출을 본다. 추정보다 느린 설정에서는
 * 다음 노트가 그 차이만큼 먼저 보이고, 빠른 설정에서는 판넬이 다음 노트보다 먼저 올라와 레인 복귀를 미리 알린다.
 */
export function restPanelTiming(startMs: number, endMs: number, dwellMs: number, animMs: number): RestPanelTiming {
  const anim = Math.max(0, animMs);
  return { startMs: startMs + anim, endMs: endMs - dwellMs, animMs: anim };
}

/**
 * 차트 제작 지침의 restZone 최소 길이(ms). 꺼짐(animMs)·올라옴(animMs)과, 다 올라온 뒤 다음 노트가 판정선까지 내려오는
 * 추정 녹숫(estimatedDwellMs)이 모두 restZone 안에 들어가야 추정 녹숫 이하의 설정에서 애니메이션 중에 노트가 보이지 않는다.
 */
export function minRestZoneMs(estimatedDwellMs: number, animMs: number): number {
  return Math.max(0, estimatedDwellMs) + 2 * Math.max(0, animMs);
}

export interface PanelRect {
  x: number;
  width: number;
  hingeY: number;
  height: number;
}

export interface PanelCamera {
  /** 판넬 높이의 배수. */
  cameraDistance: number;
  /** 힌지 위 눈높이 / 판넬 높이. */
  eyeHeight: number;
}

export interface Point { x: number; y: number }

function perspectiveScale(angleRad: number, camera: PanelCamera): number {
  return camera.cameraDistance / (camera.cameraDistance + Math.sin(angleRad));
}

/** 힌지에서 위 모서리까지의 화면 높이 / 원래 높이. H로 나누면 투영식의 H가 소거된다. */
export function fallenHeightRatio(angleRad: number, camera: PanelCamera): number {
  return camera.eyeHeight + (Math.cos(angleRad) - camera.eyeHeight) * perspectiveScale(angleRad, camera);
}

/**
 * PerspectiveMesh 순서: 왼쪽 위, 오른쪽 위, 오른쪽 아래, 왼쪽 아래.
 * cameraX는 카메라가 선 화면 x(기본은 판넬 가운데). 윗변의 각 점은 카메라 쪽으로 (1 − 원근 배율)만큼 다가간다.
 */
export function panelCorners(
  rect: PanelRect, angleRad: number, camera: PanelCamera, cameraX = rect.x + rect.width / 2,
): [Point, Point, Point, Point] {
  const topY = rect.hingeY - rect.height * fallenHeightRatio(angleRad, camera);
  // x + (cameraX − x)(1 − s) 꼴로 써서 θ=0일 때 x의 소수 좌표를 그대로 보존한다.
  const pull = 1 - perspectiveScale(angleRad, camera);
  const right = rect.x + rect.width;
  return [
    { x: rect.x + (cameraX - rect.x) * pull, y: topY },
    { x: right + (cameraX - right) * pull, y: topY },
    { x: right, y: rect.hingeY },
    { x: rect.x, y: rect.hingeY },
  ];
}

/**
 * 꺼진 판넬이 먼 쪽(윗변)으로 갈수록 검은 배경에 묻히도록 판넬 위에 덮는 검정의 불투명도.
 * t는 판넬을 따라 잰 위치로 경첩 0 → 윗변 1이다. fadeStart까지는 0이고, 그 뒤 smoothstep으로 짙어져
 * 윗변에서 1 − topBrightness가 된다(topBrightness 0이면 윗변이 배경과 같은 검정).
 */
export function depthFadeAlpha(t: number, fadeStart: number, topBrightness: number): number {
  const start = clamp01(fadeStart);
  if (start >= 1) return 0;
  const u = clamp01((t - start) / (1 - start));
  return (1 - clamp01(topBrightness)) * u * u * (3 - 2 * u);
}

export interface LaneRestZone { lane: number; beat: number; endBeat: number }
/** 함께 접히는 판넬 하나. firstLane부터 laneCount개 레인 폭을 덮는다. */
export interface RestPanelGroup { firstLane: number; laneCount: number; beat: number; endBeat: number }

/**
 * restZone을 판넬 단위로 묶는다. merge가 켜져 있으면 시작·끝 박이 모두 같고 레인이 붙어 있는 구간끼리
 * 판넬 하나로 묶어 같은 시각에 같이 접히게 한다. 박 범위가 하나라도 다르면 접히는 시각이 달라
 * 중간에 합치면 모양이 튀므로 묶지 않는다. 결과는 firstLane, 그다음 시작 박 순서다.
 */
export function groupRestPanels(zones: readonly LaneRestZone[], merge: boolean): RestPanelGroup[] {
  const sorted = [...zones].sort((a, b) => a.beat - b.beat || a.endBeat - b.endBeat || a.lane - b.lane);
  const groups: RestPanelGroup[] = [];
  for (const zone of sorted) {
    const last = groups[groups.length - 1];
    if (merge && last && last.beat === zone.beat && last.endBeat === zone.endBeat
      && last.firstLane + last.laneCount === zone.lane) {
      last.laneCount++;
    } else {
      groups.push({ firstLane: zone.lane, laneCount: 1, beat: zone.beat, endBeat: zone.endBeat });
    }
  }
  return groups.sort((a, b) => a.firstLane - b.firstLane || a.beat - b.beat);
}

/** 지금 접혀 있는(progress > 0) 판넬. 레인 단위 위치를 쓴다. */
export interface FoldingPanel { firstLane: number; laneCount: number; progress: number }

/** panels[index]와 끊김 없이 붙어 함께 접혀 있는 판넬들의 인덱스 범위. panels는 firstLane 순서여야 한다. */
function foldingRun(panels: readonly FoldingPanel[], index: number): [number, number] {
  const touches = (a: FoldingPanel, b: FoldingPanel) => a.firstLane + a.laneCount === b.firstLane && a.progress > 0 && b.progress > 0;
  let first = index;
  while (first > 0 && touches(panels[first - 1], panels[first])) first--;
  let last = index;
  while (last < panels.length - 1 && touches(panels[last], panels[last + 1])) last++;
  return [first, last];
}

/**
 * 붙어서 접히는 판넬들이 함께 쓰는 카메라 위치(레인 좌표, 레인 0 왼쪽 끝이 0).
 * 판넬 가운데를 (레인 수 × progress)로 가중 평균한다. 혼자면 자기 가운데라 지금처럼 대칭으로 접히고,
 * 이웃이 다 접히면 묶음 전체의 가운데가 되어 맞닿은 변이 정확히 겹친다(같은 구간을 묶은 넓은 판넬과 같은 모양).
 * 이웃 progress가 0에서 시작하므로 카메라가 연속으로 움직여 모양이 튀지 않는다.
 */
export function sharedCameraLane(panels: readonly FoldingPanel[], index: number): number {
  const [first, last] = foldingRun(panels, index);
  let weighted = 0;
  let total = 0;
  for (let i = first; i <= last; i++) {
    const weight = panels[i].laneCount * panels[i].progress;
    weighted += (panels[i].firstLane + panels[i].laneCount / 2) * weight;
    total += weight;
  }
  const own = panels[index];
  return total > 0 ? weighted / total : own.firstLane + own.laneCount / 2;
}

/** panels[index]의 바로 왼쪽·오른쪽에 붙어 접히는 판넬의 progress(없으면 0). */
export function neighborProgress(panels: readonly FoldingPanel[], index: number): { left: number; right: number } {
  const own = panels[index];
  const left = panels[index - 1];
  const right = panels[index + 1];
  return {
    left: left && left.firstLane + left.laneCount === own.firstLane ? left.progress : 0,
    right: right && own.firstLane + own.laneCount === right.firstLane ? right.progress : 0,
  };
}
