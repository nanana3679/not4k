import type { Chart } from "../types";
import { serializeChart, serializeExtraNotes, mainNotes, auxNotesAsExtra } from "../chart";
import {
  songChartExtraRevisionPath,
  songChartExtraPath,
  songChartPath,
  songChartRevisionPath,
} from "../storage";
import { assertValidChartAssetRevision } from "./chartAssetRevision";

export interface TextAssetUpload {
  path: string;
  content: string;
  contentType: string;
  upsert: boolean;
}

/**
 * 차트 에셋 메타 upsert 페이로드 (도메인 언어).
 * DB 스키마(snake_case 행 타입)는 adapter 구현이 소유한다.
 */
export interface ChartAssetUpsert {
  songId: string;
  difficulty: string;
  difficultyLevel: number;
  offsetMs: number;
  revision: string | null;
  allowCreate: boolean;
  /** Save As overwrite 확인 시점의 revision. 지정되면 DB update를 CAS로 제한한다. */
  expectedRevision?: string | null;
}

export interface ChartAssetTarget {
  songId: string;
  difficulty: string;
}

export interface SongAssetPersistenceAdapter {
  createRevision: () => string;
  uploadText: (asset: TextAssetUpload) => Promise<void>;
  remove: (paths: string[]) => Promise<void>;
  publishChartRow: (row: ChartAssetUpsert) => Promise<void>;
  deleteChartRow: (target: ChartAssetTarget) => Promise<{ revision: string | null }>;
  listSongFiles: (songId: string) => Promise<string[]>;
  deleteSongRow: (songId: string) => Promise<void>;
}

export interface SaveChartAssetInput extends ChartAssetTarget {
  /** 보조 노트(lane 5+)를 포함한 통합 차트. 저장 시 메인/보조 파일로 분리한다 (RFD 0018 ③). */
  chart: Chart;
  extraLaneCount: number;
  /** Save As처럼 대상 난이도가 없을 때 insert-only 생성을 수행한다. 일반 저장은 false. */
  allowCreate?: boolean;
  /** Save As overwrite 확인 시점의 revision. null도 유효한 기대값이므로 property 존재 여부로 구분한다. */
  expectedRevision?: string | null;
}

export interface CreateChartAssetInput extends ChartAssetTarget {
  chart: Chart;
}

export interface ChartAssetWriteResult {
  chartPath: string;
  extraPath: string;
  revision: string;
  chartJson: string;
  extraJson: string;
  difficulty: string;
}

export async function saveChartAsset(
  adapter: SongAssetPersistenceAdapter,
  input: SaveChartAssetInput,
): Promise<ChartAssetWriteResult> {
  const payload = buildChartPayload(input);
  const revision = adapter.createRevision();
  assertValidChartAssetRevision(revision);
  const asset: ChartAssetWriteResult = {
    ...payload,
    chartPath: songChartRevisionPath(input.songId, payload.difficulty, revision),
    extraPath: songChartExtraRevisionPath(input.songId, payload.difficulty, revision),
    revision,
  };
  const stagedPaths = [asset.chartPath, asset.extraPath];
  const stagedWrites = await Promise.allSettled([
    adapter.uploadText({
      path: asset.chartPath,
      content: asset.chartJson,
      contentType: "application/json",
      upsert: false,
    }),
    adapter.uploadText({
      path: asset.extraPath,
      content: asset.extraJson,
      contentType: "application/json",
      upsert: false,
    }),
  ]);
  const failedStage = stagedWrites.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (failedStage) {
    await removeStagedFiles(adapter, stagedPaths);
    throw failedStage.reason;
  }

  // 두 파일이 모두 준비된 뒤 DB 행의 revision+메타데이터를 한 번에 바꾼다.
  // publish 응답 유실은 서버 커밋 여부가 불명확하므로 이후에는 staged 파일을 지우지 않는다.
  await adapter.publishChartRow(toChartUpsert(
    input.songId,
    asset.difficulty,
    input.chart,
    revision,
    input.allowCreate ?? false,
    input,
  ));

  return asset;
}

export async function createChartAsset(
  adapter: SongAssetPersistenceAdapter,
  input: CreateChartAssetInput,
): Promise<ChartAssetWriteResult> {
  return saveChartAsset(adapter, {
    ...input,
    extraLaneCount: 0,
    allowCreate: true,
  });
}

export interface DeleteSongAssetInput {
  songId: string;
  /** 호출 시점에 이 곡에 남아 있는 차트 수. 0이 아니면 삭제를 거부한다. */
  chartCount: number;
}

/** 차트가 남아 있는 곡을 지우려 할 때 던져진다. DB의 FK restrict와 같은 규칙의 앱 레벨 표현. */
export class SongHasChartsError extends Error {
  readonly chartCount: number;

  constructor(chartCount: number) {
    super(`차트 ${chartCount}개가 남아 있어 곡을 삭제할 수 없습니다. 에디터에서 차트를 먼저 삭제하세요.`);
    this.name = "SongHasChartsError";
    this.chartCount = chartCount;
  }
}

/**
 * 곡을 삭제한다. 차트가 전부 지워진 곡만 삭제할 수 있다.
 *
 * songs 행을 Storage 파일보다 먼저 지운다: 클라이언트가 세는 chartCount가
 * 낡았더라도 DB의 FK restrict가 행 삭제 단계에서 거부하므로, 그 시점에는
 * 아직 아무 파일도 파괴되지 않은 상태다.
 */
export async function deleteSongAsset(
  adapter: SongAssetPersistenceAdapter,
  input: DeleteSongAssetInput,
): Promise<{ removedPaths: string[] }> {
  if (input.chartCount > 0) {
    throw new SongHasChartsError(input.chartCount);
  }

  await adapter.deleteSongRow(input.songId);

  const paths = await adapter.listSongFiles(input.songId);
  if (paths.length > 0) {
    await adapter.remove(paths);
  }
  return { removedPaths: paths };
}

export async function deleteChartAsset(
  adapter: SongAssetPersistenceAdapter,
  input: ChartAssetTarget,
): Promise<{ chartPath: string; extraPath: string; difficulty: string }> {
  const difficulty = normalizeDifficulty(input.difficulty);
  const chartPath = songChartPath(input.songId, difficulty);
  const extraPath = songChartExtraPath(input.songId, difficulty);

  // DB pointer를 먼저 원자적으로 지워 동시 save의 update와 직렬화한다.
  // 삭제된 행이 가리키던 활성 세대만 제거한다. 미참조 세대를 함께 list/remove하면
  // 동시 save의 staging 세대를 지워 broken pointer를 만들 수 있다.
  const deleted = await adapter.deleteChartRow({ songId: input.songId, difficulty });
  const paths = [chartPath, extraPath];
  if (deleted.revision !== null) {
    paths.push(
      songChartRevisionPath(input.songId, difficulty, deleted.revision),
      songChartExtraRevisionPath(input.songId, difficulty, deleted.revision),
    );
  }
  if (paths.length > 0) {
    await adapter.remove(paths);
  }

  return { chartPath, extraPath, difficulty };
}

function buildChartPayload(input: SaveChartAssetInput): Pick<
  ChartAssetWriteResult,
  "chartJson" | "extraJson" | "difficulty"
> {
  const difficulty = normalizeDifficulty(input.difficulty);
  return {
    // 저장 분리 (RFD 0018 §3-4): 메인 파일엔 메인 노트만, 보조 파일엔 lane 5+를 extraLane으로 환원.
    // auxNotesAsExtra가 chart.notes 순서(=[...main, ...aux])를 보존하므로 재저장이 원본과 바이트 동일.
    chartJson: serializeChart({ ...input.chart, notes: mainNotes(input.chart.notes) }),
    extraJson: serializeExtraNotes(auxNotesAsExtra(input.chart.notes), input.extraLaneCount),
    difficulty,
  };
}

async function removeStagedFiles(
  adapter: SongAssetPersistenceAdapter,
  paths: string[],
): Promise<void> {
  try {
    await adapter.remove(paths);
  } catch {
    // staging 경로는 DB가 아직 가리키지 않는 고유 revision이다.
    // 정리 실패는 원래 저장 오류를 가리지 않으며 활성 차트 일관성에도 영향을 주지 않는다.
  }
}

function toChartUpsert(
  songId: string,
  difficulty: string,
  chart: Chart,
  revision: string | null,
  allowCreate: boolean,
  input: SaveChartAssetInput,
): ChartAssetUpsert {
  const row: ChartAssetUpsert = {
    songId,
    difficulty,
    difficultyLevel: chart.meta.difficultyLevel,
    offsetMs: chart.meta.offsetMs,
    revision,
    allowCreate,
  };
  if (Object.prototype.hasOwnProperty.call(input, "expectedRevision")) {
    row.expectedRevision = input.expectedRevision;
  }
  return row;
}

function normalizeDifficulty(difficulty: string): string {
  return difficulty.toLowerCase();
}
