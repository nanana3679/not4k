import { beatFromString, beatIsPositive, beatIsZero, beatLt, type Beat } from '../types/beat';

/** songs.timing JSON 계약. 박은 차트 JSON과 같은 분수 문자열이며 editorLane은 저장하지 않는다. */
export interface SongTiming {
  readonly bpmChanges: readonly { readonly beat: string; readonly bpm: number }[];
  readonly timeSignatureChanges: readonly { readonly beat: string; readonly beatPerMeasure: string }[];
  readonly offsetMs: number;
}

export class SongTimingError extends Error {
  constructor(detail: string) {
    super(`곡 타이밍이 유효하지 않습니다: ${detail}`);
    this.name = 'SongTimingError';
  }
}

function objectWithKeys(value: unknown, keys: string[], path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== keys.length
    || !keys.every(key => Object.hasOwn(value, key))) {
    throw new SongTimingError(`${path}: ${keys.join(', ')} 필드가 필요합니다`);
  }
  return value as Record<string, unknown>;
}

function fraction(value: unknown, path: string): Beat {
  try {
    if (typeof value !== 'string') throw new Error();
    return beatFromString(value);
  } catch {
    throw new SongTimingError(`${path}: 정수 또는 분수 문자열이 필요합니다`);
  }
}

function validateChanges(value: unknown, field: 'bpm' | 'beatPerMeasure', path: string): void {
  if (!Array.isArray(value) || value.length === 0) {
    throw new SongTimingError(`${path}: 0박 초기값을 포함한 목록이 필요합니다`);
  }
  let previous: Beat | undefined;
  for (const [index, entry] of value.entries()) {
    const entryPath = `${path}[${index}]`;
    const row = objectWithKeys(entry, ['beat', field], entryPath);
    const position = fraction(row.beat, `${entryPath}.beat`);
    if (index === 0 && !beatIsZero(position)) {
      throw new SongTimingError(`${path}: 첫 항목은 0박이어야 합니다`);
    }
    if (previous && !beatLt(previous, position)) {
      throw new SongTimingError(`${entryPath}.beat: 중복 없이 박 순서가 증가해야 합니다`);
    }
    previous = position;
    if (field === 'bpm') {
      if (typeof row.bpm !== 'number' || !Number.isFinite(row.bpm) || row.bpm <= 0) {
        throw new SongTimingError(`${entryPath}.bpm: 유한한 양수가 필요합니다`);
      }
    } else if (!beatIsPositive(fraction(row.beatPerMeasure, `${entryPath}.beatPerMeasure`))) {
      throw new SongTimingError(`${entryPath}.beatPerMeasure: 양수가 필요합니다`);
    }
  }
}

/** DB는 객체 여부만 검사한다. NULL 폴백은 호출자가 결정하며, 잘못된 JSON은 여기서 거부한다. */
export function parseSongTiming(value: unknown): SongTiming {
  const row = objectWithKeys(value, ['bpmChanges', 'timeSignatureChanges', 'offsetMs'], 'timing');
  if (typeof row.offsetMs !== 'number' || !Number.isFinite(row.offsetMs)) {
    throw new SongTimingError('offsetMs: 유한한 숫자가 필요합니다');
  }
  validateChanges(row.bpmChanges, 'bpm', 'bpmChanges');
  validateChanges(row.timeSignatureChanges, 'beatPerMeasure', 'timeSignatureChanges');
  return value as SongTiming;
}

