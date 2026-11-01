import { supabase } from './client';

/**
 * 차트 파일을 찾고 저장할 때 쓰는 `charts` 행(RFD 0107). 경로가 NULL이면 기존 결정적 경로를 읽는다.
 * `revision`은 차트 저장의 충돌 검사값이며 기록용 차트 버전과 무관하다.
 */
export interface StoredChartRow {
  readonly id: string;
  readonly difficultyLabel: string;
  readonly revision: number;
  readonly chartPath: string | null;
  readonly chartExtraPath: string | null;
}

export const CHART_ROW_COLUMNS = 'id,difficulty_label,revision,chart_path,chart_extra_path';

/** `charts` 행의 DB 표현(snake_case). 경로 열은 PR1 마이그레이션 전 응답이나 테스트 응답에 없을 수 있다. */
export interface ChartRowRecord {
  id: string;
  difficulty_label: string;
  revision: number;
  chart_path?: string | null;
  chart_extra_path?: string | null;
}

/** DB 행(snake_case)을 도메인 값으로 옮긴다. 경로 열이 없거나 NULL이면 NULL(기존 결정적 경로)이다. */
export function toStoredChartRow(record: ChartRowRecord): StoredChartRow {
  return {
    id: record.id,
    difficultyLabel: record.difficulty_label,
    revision: record.revision,
    chartPath: record.chart_path ?? null,
    chartExtraPath: record.chart_extra_path ?? null,
  };
}

/**
 * 열린 난이도의 행을 고른다. 같은 이름을 먼저 찾고, 없으면 대소문자만 다른 이름을 쓴다.
 * 기존 결정적 경로는 소문자 난이도명이라 대소문자만 다른 행도 같은 파일을 가리킨다.
 */
export function findChartRow(rows: readonly StoredChartRow[], difficulty: string): StoredChartRow | null {
  return rows.find(row => row.difficultyLabel === difficulty)
    ?? rows.find(row => row.difficultyLabel.toLowerCase() === difficulty.toLowerCase())
    ?? null;
}

/** 곡의 모든 차트 행. Save As 덮어쓰기 확인과 저장 응답 유실 확인에 쓴다. */
export async function fetchChartRows(songId: string): Promise<StoredChartRow[]> {
  const { data, error } = await supabase.from('charts').select(CHART_ROW_COLUMNS).eq('song_id', songId);
  if (error) throw error;
  return ((data ?? []) as ChartRowRecord[]).map(toStoredChartRow);
}
