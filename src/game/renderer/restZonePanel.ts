import type { ChartTiming } from '../../shared/timing/chartTiming';
import { beatCompare, beatLte } from '../../shared/types/beat';
import type { RestZone } from '../../shared/types/chart';

export interface RestPanelTiming {
  startMs: number;
  endMs: number;
  animMs: number;
}

export type RestPanelPhase = 'up' | 'falling' | 'down' | 'rising';

/** 판넬 좌우 변 띠와 빗금 경계의 붉은색(Lab 테두리 시안 `붉은 둘레`·`붉은 빗금 경계`). Lab 페이지가 Pixi를 미리 불러오지 않도록 텍스처 모듈이 아니라 여기에 둔다. */
export const REST_EDGE_RED = 0xff3344;

/**
 * 게임이 쓰는 판넬 시각 값(RFD 0034 결정 4). Lab `restZone Lane`의 기본 조절값도 이것을 읽으므로 Lab 기본값이 곧 게임 값이다.
 * fadeStart·topBrightness는 0～1 비율이고 hatchBrightness는 레인색에 곱하는 배수(1이면 그대로)다. Lab 슬라이더는 셋 다 %로 바꿔 보여 준다.
 * cameraDistance·eyeHeight를 그대로 가지고 있어 PanelCamera 자리에 넘길 수 있다.
 */
export const REST_PANEL_LOOK = {
  /** 테두리. 게임은 밝은 레인색 둘레(rimColor)만 쓴다. */
  edge: 'rim',
  /** 다 넘어갔을 때의 각도(°). */
  maxAngleDeg: 60,
  /** 원근 거리(판넬 높이의 배수). */
  cameraDistance: 1.5,
  /** 경첩 위 눈높이(판넬 높이의 배수, Lab 고정값). */
  eyeHeight: 0.5,
  /** 넘어감·올라옴 각각의 애니메이션 길이(ms). */
  animMs: 300,
  /** 빗금 레인색 밝기(1이면 레인색 그대로). */
  hatchBrightness: 1,
  /** 빗금 레인색 줄·검정 줄 각각의 폭(논리 px). */
  stripeWidth: 8,
  /** 깊이 어둠이 시작되는 판넬 위치(경첩 0 → 윗변 1). */
  fadeStart: 0.4,
  /** 윗변에 남는 밝기(0이면 윗변이 검은 배경과 같다). */
  topBrightness: 0,
  /** 시작·끝이 모두 같은 인접 레인을 판넬 하나로 묶는다(groupRestPanels의 merge). */
  mergeAdjacent: true,
  /** 함께 넘어가 있는 이웃 판넬과 카메라를 나눠 써 틈을 메운다(sharedCameraLane·neighborProgress). */
  fillGaps: true,
} as const;

/** 판넬 좌우 테두리(밝은 레인색 둘레, Lab의 붉은 둘레도 같다)의 폭(논리 px). */
export const REST_PANEL_OUTLINE_WIDTH = 2;
/** 밝은 레인색 둘레가 레인색을 밝히는 배수. */
export const REST_PANEL_RIM_BRIGHTNESS = 2.6;

/** 0xRRGGBB 색의 채널마다 factor를 곱하고 반올림한다. 255를 넘는 채널은 255에서 멈춘다. */
export function brightenColor(color: number, factor: number): number {
  return [16, 8, 0]
    .reduce((sum, shift) => sum | (Math.min(255, Math.round(((color >> shift) & 255) * factor)) << shift), 0);
}

/** 0xRRGGBB 두 색을 채널마다 from × (1 − t) + to × t로 섞고 반올림한다. t 0이면 from, 1이면 to 그대로다. */
export function mixColor(from: number, to: number, t: number): number {
  const channel = (shift: number) => Math.round(((from >> shift) & 255) * (1 - t) + ((to >> shift) & 255) * t);
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/** 밝은 레인색 둘레의 색. 변이 놓인 레인(왼쪽 변은 판넬 첫 레인, 오른쪽 변은 마지막 레인)의 색을 REST_PANEL_RIM_BRIGHTNESS배 밝힌다. */
export function rimColor(laneColor: number): number {
  return brightenColor(laneColor, REST_PANEL_RIM_BRIGHTNESS);
}

/** 넘어간 판넬 왼쪽 또는 오른쪽 변에 겹쳐 그리는 띠 하나의 모양. */
export interface PanelEdgeStrip {
  /** false면 그리지 않는다(테두리가 없고 맞닿은 이웃도 없을 때). */
  visible: boolean;
  /** 띠 폭(논리 px). 판넬 바깥 변에서 안쪽으로 잰다. */
  width: number;
  /** 띠 색(0xRRGGBB). */
  tint: number;
  /** 띠 불투명도. */
  alpha: number;
}

/**
 * 넘어간 판넬의 한쪽 변 띠. 혼자일 때는 테두리(outlineWidth 폭, outlineColor)를 그리고, 그쪽에 맞닿아 넘어가는 이웃이 있으면
 * 그 이웃의 진행도(seam)만큼 테두리를 빼고 레인 구분선(양쪽 판넬이 절반 폭씩 나눠 그린다)을 넣는다.
 * 테두리 몫은 1 − seam, 구분선 몫은 seam이고, 폭과 색은 두 몫 중 구분선 쪽 비율만큼 옮겨 가며, 불투명도는
 * 자기 진행도 × 두 몫의 합이다. outlineColor가 null이면(테두리 없는 스타일) 이웃과 맞닿을 때만 구분선을 그린다.
 * 게임은 outlineColor에 rimColor를 넣고, Lab은 테두리 시안에 따라 rimColor·REST_EDGE_RED·null을 넣는다.
 */
export function panelEdgeStrip(options: {
  /** 자기 판넬의 진행도(0～1). */
  progress: number;
  /** 이 변에 맞닿아 넘어가는 이웃 판넬의 진행도(없으면 0, neighborProgress). */
  seam: number;
  outlineColor: number | null;
  separatorColor: number;
  outlineWidth: number;
  /** 레인 구분선 전체 폭. 맞닿은 두 판넬이 절반씩 그린다. */
  separatorWidth: number;
}): PanelEdgeStrip {
  const { progress, seam, outlineColor, separatorColor, outlineWidth, separatorWidth } = options;
  const outline = outlineColor === null ? 0 : 1 - seam;
  const strength = outline + seam;
  if (strength <= 0) return { visible: false, width: 0, tint: separatorColor, alpha: 0 };
  const toSeam = seam / strength;
  return {
    visible: true,
    width: outlineWidth + (separatorWidth / 2 - outlineWidth) * toSeam,
    tint: mixColor(outlineColor ?? separatorColor, separatorColor, toSeam),
    alpha: progress * strength,
  };
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

/**
 * startMs에 넘어감을, endMs에 올라옴을 끝낸다(실제 시각은 restPanelTiming이 정한다).
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
 * 빈 레인 창은 [startMs, endMs − dwellMs]다. 넘어감은 창이 열린 뒤 animMs 동안 하고, 올라옴은 창이 닫힐 때 끝난다.
 * 창이 2 × animMs보다 짧으면 restPanelState가 덜 넘어가게 하고, 창이 없으면 넘어가지 않는다.
 * dwellMs에 차트 난이도별 추정 녹숫을 넣으면 모든 사용자가 같은 시각에 같은 연출을 본다. 추정보다 느린 설정에서는
 * 다음 노트가 그 차이만큼 먼저 보이고, 빠른 설정에서는 판넬이 다음 노트보다 먼저 올라와 레인 복귀를 미리 알린다.
 */
export function restPanelTiming(startMs: number, endMs: number, dwellMs: number, animMs: number): RestPanelTiming {
  const anim = Math.max(0, animMs);
  return { startMs: startMs + anim, endMs: endMs - dwellMs, animMs: anim };
}

/**
 * 차트 제작 지침의 restZone 최소 길이(ms). 넘어감(animMs)·올라옴(animMs)과, 다 올라온 뒤 다음 노트가 판정선까지 내려오는
 * 추정 녹숫(dwellMs)이 모두 restZone 안에 들어가야 판넬이 끝까지 넘어갈 수 있다. 이보다 짧아도 restPanelTiming이
 * 올라옴을 (끝 − 추정 녹숫)에 끝내므로 추정 녹숫 이하의 설정에서 애니메이션 중에 노트가 보이지는 않고, 덜 넘어갈 뿐이다.
 */
export function minRestZoneMs(dwellMs: number, animMs: number): number {
  return Math.max(0, dwellMs) + 2 * Math.max(0, animMs);
}

/** 추정 녹숫 직선의 두 끝점(RFD 0034 결정 3). 이보다 낮은 Lv.는 Lv.1 값을, 높은 Lv.는 Lv.15 값을 쓴다. */
export const ESTIMATED_DWELL_LOWEST_LEVEL = { level: 1, ms: 3000 } as const;
export const ESTIMATED_DWELL_HIGHEST_LEVEL = { level: 15, ms: 500 } as const;

/**
 * 차트 Lv.(`difficultyLevel`)의 추정 녹숫(ms). Lv.1 3000ms부터 Lv.15 500ms까지 선형으로 줄어, Lv.n은
 * 3000 − (n − 1) × 2500 / 14다. Lv.를 1～15로 자른 뒤 같은 식에 넣으므로 소수 Lv.도 선형으로 구한다.
 * 숫자가 아니면(NaN, 옛 JSON에 없어 들어온 undefined) Lv.1로 본다. ±Infinity는 숫자라 자르기만 한다.
 * 두 끝점 값을 정수 가중치로 섞은 뒤 한 번만 나눠, 정수 Lv.(예: Lv.8 1750ms)에서 부동소수 오차가 끼지 않게 한다.
 */
export function estimatedDwellMs(difficultyLevel: number): number {
  const low = ESTIMATED_DWELL_LOWEST_LEVEL;
  const high = ESTIMATED_DWELL_HIGHEST_LEVEL;
  const level = typeof difficultyLevel === 'number' && !Number.isNaN(difficultyLevel)
    ? Math.min(high.level, Math.max(low.level, difficultyLevel))
    : low.level;
  return (low.ms * (high.level - level) + high.ms * (level - low.level)) / (high.level - low.level);
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
 * 넘어간 판넬이 먼 쪽(윗변)으로 갈수록 검은 배경에 묻히도록 판넬 위에 덮는 검정의 불투명도.
 * t는 판넬을 따라 잰 위치로 경첩 0 → 윗변 1이다. fadeStart까지는 0이고, 그 뒤 smoothstep으로 짙어져
 * 윗변에서 1 − topBrightness가 된다(topBrightness 0이면 윗변이 배경과 같은 검정).
 */
export function depthFadeAlpha(t: number, fadeStart: number, topBrightness: number): number {
  const start = clamp01(fadeStart);
  if (start >= 1) return 0;
  const u = clamp01((t - start) / (1 - start));
  return (1 - clamp01(topBrightness)) * u * u * (3 - 2 * u);
}

/**
 * 같은 레인에서 앞 restZone의 끝 박과 뒤 restZone의 시작 박이 같으면 하나로 잇는다(RFD 0034 결정 2).
 * 검증은 맞닿음을 허용하므로, 따로 계산하면 이어진 쉼 한가운데서 판넬이 올라왔다가 다시 넘어간다. 3개 이상 이어져도 하나가 된다.
 * 박은 Beat 분수로 비교하므로 1/48박 틈이라도 있으면 잇지 않고, 다른 레인끼리는 맞닿아도 잇지 않는다
 * (레인이 붙고 박 범위가 같은 구간을 한 판넬로 묶는 것은 groupRestPanels가 따로 한다).
 * 겹친 구간은 검증(`restZoneOverlap`)이 저장·플레이 전에 막지만, 들어오면 맞닿은 것처럼 합쳐 [가장 이른 시작, 가장 늦은 끝]
 * 하나로 본다. 안에 든 구간·같은 구간도 마찬가지다. 결과는 레인, 그다음 시작 박 순서이고 입력 배열과 객체는 바꾸지 않는다.
 * 판넬로 묶기(groupRestPanels) 전에 부른다. 잇기 전에는 박 범위가 달라 묶이지 않던 이웃 레인 구간이 이은 뒤에는 한 판넬로 묶일 수 있다.
 */
export function mergeTouchingRestZones(zones: readonly RestZone[]): RestZone[] {
  const sorted = [...zones].sort((a, b) => a.lane - b.lane || beatCompare(a.beat, b.beat));
  const merged: RestZone[] = [];
  for (const zone of sorted) {
    const last = merged[merged.length - 1];
    if (last && last.lane === zone.lane && beatLte(zone.beat, last.endBeat)) {
      if (beatCompare(zone.endBeat, last.endBeat) > 0) last.endBeat = zone.endBeat;
    } else {
      merged.push({ lane: zone.lane, beat: zone.beat, endBeat: zone.endBeat });
    }
  }
  return merged;
}

/**
 * 판넬 묶기에 쓰는 restZone. lane은 0부터 센다(레인 0이 왼쪽 끝, 차트 `RestZone`의 1～4와 다르다).
 * start·end는 단위를 정하지 않은 시작·끝 위치다. Lab은 박을, 게임은 곡 시간 ms(toLaneRestZones)를 넣는다.
 */
export interface LaneRestZone { lane: number; start: number; end: number }
/** 함께 접히는 판넬 하나. firstLane(0부터)부터 laneCount개 레인 폭을 덮는다. start·end는 묶은 LaneRestZone과 같은 단위다. */
export interface RestPanelGroup { firstLane: number; laneCount: number; start: number; end: number }

/**
 * 차트 restZone을 판넬 묶기 입력으로 바꾼다(RFD 0034 영향 3). 같은 레인에서 맞닿은 구간을 먼저 잇고(mergeTouchingRestZones),
 * 시작·끝 박을 timing.beatToMs로 곡 시간 ms로 바꾸고, 레인을 1～4에서 0～3으로 옮긴다. 결과를 groupRestPanels에 넣는다.
 * 잇기를 묶기보다 먼저 해야, 이어서야 박 범위가 같아지는 이웃 레인 구간도 한 판넬로 묶인다.
 * 같은 박은 같은 beatToMs를 거쳐 같은 ms가 되므로 groupRestPanels의 같음 비교가 박에서와 똑같이 맞는다.
 * 결과는 레인, 그다음 시작 순서이고 입력 배열과 객체는 바꾸지 않는다. 차트에 BPM 마커가 없으면 beatToMs처럼 예외를 던진다.
 */
export function toLaneRestZones(restZones: readonly RestZone[], timing: Pick<ChartTiming, 'beatToMs'>): LaneRestZone[] {
  return mergeTouchingRestZones(restZones).map(zone => ({
    lane: zone.lane - 1, start: timing.beatToMs(zone.beat), end: timing.beatToMs(zone.endBeat),
  }));
}

/**
 * restZone을 판넬 단위로 묶는다. merge가 켜져 있으면 시작·끝이 모두 같고 레인이 붙어 있는 구간끼리
 * 판넬 하나로 묶어 같은 시각에 같이 접히게 한다. 범위가 하나라도 다르면 접히는 시각이 달라
 * 중간에 합치면 모양이 튀므로 묶지 않는다. 결과는 firstLane, 그다음 시작 순서다.
 * start·end는 같음과 크기 순서만 쓰므로 박(Lab)이든 ms(게임)든 같게 묶는다.
 */
export function groupRestPanels(zones: readonly LaneRestZone[], merge: boolean): RestPanelGroup[] {
  const sorted = [...zones].sort((a, b) => a.start - b.start || a.end - b.end || a.lane - b.lane);
  const groups: RestPanelGroup[] = [];
  for (const zone of sorted) {
    const last = groups[groups.length - 1];
    if (merge && last && last.start === zone.start && last.end === zone.end
      && last.firstLane + last.laneCount === zone.lane) {
      last.laneCount++;
    } else {
      groups.push({ firstLane: zone.lane, laneCount: 1, start: zone.start, end: zone.end });
    }
  }
  return groups.sort((a, b) => a.firstLane - b.firstLane || a.start - b.start);
}

/** 지금 접혀 있는(progress > 0) 판넬. 레인 단위 위치를 쓰고 firstLane은 0부터 센다(LaneRestZone과 같다). */
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
 * 두 칸 이상 떨어진 판넬의 progress는 사이에 낀 판넬들의 progress 중 가장 작은 값을 넘지 않게 한다. 가운데 판넬이 막
 * 접히기 시작해 묶음이 이어질 때도 바깥 판넬의 영향이 0에서 시작해 카메라가 연속으로 움직이고, 모두 같은 progress로
 * 접히면 가중치가 같아져 묶음 전체가 한 카메라를 써서 맞닿은 변이 겹친다.
 * 알려진 한계(받아들임, RFD 0034 영향 2): 판넬마다 카메라 하나라, 3개 이상 붙은 묶음에서 progress가 서로 다르면 맞닿은 변이
 * 몇 px 벌어진다(예: 레인 폭 62.5·60°에서 0.5·0.5·1이면 앞 두 판넬 사이 약 3.9px). progress가 서로 다른 것은 300ms 넘어감·올라옴이
 * 겹치는 동안뿐이라 잠깐 보이고, 모두 다 넘어가 있으면 progress가 같아 맞닿은 변이 겹친다. Lab 배치는 많아야 2개라 생기지 않는다.
 * 이음새마다 카메라를 따로 두는 방식(판넬 왼쪽 윗모서리는 왼쪽 이음새, 오른쪽 윗모서리는 오른쪽 이음새 카메라로 투영)은 쓰지 않는다.
 */
export function sharedCameraLane(panels: readonly FoldingPanel[], index: number): number {
  const [first, last] = foldingRun(panels, index);
  let weighted = 0;
  let total = 0;
  for (let i = first; i <= last; i++) {
    let reach = panels[i].progress;
    for (let between = Math.min(i, index) + 1; between < Math.max(i, index); between++) reach = Math.min(reach, panels[between].progress);
    const weight = panels[i].laneCount * reach;
    weighted += (panels[i].firstLane + panels[i].laneCount / 2) * weight;
    total += weight;
  }
  const own = panels[index];
  return total > 0 ? weighted / total : own.firstLane + own.laneCount / 2;
}

/**
 * 레인 경계 boundary(레인 boundary − 1과 boundary 사이)에서 화면 레이어가 그릴 구분선의 위끝 y. 접힌 판넬 안쪽 경계와
 * 틈을 메운 두 판넬 사이 경계는 판넬이 판정선 위 부분을 대신 그리므로 판정선(hingeY)부터, 나머지는 레인 맨 위(0)부터다.
 * 어느 경우든 판정선 아래 구분선은 남는다.
 */
export function separatorTop(
  boundary: number, folding: readonly Pick<RestPanelGroup, 'firstLane' | 'laneCount'>[], fillGaps: boolean, hingeY: number,
): number {
  const insidePanel = folding.some(group => group.firstLane < boundary && boundary < group.firstLane + group.laneCount);
  const betweenFilledPanels = fillGaps && folding.some(group => group.firstLane + group.laneCount === boundary)
    && folding.some(group => group.firstLane === boundary);
  return insidePanel || betweenFilledPanels ? hingeY : 0;
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
