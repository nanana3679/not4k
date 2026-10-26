import type { ChartDocument, PlaybackRange } from '../../shared';
import { compileExplicitJudgmentChart } from '../judgment/explicitCompiledChart';
import type { ExplicitCompiledChart } from '../judgment/explicitCompiledChart';
import { selectExplicitPlaybackChart } from '../judgment/explicitPlaybackChart';

export interface ExplicitPlayTestOptions {
  document: ChartDocument;
  audioBuffer: AudioBuffer;
  returnUrl: string;
  auto?: boolean;
  /** 원본문서의 시간 좌표. 생략하면 처음부터 시작한다. */
  startTimeMs?: number;
}

export interface ExplicitPlayRequest {
  readonly document: ChartDocument;
  readonly compiled: ExplicitCompiledChart;
  readonly audioBuffer: AudioBuffer;
  readonly returnUrl: string;
  readonly auto: boolean;
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
  const startTimeMs = options.startTimeMs ?? 0;
  if (!Number.isFinite(startTimeMs) || startTimeMs < 0) {
    throw new Error('테스트 플레이 시작 시각은 0 이상의 유한한 값이어야 합니다.');
  }
  if (!Number.isFinite(options.audioBuffer.duration) || options.audioBuffer.duration <= 0) {
    throw new Error('테스트 플레이할 음원이 없습니다.');
  }
  const compiled = selectExplicitPlaybackChart(wholeChart, startTimeMs);
  return { document, compiled, audioBuffer: options.audioBuffer, returnUrl: options.returnUrl,
    auto: options.auto ?? false, startTimeMs };
}
