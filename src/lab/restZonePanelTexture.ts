import { CanvasSource, Texture } from 'pixi.js';
import { depthFadeAlpha } from './restZonePanel';


/** 판넬 전용 텍스처. 호출자가 교체·종료 시 destroy(true)로 소유권을 정리한다. */
export function createRestPanelTexture(options: {
  width: number;
  height: number;
  resolution: number;
  /** 판넬이 덮는 레인들의 색(왼쪽부터). 레인 하나의 폭은 width / laneColors.length다. */
  laneColors: readonly number[];
  /** 레인 사이 구분선. 판넬과 함께 기울도록 화면 레이어가 아니라 텍스처에 그린다. */
  separator?: { color: number; width: number };
  /** 판넬 왼쪽 끝의 화면 x. 빗금 위상을 화면 기준으로 맞춰 이웃 판넬과 줄이 이어지게 한다. */
  phaseX?: number;
  hatch?: {
    brightness: number;
    /** 빗금 경계마다 가는 붉은 선을 긋는다. */
    stripeEdgeRed: boolean;
    /** 레인색 줄·검정 줄 각각의 폭(줄에 수직으로 잰 논리 px). */
    stripeWidth: number;
    /** 깊이 어둠이 시작되는 판넬 위치(경첩 0 → 윗변 1). */
    fadeStart: number;
    /** 윗변에 남는 밝기(0이면 윗변이 검은 배경과 같다). */
    topBrightness: number;
  };
}): Texture {
  const { width, height, resolution, laneColors, separator, phaseX = 0, hatch } = options;
  const laneWidth = width / laneColors.length;
  const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width * resolution);
  canvas.height = Math.ceil(height * resolution);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('판넬 이미지를 만들 수 없습니다. 페이지를 새로고침해 주세요.');
  ctx.scale(canvas.width / width, canvas.height / height);
  const brightness = hatch?.brightness ?? 1;
  laneColors.forEach((laneColor, index) => {
    const channels = [16, 8, 0].map(shift => Math.min(255, Math.round(((laneColor >> shift) & 255) * brightness)));
    ctx.fillStyle = `rgb(${channels.join(',')})`;
    ctx.fillRect(index * laneWidth, 0, laneWidth, height);
  });
  const drawSeparators = () => {
    if (!separator) return;
    ctx.fillStyle = hex(separator.color);
    for (let index = 1; index < laneColors.length; index++) {
      ctx.fillRect(index * laneWidth - separator.width / 2, 0, separator.width, height);
    }
  };
  if (!hatch) drawSeparators();

  if (hatch) {
    // y = x + offset인 경계 사이의 수직 거리가 stripeWidth가 되도록 √2를 곱한다.
    const stripe = hatch.stripeWidth * Math.SQRT2;
    const period = stripe * 2;
    // 경계 y = x + offset이 화면 기준 y = (x + phaseX) + k·period와 같아지도록 위상을 옮겨 시작한다.
    const phase = ((phaseX % period) + period) % period;
    const start = phase - Math.ceil((width + period) / period) * period;
    for (let offset = start; offset < height + stripe; offset += period) {
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.moveTo(0, offset);
      ctx.lineTo(width, width + offset);
      ctx.lineTo(width, width + offset + stripe);
      ctx.lineTo(0, offset + stripe);
      ctx.closePath();
      ctx.fill();
      if (hatch.stripeEdgeRed) {
        ctx.strokeStyle = '#ff3344';
        ctx.lineWidth = 1;
        for (const edge of [offset, offset + stripe]) {
          ctx.beginPath();
          ctx.moveTo(0, edge);
          ctx.lineTo(width, width + edge);
          ctx.stroke();
        }
      }
    }
    drawSeparators();
    // 판넬 좌우 테두리는 텍스처에 굽지 않고 createRestEdgeTexture 띠로 따로 그린다.
    // 이웃 판넬과 맞닿으면 그 변만 구분선으로 바꿔야 하기 때문이다. 윗변·아랫변은 긋지 않는다.
    // 깊이 어둠: 테두리까지 함께 덮어 판넬 윗변이 뒤쪽 검은 배경에 녹아들게 한다. 텍스처 y 0이 윗변(t 1)이다.
    const fade = ctx.createLinearGradient(0, height, 0, 0);
    const STOPS = 16;
    for (let i = 0; i <= STOPS; i++) {
      const t = i / STOPS;
      fade.addColorStop(t, `rgba(0,0,0,${depthFadeAlpha(t, hatch.fadeStart, hatch.topBrightness)})`);
    }
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, width, height);
  }
  return new Texture({ source: new CanvasSource({ resource: canvas, resolution }) });
}

/** 판넬 좌우 변 띠의 기본 붉은색. */
export const REST_EDGE_RED = 0xff3344;

/**
 * 판넬 좌우 변 띠 텍스처: 흰색이 깊이 어둠만큼 검게 바뀌는 세로 그라데이션(불투명).
 * 메시 tint로 붉은색 또는 레인 구분선 색을 곱해 쓴다. 빗금 판넬과 같은 깊이 어둠을 따른다.
 */
export function createRestEdgeTexture(options: {
  height: number;
  resolution: number;
  fadeStart: number;
  topBrightness: number;
}): Texture {
  const { height, resolution, fadeStart, topBrightness } = options;
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = Math.ceil(height * resolution);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('판넬 이미지를 만들 수 없습니다. 페이지를 새로고침해 주세요.');
  const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
  const STOPS = 16;
  for (let i = 0; i <= STOPS; i++) {
    const t = i / STOPS;
    const level = Math.round(255 * (1 - depthFadeAlpha(t, fadeStart, topBrightness)));
    gradient.addColorStop(t, `rgb(${level},${level},${level})`);
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return new Texture({ source: new CanvasSource({ resource: canvas, resolution }) });
}
