import { Container, Rectangle, Sprite, Texture } from 'pixi.js';
import { clampFlightAltitude } from './flightAltitude';
import type { GearGaugeGeometry } from './gearLayout';
import { GEAR_MOTION_MAX_STEP_MS } from './GearMotionController';

/**
 * 기어 양옆 유리관의 고도 게이지. 비행 배경과 같은 `altitude`(0~1)를 두 유리관에 똑같이, 아래 기준 채움으로 보여 준다.
 * 승인 시연(press-animation.html)처럼 기어 그림의 가득 찬 유리관 위에 빈 유리(`gearGaugeEmpty`, v18 생성 이미지를 유리 안쪽 윤곽
 * 알파로 자른 아틀라스)를 위에서부터 채움 경계까지 덮고, 경계 8행은 부드럽게 옅어진다. 색은 바꾸지 않고 낮은 고도 경고도 없다.
 *
 * - 좌표: 컨테이너는 기어 그림 좌표다. 렌더러가 기어 스프라이트와 같은 변환을 지정하고 `gearMotion`(기어 위 장식 애니메이션) 위에 추가한다. 다른 `gearMotion` 레이어는
 *   유리 안쪽에 그리지 않으므로, 빈 부분에서는 덮개가 `gearMotion`의 액체·기포만 가리고 아래(채운 부분)에서만 그것들이 보인다.
 * - 부드러운 경계: 마스크·필터·렌더 텍스처 없이 아틀라스의 한 행씩을 보여 주는 스프라이트 8개에 알파를 준다. 유리관마다 본체 1개와
 *   경계 8개, 두 유리관 18개 사각형이 텍스처 소스 하나라 한 배치로 그려진다(추가 렌더 패스 없음).
 * - 갱신: 표시하는 빈 행 수가 바뀔 때만 텍스처 frame·위치·알파를 고친다. 프레임마다 객체를 만들지 않는다.
 * - 경과 시간: 이징은 렌더러가 넘기는 게임 프레임 간격(`renderFrame`의 deltaMs, 최대 50ms)으로만 나아가 일시정지 중에는 멈춘다.
 */

/**
 * 이징 시간 상수(ms). 표시 채움이 목표로 `1 − e^(−t/τ)`만큼 다가간다. 승인 시연은 CSS 300ms ease-out(cubic-bezier(0, 0, .58, 1))이고,
 * τ 75ms는 225ms에 95%, 300ms에 98%를 지나 시연처럼 약 300ms에 움직임이 끝나 보인다. 곡선 모양을 최소제곱으로 맞추면 τ가 130ms 안팎이지만
 * 그러면 MISS 낙하의 마지막 몇 px이 0.6초 넘게 기어가 시연보다 굼떠 보인다. 시작은 시연보다 빠르다(ease-out 느낌은 같다).
 * 지수 접근이라 목표가 곡 진행처럼 계속 움직여도 다시 시작할 필요가 없고, 프레임 간격이 달라도 같은 시간에는 같은 곳에 이른다.
 */
export const GEAR_GAUGE_EASE_TAU_MS = 75;
/** 아래 경계를 부드럽게 옅게 하는 행 수(승인 시연의 8px 그라데이션). */
export const GEAR_GAUGE_EDGE_ROWS = 8;
/** 남은 거리가 이보다 작으면 목표로 맞춘다(유리관 0.8행, 렌더 높이 1080에서 화면 약 0.7px). 그 뒤로는 갱신이 멈춘다. */
const SETTLE_LEVEL = 0.001;

/** 고도를 게이지 채움 0~1로 자른다. NaN·무한대는 비행 배경·고도 모델과 같은 규칙으로 0(빈 유리관)이다. */
export function clampGaugeLevel(level: number): number {
  return clampFlightAltitude(level);
}

/** 채움 level에서 위쪽 빈 유리 행 수. 채움 구간 fillRows행 중 (1 − 채움)만큼을 정수 행으로 반올림한다. */
export function gaugeEmptyRows(level: number, fillRows: number): number {
  return Math.round((1 - clampGaugeLevel(level)) * fillRows);
}

/**
 * 빈 유리 덮개의 아래끝(행, 배타). 경계 가운데(알파 1/2)가 빈 행의 끝(emptyRows행 위끝)에 오도록 경계 반(4행)만큼 아래로 내린다.
 * 빈 행이 8행보다 적으면 그 반만큼만 내려 채움 1 근처에서 덮개가 갑자기 진하게 생기지 않고, 전부 비면(emptyRows ≥ fillRows) 경계를
 * 유리관 밖으로 밀어 모든 행을 알파 1로 덮는다(승인 시연과 같다).
 */
export function gaugeCoverBottom(emptyRows: number, fillRows: number): number {
  if (emptyRows <= 0) return 0;
  if (emptyRows >= fillRows) return fillRows + GEAR_GAUGE_EDGE_ROWS;
  return emptyRows + Math.min(GEAR_GAUGE_EDGE_ROWS / 2, Math.floor(emptyRows / 2));
}

/** 덮개 아래끝이 bottom일 때 행 row(행 가운데)의 덮개 알파: 위쪽 1, 아래 경계 8행은 15/16 → 1/16, 그 아래 0. */
export function gaugeCoverAlpha(bottom: number, row: number): number {
  return Math.min(1, Math.max(0, (bottom - row - 0.5) / GEAR_GAUGE_EDGE_ROWS));
}

/**
 * 표시 채움을 목표로 deltaMs만큼 다가가게 한다(지수 접근, τ = GEAR_GAUGE_EASE_TAU_MS). 간격은 `gearMotion`처럼 최대 50ms로 자르고,
 * 0·음수·NaN이면 움직이지 않는다. 남은 거리가 0.001보다 작으면 목표로 맞춘다.
 */
export function easeGaugeLevel(display: number, target: number, deltaMs: number): number {
  if (!(deltaMs > 0)) return display;
  const step = Math.min(GEAR_MOTION_MAX_STEP_MS, deltaMs);
  const next = target + (display - target) * Math.exp(-step / GEAR_GAUGE_EASE_TAU_MS);
  return Math.abs(next - target) < SETTLE_LEVEL ? target : next;
}

export interface GearGaugeOptions {
  /** 빈 유리 아틀라스(스킨 공통 `gearGaugeEmpty`). 소유자는 SkinManager이며 destroy가 파괴하지 않는다. */
  texture: Texture;
  geometry: GearGaugeGeometry;
}

interface TubeCover {
  /** 아틀라스 텍스처 소스에서 이 유리관 상자의 위끝 행. */
  atlasTop: number;
  body: Sprite;
  edges: Sprite[];
}

/**
 * 고도 게이지 하나의 수명. 렌더러가 기어를 그릴 때 만들어 기어 레이어의 `gearMotion` 위에 붙이고, 프레임마다 update(고도, deltaMs)를 부른다.
 * 처음 update와 snapNext 뒤의 update는 이징 없이 목표로 바로 맞춘다(차트 걸기·곡 시작 전 한 장).
 */
export class GearGauge {
  /** 기어 그림 좌표의 덮개 루트(두 유리관). 채움 1이면 숨긴다. */
  readonly container: Container;
  private readonly fillRows: number;
  private readonly covers: TubeCover[];
  private readonly ownedTextures: Texture[] = [];
  private display = 1;
  private targetLevel = 1;
  private shownRows = 0;
  private snapPending = true;
  private destroyed = false;

  constructor({ texture, geometry }: GearGaugeOptions) {
    this.fillRows = geometry.fillRows;
    this.container = new Container({ label: 'gear-gauge' });
    const sides = ['left', 'right'] as const;
    this.covers = geometry.tubes.map((tube, index) => {
      const holder = new Container({ label: `gear-gauge-${sides[index]}` });
      holder.position.set(tube.x, tube.y);
      // 행 frame을 바꿔 가며 쓰므로 dynamic 텍스처로 만든다(스프라이트가 frame 변경을 알아챈다).
      const rowTexture = (rows: number) => {
        const owned = new Texture({
          source: texture.source,
          frame: new Rectangle(texture.frame.x + tube.atlasX, texture.frame.y + tube.atlasY, tube.width, rows),
          dynamic: true,
        });
        this.ownedTextures.push(owned);
        return owned;
      };
      const body = new Sprite({ texture: rowTexture(1), label: 'gear-gauge-body' });
      body.visible = false;
      holder.addChild(body);
      const edges = Array.from({ length: GEAR_GAUGE_EDGE_ROWS }, (_, row) => {
        const edge = new Sprite({ texture: rowTexture(1), label: `gear-gauge-edge-${row}` });
        edge.visible = false;
        holder.addChild(edge);
        return edge;
      });
      this.container.addChild(holder);
      return { atlasTop: texture.frame.y + tube.atlasY, body, edges };
    });
    this.container.visible = false;
  }

  /** 지금 화면에 보이는 채움(0~1, 이징 반영). */
  get level(): number { return this.display; }
  /** 다가가는 목표 채움(마지막 update의 고도를 0~1로 자른 값). */
  get target(): number { return this.targetLevel; }
  /** 지금 덮는 위쪽 빈 행 수(0~fillRows). */
  get emptyRows(): number { return this.shownRows; }

  /** 이번 프레임의 고도로 목표를 정하고 deltaMs만큼 다가간다. 표시 행이 바뀔 때만 덮개를 고친다. */
  update(altitude: number, deltaMs: number): void {
    if (this.destroyed) return;
    this.targetLevel = clampGaugeLevel(altitude);
    if (this.snapPending) {
      this.snapPending = false;
      this.display = this.targetLevel;
    } else {
      this.display = easeGaugeLevel(this.display, this.targetLevel, deltaMs);
    }
    const rows = gaugeEmptyRows(this.display, this.fillRows);
    if (rows !== this.shownRows) this.applyRows(rows);
  }

  /** 다음 update는 이징 없이 목표로 바로 맞춘다(차트를 다시 걸 때·곡 시작 전 한 장). */
  snapNext(): void {
    this.snapPending = true;
  }

  /** 덮개 컨테이너와 이 게이지가 만든 행 텍스처를 정리한다(받은 아틀라스는 SkinManager 소유라 남긴다). 두 번 불러도 된다. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (!this.container.destroyed) {
      this.container.removeFromParent();
      this.container.destroy({ children: true });
    }
    for (const texture of this.ownedTextures) if (!texture.destroyed) texture.destroy(false);
    this.ownedTextures.length = 0;
  }

  private applyRows(rows: number): void {
    this.shownRows = rows;
    const bottom = gaugeCoverBottom(rows, this.fillRows);
    this.container.visible = bottom > 0;
    if (bottom <= 0) return;
    const solidRows = Math.min(this.fillRows, Math.max(0, bottom - GEAR_GAUGE_EDGE_ROWS));
    const edgeTop = Math.max(0, bottom - GEAR_GAUGE_EDGE_ROWS);
    for (const { atlasTop, body, edges } of this.covers) {
      body.visible = solidRows > 0;
      if (solidRows > 0) setFrameRows(body, atlasTop, 0, solidRows);
      for (let index = 0; index < edges.length; index++) {
        const edge = edges[index];
        const row = edgeTop + index;
        edge.visible = row < bottom && row < this.fillRows;
        if (!edge.visible) continue;
        setFrameRows(edge, atlasTop, row, 1);
        edge.y = row;
        edge.alpha = gaugeCoverAlpha(bottom, row);
      }
    }
  }
}

/** 스프라이트의 행 텍스처를 유리관 상자의 row행부터 rows행으로 바꾼다(같은 Rectangle을 고쳐 쓰고 새 객체를 만들지 않는다). */
function setFrameRows(sprite: Sprite, atlasTop: number, row: number, rows: number): void {
  const texture = sprite.texture;
  texture.frame.y = atlasTop + row;
  texture.frame.height = rows;
  texture.update();
}
