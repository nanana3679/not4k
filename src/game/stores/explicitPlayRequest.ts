import type { ChartDocument, PlaybackRange } from '../../shared';
import { compileExplicitJudgmentChart } from '../judgment/explicitCompiledChart';
import type { ExplicitCompiledChart } from '../judgment/explicitCompiledChart';
import { selectExplicitPlaybackChart } from '../judgment/explicitPlaybackChart';

export interface ExplicitPlayTestOptions {
  document: ChartDocument;
  audioBuffer: AudioBuffer;
  returnUrl: string;
  auto?: boolean;
  /** 커서 테스트의 원본문서 시간 좌표. 이 시각 앞 항목은 Miss 없이 뺀다. 생략하면 처음부터 테스트로 일반 재생과 같은 항목을 쓴다. */
  startTimeMs?: number;
}

export interface ExplicitPlayRequest {
  readonly document: ChartDocument;
  readonly compiled: ExplicitCompiledChart;
  readonly audioBuffer: AudioBuffer;
  readonly returnUrl: string;
  readonly auto: boolean;
  /** 첫 진입 목표이자 되감기 하한 S. 처음부터 테스트와 일반 재생은 0이다. */
  readonly startTimeMs: number;
  /** 생략한 요청은 에디터/Lab 테스트의 음악 준비를 유지한다. */
  readonly purpose?: 'play' | 'test';
  readonly playbackRange?: PlaybackRange | null;
}

export interface NormalPlayOptions {
  document: ChartDocument;
  audioBuffer: AudioBuffer;
  playbackRange?: PlaybackRange | null;
}

/** 일반 곡도 전체 문서 검증을 통과해야 하며 시작 범위는 곡 시각 0이다. */
export function prepareNormalPlay(options: NormalPlayOptions): ExplicitPlayRequest {
  const document = structuredClone(options.document);
  const compiled = compileExplicitJudgmentChart(document);
  if (!Number.isFinite(options.audioBuffer.duration) || options.audioBuffer.duration <= 0) {
    throw new Error('재생할 음원이 없습니다.');
  }
  return { document, compiled, audioBuffer: options.audioBuffer, returnUrl: '/game', startTimeMs: 0, auto: false,
    purpose: 'play', playbackRange: options.playbackRange ? { ...options.playbackRange } : null };
}

/** 어떤 게임 상태나 오디오도 바꾸기 전에 전체 원본문서를 검증한다. aux도 의미 검사를 통과해야 한다. */
export function prepareExplicitPlayTest(options: ExplicitPlayTestOptions): ExplicitPlayRequest {
  const document = structuredClone(options.document);
  const wholeChart = compileExplicitJudgmentChart(document);
  const fromCursor = options.startTimeMs !== undefined;
  const startTimeMs = options.startTimeMs ?? 0;
  if (!Number.isFinite(startTimeMs) || startTimeMs < 0) {
    throw new Error('테스트 플레이 시작 시각은 0 이상의 유한한 값이어야 합니다.');
  }
  if (!Number.isFinite(options.audioBuffer.duration) || options.audioBuffer.duration <= 0) {
    throw new Error('테스트 플레이할 음원이 없습니다.');
  }
  // 처음부터 테스트는 일반 재생과 같은 항목·분모를 쓴다. 차트 offset으로 0 앞에 놓인 항목도 빼지 않는다.
  const compiled = fromCursor ? selectExplicitPlaybackChart(wholeChart, startTimeMs) : wholeChart;
  return { document, compiled, audioBuffer: options.audioBuffer, returnUrl: options.returnUrl,
    auto: options.auto ?? false, startTimeMs };
}

/**
 * 테스트 세션이 항목을 거르는 범위의 시작. 커서 테스트는 이미 커서에서 자른 차트라 S와 같고,
 * 처음부터 테스트는 0 앞에 놓인 가장 이른 항목·바디까지 넓혀 아무 항목도 빼지 않는다.
 */
export function explicitSessionRangeStartMs(request: Pick<ExplicitPlayRequest, 'compiled' | 'startTimeMs'>): number {
  let startMs = request.startTimeMs;
  for (const item of request.compiled.scoreItems) startMs = Math.min(startMs, item.timeMs);
  for (const body of request.compiled.bodies) startMs = Math.min(startMs, body.startMs);
  return startMs;
}
