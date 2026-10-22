import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  COLORS, GAME_HEIGHT, JUDGMENT_LINE_THICKNESS,
  LANE_AREA_WIDTH, LANE_COUNT, LANE_WIDTH, NOTE_HEIGHT, NOTE_WIDTH, judgmentLineYAtLift, playfieldPx, suddenCoverPx,
} from '../game/renderer/constants';
import {
  REST_EDGE_RED, fallenHeightRatio, groupRestPanels, minRestZoneMs, neighborProgress, noteDwellMs, panelCorners, restPanelState,
  restPanelTiming, separatorTop, sharedCameraLane, type FoldingPanel, type LaneRestZone, type RestPanelGroup, type RestPanelPhase,
} from '../game/renderer/restZonePanel';
import './RestZoneLanePage.css';

// 기존 Lab의 어두운 작업 화면: 왼쪽에 실제 레인, 오른쪽에 조절 항목을 두고 폰에서는 세로로 쌓는다.
// 판넬 움직임과 노트의 겹침이 주인공이다. 재생·탐색은 캔버스 바로 아래에서 조작한다.
const BEAT_MS = 500;
const LOOP_MS = 32 * BEAT_MS;
/**
 * 리프트 0%의 판정선 y. 기어는 그리지 않지만 게임 플레이 화면(기어 있음)과 같은 y 426을 써서 녹숫이 게임과 같게 한다.
 */
const JUDGE_Y = judgmentLineYAtLift(0);
/** 기어가 있는 플레이 화면처럼 리프트를 올려도 레인 끝은 그대로다. */
const LANE_END_Y = JUDGE_Y + NOTE_HEIGHT / 2;
/**
 * 서든을 내려도 판정선 위로 남기는 레인 높이(논리 px). 판넬이 보이도록 남기는 Lab 전용 값이라,
 * 서든 + 리프트가 약 86%를 넘으면 보이는 레인과 녹숫이 게임 식(426 × (100 − 서든 − 리프트)%)보다 길다.
 */
const MIN_VISIBLE_LANE = 60;
const SUDDEN_COVER_COLOR = 0x1c1c28;
const SUDDEN_EDGE_COLOR = 0x6a6a82;
const DEMO_NOTES = Array.from({ length: LANE_COUNT }, (_, lane) =>
  Array.from({ length: 32 }, (_, beat) => ({ lane, beat, ms: beat * BEAT_MS })),
).flat();
const PHASE_LABEL: Record<RestPanelPhase, string> = {
  up: '평상', falling: '넘어가는 중', down: '넘어가 있음', rising: '올라오는 중',
};
const laneColor = (lane: number) => lane % 2 === 0 ? COLORS.LANE_BG_EVEN : COLORS.LANE_BG_ODD;
const SEPARATOR_WIDTH = playfieldPx(2);
/** 판넬 좌우 붉은 변의 폭(논리 px). */
const RED_EDGE_WIDTH = 2;
/** 판넬 테두리 스타일. 'rim'은 레인색을 밝힌 선으로 가장자리에 빛이 맺힌 듯 보이게 한다. */
type EdgeStyle = 'red-outline' | 'red-stripe' | 'rim' | 'none';
const EDGE_STYLE_LABEL: Record<EdgeStyle, string> = {
  'red-outline': '붉은 둘레', 'red-stripe': '붉은 빗금 경계', rim: '밝은 레인색 둘레', none: '없음',
};
const RIM_BRIGHTNESS = 2.6;
const brighten = (color: number, factor: number) => [16, 8, 0]
  .reduce((sum, shift) => sum | (Math.min(255, Math.round(((color >> shift) & 255) * factor)) << shift), 0);
const mixColor = (from: number, to: number, t: number) => {
  const channel = (shift: number) => Math.round(((from >> shift) & 255) * (1 - t) + ((to >> shift) & 255) * t);
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
};

type ZonePreset = 'single' | 'pair-same' | 'pair-offset' | 'short';
// lane은 이 페이지의 0부터 세는 레인 인덱스다(화면 표기 레인 2 = 1).
const ZONE_PRESETS: Record<ZonePreset, { label: string; zones: readonly LaneRestZone[] }> = {
  single: { label: '레인 2만', zones: [{ lane: 1, beat: 8, endBeat: 24 }] },
  'pair-same': {
    label: '레인 3·4 같은 구간',
    zones: [{ lane: 2, beat: 8, endBeat: 24 }, { lane: 3, beat: 8, endBeat: 24 }],
  },
  'pair-offset': {
    label: '레인 3·4 시작 어긋남',
    zones: [{ lane: 2, beat: 8, endBeat: 24 }, { lane: 3, beat: 12, endBeat: 24 }],
  },
  short: { label: '레인 2 짧은 구간(1.5초)', zones: [{ lane: 1, beat: 8, endBeat: 11 }] },
};
const laneLabel = (group: RestPanelGroup) =>
  `레인 ${Array.from({ length: group.laneCount }, (_, index) => group.firstLane + index + 1).join('·')}`;
const groupTiming = (group: RestPanelGroup, dwellMs: number, animMs: number) =>
  restPanelTiming(group.beat * BEAT_MS, group.endBeat * BEAT_MS, dwellMs, animMs);
const seconds = (ms: number) => (ms / 1000).toFixed(2);

interface Controls {
  playing: boolean;
  playbackRate: number;
  maxAngle: number;
  cameraDistance: number;
  animMs: number;
  edgeStyle: EdgeStyle;
  brightness: number;
  stripeWidth: number;
  fadeStart: number;
  topBrightness: number;
  scrollPxPerSecond: number;
  /** 차트 난이도별로 정하는 추정 녹숫(ms). 판넬 전환 시각과 restZone 최소 길이 지침의 기준이다. */
  estimatedDwellMs: number;
  liftPercent: number;
  suddenPercent: number;
  preset: ZonePreset;
  mergeAdjacent: boolean;
  fillGaps: boolean;
  showNotes: boolean;
}

/**
 * 사용자 설정에 따른 레인 모양. 판넬은 판정선(경첩)부터 레인이 보이는 위끝까지만 덮는다.
 * 노트는 위끝에 처음 보이고 판정선에 닿을 때까지 dwellMs 동안 레인에 머문다.
 * 리프트·서든은 게임과 같이 레인 위끝~리프트 0% 판정선 높이(426)가 100%(#291)라 서든 20%면 커버가 85.2 내려온다.
 */
const laneView = (current: Pick<Controls, 'liftPercent' | 'suddenPercent' | 'scrollPxPerSecond'>) => {
  const judgeY = judgmentLineYAtLift(current.liftPercent);
  const visibleTop = Math.max(0, Math.min(suddenCoverPx(current.suddenPercent), judgeY - MIN_VISIBLE_LANE));
  // 노트 아래끝이 위끝에 닿을 때부터 노트 가운데가 판정선에 닿을 때까지다.
  const dwellMs = noteDwellMs(judgeY - visibleTop + NOTE_HEIGHT / 2, current.scrollPxPerSecond);
  return { judgeY, visibleTop, panelHeight: judgeY - visibleTop, dwellMs };
};

export default function RestZoneLanePage() {
  const [controls, setControls] = useState<Controls>({
    playing: true, playbackRate: 1, maxAngle: 60, cameraDistance: 1.5, animMs: 300,
    edgeStyle: 'red-outline', brightness: 100, stripeWidth: 8, fadeStart: 40, topBrightness: 0, scrollPxPerSecond: Math.round(JUDGE_Y / 1.2),
    estimatedDwellMs: 1500, liftPercent: 0, suddenPercent: 0, preset: 'single', mergeAdjacent: true, fillGaps: true, showNotes: true,
  });
  const [timeMs, setTimeMs] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef(0);
  const controlsRef = useRef(controls);
  controlsRef.current = controls;

  const update = <K extends keyof Controls>(key: K, value: Controls[K]) => {
    controlsRef.current = { ...controlsRef.current, [key]: value };
    setControls(controlsRef.current);
  };
  const seek = (ms: number) => {
    update('playing', false);
    timeRef.current = ms;
    setTimeMs(ms);
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let dispose: (() => void) | undefined;
    // StrictMode의 앞선 비동기 init과 새 앱이 WebGL 컨텍스트를 공유하지 않도록 매번 새 캔버스.
    const canvas = document.createElement('canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', '4개 레인의 restZone 판넬과 노트 미리보기');
    host.append(canvas);

    const init = async () => {
      const [{ Application, Container, Graphics, PerspectiveMesh, Texture }, { createRestEdgeTexture, createRestPanelTexture }] = await Promise.all([
        import('pixi.js'), import('../game/renderer/restZonePanelTexture'), import('pixi.js/unsafe-eval'),
      ]);
      if (cancelled) return;
      const app = new Application();
      try {
        await app.init({
          canvas, width: LANE_AREA_WIDTH, height: GAME_HEIGHT,
          resolution: window.devicePixelRatio || 1, autoDensity: true, autoStart: false,
          backgroundColor: COLORS.BG, preference: 'webgl', antialias: true,
        });
      } catch (cause) {
        // init 전에는 renderer/ticker가 없으므로 Application.destroy를 부르지 않는다.
        app.stage.destroy({ children: true });
        throw cause;
      }

      const textures = new Set<import('pixi.js').Texture>();
      const geometries: import('pixi.js').PerspectivePlaneGeometry[] = [];
      const observer = new ResizeObserver(() => resize());
      let destroyed = false;
      const onResize = () => resize();
      dispose = () => {
        if (destroyed) return;
        destroyed = true;
        observer.disconnect();
        window.removeEventListener('resize', onResize);
        app.stop();
        // GPU 소유 리소스는 renderer가 살아 있을 때 해제한다.
        for (const geometry of geometries) geometry.destroy();
        for (const texture of textures) texture.destroy(true);
        textures.clear();
        // GameRenderer와 같은 정책: 다른 Pixi 앱이 쓰는 전역 풀은 건드리지 않는다.
        app.destroy({ removeView: false, releaseGlobalResources: false }, { children: true, texture: false });
      };
      if (cancelled) {
        dispose();
        return;
      }

      const root = new Container();
      const clip = new Graphics().rect(0, 0, LANE_AREA_WIDTH, LANE_END_Y).fill(0xffffff);
      const content = new Container();
      content.mask = clip;
      root.addChild(content, clip);
      app.stage.addChild(root);
      const backgrounds = new Graphics();
      for (let lane = 0; lane < LANE_COUNT; lane++) {
        backgrounds.rect(lane * LANE_WIDTH, 0, LANE_WIDTH, LANE_END_Y).fill(laneColor(lane));
      }
      const restLayer = new Container();
      // 판넬 슬롯: 레인마다 따로 접혀도 4개면 충분하다. 슬롯마다 검은 빈 공간 + 평상 판넬 + 빗금 판넬.
      const slots = Array.from({ length: LANE_COUNT }, () => {
        const container = new Container();
        const voidRect = new Graphics().rect(0, 0, 1, 1).fill(0x000000);
        // 판넬의 한 행은 모두 같은 깊이라 가로는 꼭짓점 2개로 정확하다. 꼭짓점이 적어야(2 × 40) Pixi가 메시를 묶어 그린다.
        const plain = new PerspectiveMesh({ texture: Texture.EMPTY, verticesX: 2, verticesY: 40 });
        const hatch = new PerspectiveMesh({ texture: Texture.EMPTY, verticesX: 2, verticesY: 40 });
        // 좌우 변 띠: 혼자일 때는 붉은 테두리, 이웃 판넬과 맞닿으면 레인 구분선으로 바뀐다.
        const leftEdge = new PerspectiveMesh({ texture: Texture.EMPTY, verticesX: 2, verticesY: 40 });
        const rightEdge = new PerspectiveMesh({ texture: Texture.EMPTY, verticesX: 2, verticesY: 40 });
        geometries.push(plain.geometry, hatch.geometry, leftEdge.geometry, rightEdge.geometry);
        container.addChild(voidRect, plain, hatch, leftEdge, rightEdge);
        container.visible = false;
        restLayer.addChild(container);
        return { container, voidRect, plain, hatch, leftEdge, rightEdge };
      });
      const separators = new Graphics();
      // 리프트 0% 위치에 그리고 리프트만큼 y로 옮긴다.
      const judgment = new Graphics()
        .rect(0, JUDGE_Y - JUDGMENT_LINE_THICKNESS / 2, LANE_AREA_WIDTH, JUDGMENT_LINE_THICKNESS)
        .fill(COLORS.JUDGMENT_LINE);
      const notes = new Graphics();
      const suddenCover = new Graphics();
      content.addChild(backgrounds, restLayer, separators, judgment, notes, suddenCover);

      // 판넬 텍스처는 (덮는 레인, 모양 조절값)마다 한 쌍. 모양 조절값이 바뀌면 전부 버리고 다시 만든다.
      let styleKey = '';
      const panelTextures = new Map<string, { plain: import('pixi.js').Texture; hatch: import('pixi.js').Texture }>();
      let edgeTexture: import('pixi.js').Texture | null = null;
      // 텍스처 높이를 판넬 화면 높이와 맞춰야 빗금 간격이 세로로 늘어나지 않는다.
      const texturesFor = (group: RestPanelGroup, current: Controls, panelHeight: number) => {
        const height = Math.max(1, Math.round(panelHeight));
        const nextStyle = `${current.brightness}:${current.edgeStyle}:${current.stripeWidth}:${current.fadeStart}:${current.topBrightness}:${height}:${window.devicePixelRatio}`;
        if (nextStyle !== styleKey) {
          for (const pair of panelTextures.values()) {
            for (const texture of [pair.plain, pair.hatch]) {
              textures.delete(texture);
              texture.destroy(true);
            }
          }
          panelTextures.clear();
          if (edgeTexture) {
            textures.delete(edgeTexture);
            edgeTexture.destroy(true);
          }
          // 렌더러가 실제로 텍스처를 다시 만들었는지 E2E가 읽는다.
          host.dataset.panelTextureHeight = String(height);
          host.dataset.panelTextureEdge = current.edgeStyle;
          edgeTexture = createRestEdgeTexture({
            height, resolution: window.devicePixelRatio || 1,
            fadeStart: current.fadeStart / 100, topBrightness: current.topBrightness / 100,
          });
          textures.add(edgeTexture);
          styleKey = nextStyle;
        }
        const key = `${group.firstLane}:${group.laneCount}`;
        let pair = panelTextures.get(key);
        if (!pair) {
          const base = {
            width: LANE_WIDTH * group.laneCount, height, resolution: window.devicePixelRatio || 1,
            laneColors: Array.from({ length: group.laneCount }, (_, index) => laneColor(group.firstLane + index)),
            separator: { color: COLORS.LANE_SEPARATOR, width: SEPARATOR_WIDTH },
            phaseX: group.firstLane * LANE_WIDTH,
          };
          pair = {
            plain: createRestPanelTexture(base),
            hatch: createRestPanelTexture({
              ...base, hatch: {
                brightness: current.brightness / 100, stripeEdgeRed: current.edgeStyle === 'red-stripe', stripeWidth: current.stripeWidth,
                fadeStart: current.fadeStart / 100, topBrightness: current.topBrightness / 100,
              },
            }),
          };
          textures.add(pair.plain);
          textures.add(pair.hatch);
          panelTextures.set(key, pair);
        }
        return { ...pair, edge: edgeTexture! };
      };
      const resize = () => {
        const { width, height } = host.getBoundingClientRect();
        app.renderer.resize(Math.max(1, width), Math.max(1, height), window.devicePixelRatio || 1);
        const scale = Math.min(width / LANE_AREA_WIDTH, height / GAME_HEIGHT);
        root.scale.set(scale);
        root.position.set((width - LANE_AREA_WIDTH * scale) / 2, (height - GAME_HEIGHT * scale) / 2);
      };
      const draw = () => {
        const current = controlsRef.current;
        const zones = ZONE_PRESETS[current.preset].zones;
        const groups = groupRestPanels(zones, current.mergeAdjacent);
        const camera = { cameraDistance: current.cameraDistance, eyeHeight: 0.5 };
        const view = laneView(current);
        judgment.y = view.judgeY - JUDGE_Y;
        // 지금 접혀 있는 판넬만 firstLane 순서로(groupRestPanels가 이미 정렬). 이웃·공유 카메라 계산의 입력이다.
        const states = groups
          .map(group => ({ group, progress: restPanelState(timeRef.current, groupTiming(group, current.estimatedDwellMs, current.animMs)).progress }));
        const active = states.filter(entry => entry.progress > 0);
        // 화면에 그린 진행도를 판넬마다 알린다. React 상태 표시와 따로 계산하므로 E2E가 렌더 경로를 확인할 수 있다.
        const drawnProgress = states.map(entry => entry.progress.toFixed(3)).join(',');
        if (host.dataset.drawnProgress !== drawnProgress) host.dataset.drawnProgress = drawnProgress;
        const panels: FoldingPanel[] = active.map(({ group, progress }) => ({ firstLane: group.firstLane, laneCount: group.laneCount, progress }));
        const folding = active.map(entry => entry.group);
        slots.forEach((slot, index) => {
          const entry = active[index];
          slot.container.visible = !!entry;
          if (!entry) return;
          const { group, progress } = entry;
          const x = group.firstLane * LANE_WIDTH;
          const width = group.laneCount * LANE_WIDTH;
          slot.voidRect.position.set(x, view.visibleTop);
          slot.voidRect.scale.set(width, view.panelHeight);
          const pair = texturesFor(group, current, view.panelHeight);
          slot.plain.texture = pair.plain;
          slot.hatch.texture = pair.hatch;
          // 혼자면 카메라는 판넬 가운데라 대칭으로 접힌다. 틈 메우기를 켜면 붙어 접히는 이웃과 카메라를 나눠 써서
          // 맞닿은 변이 겹친다(이웃 progress로 가중해 연속으로 옮겨 간다).
          const cameraX = (current.fillGaps ? sharedCameraLane(panels, index) : group.firstLane + group.laneCount / 2) * LANE_WIDTH;
          const angle = progress * current.maxAngle * Math.PI / 180;
          const rect = { x, width, hingeY: view.judgeY, height: view.panelHeight };
          const [tl, tr, br, bl] = panelCorners(rect, angle, camera, cameraX);
          for (const mesh of [slot.plain, slot.hatch]) mesh.setCorners(tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y);
          slot.hatch.alpha = progress;
          const neighbors = current.fillGaps ? neighborProgress(panels, index) : { left: 0, right: 0 };
          for (const side of ['left', 'right'] as const) {
            const mesh = side === 'left' ? slot.leftEdge : slot.rightEdge;
            // 이웃이 접힌 만큼 테두리를 빼고 레인 구분선(양쪽 판넬이 절반 폭씩)을 넣는다.
            const seam = neighbors[side];
            const hasOutline = current.edgeStyle === 'red-outline' || current.edgeStyle === 'rim';
            const outline = hasOutline ? 1 - seam : 0;
            const strength = outline + seam;
            mesh.visible = strength > 0;
            if (strength <= 0) continue;
            const toSeam = seam / strength;
            const edgeWidth = RED_EDGE_WIDTH + (SEPARATOR_WIDTH / 2 - RED_EDGE_WIDTH) * toSeam;
            const edgeX = side === 'left' ? x : x + width - edgeWidth;
            const [etl, etr, ebr, ebl] = panelCorners({ ...rect, x: edgeX, width: edgeWidth }, angle, camera, cameraX);
            mesh.texture = pair.edge;
            mesh.setCorners(etl.x, etl.y, etr.x, etr.y, ebr.x, ebr.y, ebl.x, ebl.y);
            const outlineColor = current.edgeStyle === 'rim'
              ? brighten(laneColor(side === 'left' ? group.firstLane : group.firstLane + group.laneCount - 1), RIM_BRIGHTNESS)
              : REST_EDGE_RED;
            mesh.tint = mixColor(outlineColor, COLORS.LANE_SEPARATOR, toSeam);
            mesh.alpha = progress * strength;
          }
        });
        // 접히는 판넬 안쪽의 레인 구분선은 판넬 텍스처가, 틈을 메운 두 판넬 사이 구분선은 두 판넬의 변 띠가 판넬과 함께
        // 기울여 그린다. 판넬은 판정선 위만 덮으므로 화면 레이어는 그 구분선의 판정선~레인 끝 부분만 계속 그린다.
        separators.clear();
        for (let boundary = 1; boundary < LANE_COUNT; boundary++) {
          const top = separatorTop(boundary, folding, current.fillGaps, view.judgeY);
          separators.rect(boundary * LANE_WIDTH - SEPARATOR_WIDTH / 2, top, SEPARATOR_WIDTH, LANE_END_Y - top).fill(COLORS.LANE_SEPARATOR);
        }
        notes.clear();
        if (current.showNotes) {
          for (const note of DEMO_NOTES) {
            if (zones.some(zone => zone.lane === note.lane && note.beat > zone.beat && note.beat < zone.endBeat)) continue;
            // 이전·현재·다음 반복을 함께 확인해 루프 경계에서도 노트가 끊기지 않는다.
            for (const offset of [-LOOP_MS, 0, LOOP_MS]) {
              const y = view.judgeY - (note.ms + offset - timeRef.current) * current.scrollPxPerSecond / 1000;
              if (y + NOTE_HEIGHT / 2 < 0 || y - NOTE_HEIGHT / 2 > LANE_END_Y) continue;
              notes.roundRect(note.lane * LANE_WIDTH + (LANE_WIDTH - NOTE_WIDTH) / 2, y - NOTE_HEIGHT / 2, NOTE_WIDTH, NOTE_HEIGHT, 3).fill(0xe8efff);
            }
          }
        }
        suddenCover.clear();
        if (view.visibleTop > 0) {
          suddenCover.rect(0, 0, LANE_AREA_WIDTH, view.visibleTop).fill(SUDDEN_COVER_COLOR)
            .rect(0, view.visibleTop - 2, LANE_AREA_WIDTH, 2).fill(SUDDEN_EDGE_COLOR);
        }
      };
      let lastReport = 0;
      app.ticker.add(ticker => {
        if (cancelled || destroyed) return;
        if (controlsRef.current.playing) timeRef.current = (timeRef.current + ticker.deltaMS * controlsRef.current.playbackRate) % LOOP_MS;
        draw();
        // React 상태는 읽기 표시만 담당하고, 프레임 시각은 ref 한 곳에서 진행한다.
        if (ticker.lastTime - lastReport >= 50) {
          lastReport = ticker.lastTime;
          setTimeMs(timeRef.current);
        }
      });
      observer.observe(host);
      window.addEventListener('resize', onResize);
      resize();
      draw();
      app.render();
      app.start();
      setReady(true);
    };
    void init().catch((cause: unknown) => {
      dispose?.();
      if (!cancelled) setError(cause instanceof Error ? cause.message : '미리보기를 시작하지 못했습니다. 새로고침해 주세요.');
    });
    return () => {
      cancelled = true;
      dispose?.();
      canvas.remove();
    };
  }, []);

  const presetZones = ZONE_PRESETS[controls.preset].zones;
  const view = laneView(controls);
  const minZoneMs = minRestZoneMs(controls.estimatedDwellMs, controls.animMs);
  const groupStates = groupRestPanels(presetZones, controls.mergeAdjacent).map(group => {
    const timing = groupTiming(group, controls.estimatedDwellMs, controls.animMs);
    // 빈 레인 창 [시작, 끝 − 추정 녹숫]의 가운데가 가장 많이 넘어간 순간이다.
    const peak = restPanelState((group.beat * BEAT_MS + timing.endMs) / 2, timing).progress;
    return { group, peak, zoneMs: (group.endBeat - group.beat) * BEAT_MS, ...restPanelState(timeMs, timing) };
  });
  const shortGroups = groupStates.filter(state => state.zoneMs < minZoneMs);
  // 양수면 사용자 설정이 추정보다 느려 다음 노트가 판넬이 다 올라오기 전에 보인다.
  const dwellGapMs = view.dwellMs - controls.estimatedDwellMs;
  const heightPercent = Math.round(fallenHeightRatio(controls.maxAngle * Math.PI / 180, { cameraDistance: controls.cameraDistance, eyeHeight: 0.5 }) * 100);

  return (
    <main className="rest-zone-lab" data-lab-page="rest-zone-lane" data-preview-ready={ready}>
      <header className="rest-zone-header">
        <Link to="/lab" aria-label="Preview Archive로 돌아가기">← Lab 목록</Link>
        <h1>restZone 레인 판넬</h1>
        <p>restZone 동안 뒤로 넘어갔다 차트의 추정 녹숫에 맞춰 올라오는 레인을 확인합니다.</p>
      </header>
      <div className="rest-zone-workbench">
        <section className="rest-zone-preview" aria-label="레인 미리보기">
          <p className="rest-zone-chart">
            120 BPM · 32박 반복 · restZone {presetZones.map(zone => `레인 ${zone.lane + 1} ${zone.beat} → ${zone.endBeat}박`).join(', ')}
          </p>
          <div className="rest-zone-canvas" ref={hostRef} />
          {!ready && !error && <p role="status">미리보기 준비 중…</p>}
          {error && <p role="alert">{error}</p>}
          <div className="rest-zone-status" aria-label="현재 판넬 상태">
            <span>{seconds(timeMs)} / 16.00초</span>
            {groupStates.map(({ group, phase, progress }, index) => (
              <span key={`${group.firstLane}:${group.beat}`} className="rest-zone-group-status">
                {laneLabel(group)}{' '}
                {/* 첫 판넬의 상태만 data 속성으로 노출해 E2E가 하나를 가리키게 한다. */}
                <strong data-panel-phase={index === 0 ? phase : undefined}>{PHASE_LABEL[phase]}</strong>
                {' '}진행도 {Math.round(progress * 100)}%
              </span>
            ))}
          </div>
          <div className="rest-zone-transport">
            <button type="button" disabled={!ready} onClick={() => update('playing', !controls.playing)}>{controls.playing ? '일시정지' : '재생'}</button>
            <button type="button" onClick={() => seek(0)}>처음으로</button>
            <label>재생 속도
              <select aria-label="재생 속도" value={controls.playbackRate} onChange={event => update('playbackRate', Number(event.target.value))}>
                <option value={0.25}>0.25×</option><option value={0.5}>0.5×</option><option value={1}>1×</option>
              </select>
            </label>
          </div>
          <label className="rest-zone-control">재생 위치
            <input type="range" min={0} max={LOOP_MS} step={1} value={timeMs} onChange={event => seek(Number(event.target.value))} aria-valuetext={`${seconds(timeMs)}초`} />
          </label>
          <p className="rest-zone-hint">
            판넬은 restZone이 시작되면 {controls.animMs}ms 동안 넘어가고, restZone 끝 {seconds(controls.estimatedDwellMs)}초 전(추정 녹숫)까지 다 올라옵니다.
            모든 사용자가 같은 시각에 같은 연출을 봅니다.
          </p>
          {shortGroups.map(({ group, peak, zoneMs }) => (
            <p key={`${group.firstLane}:${group.beat}`} className="rest-zone-hint" role="note">
              {laneLabel(group)}: restZone {seconds(zoneMs)}초가 지침 최소 길이 {seconds(minZoneMs)}초(추정 녹숫 + 애니메이션 2번)보다 짧아
              {peak > 0 ? ` 최대 ${Math.round(peak * 100)}%까지만 넘어갑니다.` : ' 넘어가지 않습니다.'}
            </p>
          ))}
        </section>
        <section className="rest-zone-controls" aria-label="판넬 조절">
          <h2>판넬 조절</h2>
          <label className="rest-zone-control">넘어가는 각도 <span className="rest-zone-value">{controls.maxAngle}° · 넘어간 높이 {heightPercent}%</span>
            <input type="range" min={20} max={85} value={controls.maxAngle} onChange={event => update('maxAngle', Number(event.target.value))} />
          </label>
          <label className="rest-zone-control">원근 거리 <span className="rest-zone-value">{controls.cameraDistance.toFixed(1)}배</span>
            <input type="range" min={0.6} max={4} step={0.1} value={controls.cameraDistance} onChange={event => update('cameraDistance', Number(event.target.value))} />
          </label>
          <label className="rest-zone-control">애니메이션 길이 <span className="rest-zone-value">{controls.animMs} ms</span>
            <input type="range" min={100} max={1000} step={10} value={controls.animMs} onChange={event => update('animMs', Number(event.target.value))} />
          </label>
          <label className="rest-zone-control">테두리
            <select aria-label="테두리" value={controls.edgeStyle} onChange={event => update('edgeStyle', event.target.value as EdgeStyle)}>
              {(Object.keys(EDGE_STYLE_LABEL) as EdgeStyle[]).map(style => <option key={style} value={style}>{EDGE_STYLE_LABEL[style]}</option>)}
            </select>
          </label>
          <label className="rest-zone-control">빗금 레인색 밝기 <span className="rest-zone-value">{controls.brightness}%</span>
            <input type="range" min={100} max={250} step={5} value={controls.brightness} onChange={event => update('brightness', Number(event.target.value))} />
          </label>
          <label className="rest-zone-control">빗금 간격 <span className="rest-zone-value">{controls.stripeWidth} px</span>
            <input type="range" min={2} max={24} step={1} value={controls.stripeWidth} onChange={event => update('stripeWidth', Number(event.target.value))} />
          </label>
          <label className="rest-zone-control">어둠 시작 위치 <span className="rest-zone-value">판넬 {controls.fadeStart}%부터</span>
            <input type="range" min={0} max={100} step={5} value={controls.fadeStart} onChange={event => update('fadeStart', Number(event.target.value))} />
          </label>
          <label className="rest-zone-control">윗변 남는 밝기 <span className="rest-zone-value">{controls.topBrightness}%</span>
            <input type="range" min={0} max={100} step={5} value={controls.topBrightness} onChange={event => update('topBrightness', Number(event.target.value))} />
          </label>
          <h3>차트 지침</h3>
          <label className="rest-zone-control">난이도별 추정 녹숫 <span className="rest-zone-value">{seconds(controls.estimatedDwellMs)}초</span>
            <input type="range" min={300} max={2500} step={10} value={controls.estimatedDwellMs} onChange={event => update('estimatedDwellMs', Number(event.target.value))} />
          </label>
          <p className="rest-zone-hint">
            녹숫은 노트가 레인에 머무는 시간입니다. 지침상 restZone은 {seconds(minZoneMs)}초(추정 녹숫 + 애니메이션 2번) 이상이어야 합니다.
          </p>
          <h3>사용자 녹숫 <span className="rest-zone-value" data-note-dwell-ms={Math.round(view.dwellMs)}>{seconds(view.dwellMs)}초</span></h3>
          <p className="rest-zone-hint" data-dwell-gap-ms={Math.round(dwellGapMs)}>
            {dwellGapMs > 0.5
              ? `추정보다 ${seconds(dwellGapMs)}초 느린 설정입니다. 다음 노트가 판넬이 다 올라오기 ${seconds(dwellGapMs)}초 전에 나타납니다.`
              : dwellGapMs < -0.5
                ? `추정보다 ${seconds(-dwellGapMs)}초 빠른 설정입니다. 판넬이 다음 노트보다 ${seconds(-dwellGapMs)}초 먼저 올라옵니다.`
                : '추정과 같은 설정입니다. 판넬이 다 올라오는 순간 다음 노트가 나타납니다.'}
            {' '}스크롤 속도·리프트·서든이 모두 이 시간 하나로 모입니다.
          </p>
          <label className="rest-zone-control">스크롤 속도 <span className="rest-zone-value">{controls.scrollPxPerSecond} px/초</span>
            <input type="range" min={200} max={2000} value={controls.scrollPxPerSecond} onChange={event => update('scrollPxPerSecond', Number(event.target.value))} />
          </label>
          <label className="rest-zone-control">리프트 <span className="rest-zone-value">{controls.liftPercent}%</span>
            <input type="range" min={0} max={40} value={controls.liftPercent} onChange={event => update('liftPercent', Number(event.target.value))} />
          </label>
          <label className="rest-zone-control">서든 <span className="rest-zone-value">{controls.suddenPercent}%</span>
            <input type="range" min={0} max={60} value={controls.suddenPercent} onChange={event => update('suddenPercent', Number(event.target.value))} />
          </label>
          <label className="rest-zone-control">restZone 배치
            <select aria-label="restZone 배치" value={controls.preset} onChange={event => update('preset', event.target.value as ZonePreset)}>
              {(Object.keys(ZONE_PRESETS) as ZonePreset[]).map(preset => <option key={preset} value={preset}>{ZONE_PRESETS[preset].label}</option>)}
            </select>
          </label>
          <label className="rest-zone-checkbox"><input type="checkbox" checked={controls.mergeAdjacent} onChange={event => update('mergeAdjacent', event.target.checked)} />인접 레인 묶기</label>
          <p className="rest-zone-hint">시작·끝 박이 모두 같은 인접 레인만 판넬 하나로 같이 접힙니다.</p>
          <label className="rest-zone-checkbox"><input type="checkbox" checked={controls.fillGaps} onChange={event => update('fillGaps', event.target.checked)} />레인 사이 틈 메우기</label>
          <p className="rest-zone-hint">이웃 판넬이 같이 접혀 있으면 서로 쪽으로 기울어 맞닿습니다. 혼자일 때는 대칭으로 접힙니다.</p>
          <label className="rest-zone-checkbox"><input type="checkbox" checked={controls.showNotes} onChange={event => update('showNotes', event.target.checked)} />노트 표시</label>
        </section>
      </div>
    </main>
  );
}
