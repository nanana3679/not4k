import type { ChartDocument } from "../types";
import { serializeChart, serializeExtraNotes, mainNotes, mainTrillZones, auxNotes, auxNotesAsExtra } from "../chart";
import { newChartAssetPaths, songChartExtraPath, songChartPath } from "../storage";

export interface TextAssetUpload {
  path: string;
  content: string;
  contentType: string;
  upsert: boolean;
}

/** 저장할 `charts` 행과 열 때 본 리비전. 리비전은 충돌 검사값이며 기록용 차트 버전과 무관하다(RFD 0107). */
export interface ChartRowRef {
  chartId: string;
  revision: number;
}

/**
 * `save_chart` 인자(도메인 언어). 행의 곡·난이도명은 바꾸지 않고 레벨과 파일 경로만 확정한다.
 * DB 스키마(인자 이름)는 adapter 구현이 소유한다.
 */
export interface ChartRowSave {
  chartId: string;
  expectedRevision: number;
  difficultyLevel: number;
  chartPath: string;
  extraPath: string;
}

/** `create_chart` 인자(도메인 언어). 새 행만 만들며 같은 곡·난이도 행이 있으면 거부된다. */
export interface ChartRowCreate {
  songId: string;
  difficulty: string;
  difficultyLevel: number;
  chartPath: string;
  extraPath: string;
}

export interface ChartAssetTarget {
  songId: string;
  difficulty: string;
}

export interface DeleteChartAssetInput extends ChartAssetTarget {
  /** 열린 행이 있으면 난이도명 대신 이 UUID로 삭제한다. */
  chartId?: string;
}

export interface SongAssetPersistenceAdapter {
  uploadText: (asset: TextAssetUpload) => Promise<void>;
  remove: (paths: string[]) => Promise<void>;
  /** 예상 리비전이 맞을 때만 행이 새 경로를 가리키게 하고 새 리비전을 돌려준다. 거부 오류의 `code`(SQLSTATE)를 보존한다. */
  saveChartRow: (row: ChartRowSave) => Promise<number>;
  /** 새 행을 만들고 ID·리비전을 돌려준다. 거부 오류의 `code`(SQLSTATE)를 보존한다. */
  createChartRow: (row: ChartRowCreate) => Promise<ChartRowRef>;
  deleteChartRow: (target: DeleteChartAssetInput) => Promise<void>;
  listSongFiles: (songId: string) => Promise<string[]>;
  deleteSongRow: (songId: string) => Promise<void>;
  /** 새 업로드 경로에 붙일 저장마다 다른 토큰. */
  newPathToken: () => string;
}

export interface SaveChartAssetInput extends ChartAssetTarget {
  /** 보조 노트(lane 5+)를 포함한 통합 차트. 저장 시 메인/보조 파일로 분리한다 (RFD 0018 ③). */
  chart: ChartDocument;
  extraLaneCount: number;
  /** 덮어쓸 기존 행. `difficulty`는 새 경로 이름에만 쓰며 행의 난이도명은 바뀌지 않는다. */
  row: ChartRowRef;
}

export interface CreateChartAssetInput extends ChartAssetTarget {
  chart: ChartDocument;
  /** 생략하면 0(보조 정보 없음)이다. */
  extraLaneCount?: number;
}

export interface SaveSonglessChartAssetInput extends ChartAssetTarget {
  chart: ChartDocument;
  extraLaneCount: number;
}

/** 올린 메인·보조 파일의 경로와 내용. */
export interface ChartAssetFiles {
  chartPath: string;
  extraPath: string;
  chartJson: string;
  extraJson: string;
  difficulty: string;
}

export interface ChartAssetWriteResult extends ChartAssetFiles {
  /** 확정된 행과 새 리비전. */
  row: ChartRowRef;
}

/** 파일 업로드 이후 행 갱신이 실패한 결과. 응답 유실 확인에 필요한 업로드 경로·내용을 보존한다. */
export class ChartSaveError extends Error {
  readonly files: ChartAssetFiles;
  readonly code: string | undefined;

  constructor(cause: unknown, files: ChartAssetFiles) {
    super(cause instanceof Error ? cause.message : 'Chart update failed', { cause });
    this.name = 'ChartSaveError';
    this.files = files;
    this.code = cause && typeof cause === 'object' && 'code' in cause && typeof cause.code === 'string'
      ? cause.code : undefined;
  }
}

/**
 * 기존 차트를 저장한다(RFD 0107 결정 5). 메인·보조 JSON을 새 경로에 먼저 올린 뒤 `save_chart` 한 번으로
 * 행이 새 파일을 가리키게 한다. 업로드나 DB 거부 시 행은 이전 파일을 계속 가리킨다. 행 갱신 응답이 유실되면 호출자가 ChartSaveError.files로 확정 여부를 확인할 수 있다.
 * 이전 저장의 파일은 지우지 않는다(정리는 #160).
 */
export async function saveChartAsset(
  adapter: SongAssetPersistenceAdapter,
  input: SaveChartAssetInput,
): Promise<ChartAssetWriteResult> {
  const asset = await uploadChartAsset(adapter, input);
  try {
    const revision = await adapter.saveChartRow({
      chartId: input.row.chartId,
      expectedRevision: input.row.revision,
      difficultyLevel: input.chart.meta.difficultyLevel,
      chartPath: asset.chartPath,
      extraPath: asset.extraPath,
    });
    return { ...asset, row: { chartId: input.row.chartId, revision } };
  } catch (error) {
    throw new ChartSaveError(error, asset);
  }
}

/** 새 차트 행을 만든다. 파일은 `saveChartAsset`과 같이 새 경로에 먼저 올린다. 기존 행을 덮어쓰지 않는다. */
export async function createChartAsset(
  adapter: SongAssetPersistenceAdapter,
  input: CreateChartAssetInput,
): Promise<ChartAssetWriteResult> {
  const asset = await uploadChartAsset(adapter, { ...input, extraLaneCount: input.extraLaneCount ?? 0 });
  const row = await adapter.createChartRow({
    songId: input.songId,
    difficulty: asset.difficulty,
    difficultyLevel: input.chart.meta.difficultyLevel,
    chartPath: asset.chartPath,
    extraPath: asset.extraPath,
  });
  return { ...asset, row };
}

/**
 * 곡 행 없이 연 차트를 저장한다. `charts` 행은 곡 행 없이 있을 수 없으므로(FK) 행을 만들거나 고치지 않고,
 * 행이 없을 때 로더가 읽는 결정적 경로(`{difficulty}.json`·`.extra.json`)에 RFD 0107 이전처럼 덮어쓴다.
 * 보조 정보가 없으면 결정적 경로의 보조 파일을 지운다. 곡 행이 있는 차트는 `saveChartAsset`·`createChartAsset`을 쓴다.
 */
export async function saveSonglessChartAsset(
  adapter: SongAssetPersistenceAdapter,
  input: SaveSonglessChartAssetInput,
): Promise<ChartAssetFiles> {
  const difficulty = normalizeDifficulty(input.difficulty);
  const asset = {
    chartPath: songChartPath(input.songId, difficulty),
    extraPath: songChartExtraPath(input.songId, difficulty),
    ...serializeChartAsset(input.chart, input.extraLaneCount),
    difficulty,
  };
  const hasExtra = input.extraLaneCount > 0 || auxNotes(input.chart.notes).length > 0;
  await Promise.all([
    adapter.uploadText({ path: asset.chartPath, content: asset.chartJson, contentType: "application/json", upsert: true }),
    hasExtra
      ? adapter.uploadText({ path: asset.extraPath, content: asset.extraJson, contentType: "application/json", upsert: true })
      : adapter.remove([asset.extraPath]),
  ]);
  return asset;
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
  input: DeleteChartAssetInput,
): Promise<{ chartPath: string; extraPath: string; difficulty: string }> {
  const difficulty = normalizeDifficulty(input.difficulty);
  const chartPath = songChartPath(input.songId, difficulty);
  const extraPath = songChartExtraPath(input.songId, difficulty);

  await adapter.deleteChartRow({ ...input, difficulty });
  await adapter.remove([chartPath, extraPath]);

  return { chartPath, extraPath, difficulty };
}

/**
 * 메인·보조 JSON을 새 경로 두 곳에 올린다. 보조 정보가 없어도 빈 보조 JSON을 올려, 경로가 NULL이 아닌 행은
 * 항상 두 파일을 가리키게 한다(NULL은 기존 결정적 경로라 "보조 없음" 표시로 쓸 수 없다).
 */
async function uploadChartAsset(
  adapter: SongAssetPersistenceAdapter,
  input: ChartAssetTarget & { chart: ChartDocument; extraLaneCount: number },
): Promise<ChartAssetFiles> {
  const difficulty = normalizeDifficulty(input.difficulty);
  const { chartPath, extraPath } = newChartAssetPaths(input.songId, difficulty, adapter.newPathToken());
  const asset = { chartPath, extraPath, ...serializeChartAsset(input.chart, input.extraLaneCount), difficulty };
  await Promise.all([
    adapter.uploadText({ path: chartPath, content: asset.chartJson, contentType: "application/json", upsert: false }),
    adapter.uploadText({ path: extraPath, content: asset.extraJson, contentType: "application/json", upsert: false }),
  ]);
  return asset;
}

/**
 * 저장 분리 (RFD 0018 §3-4): 메인 파일엔 메인 노트·구간만, 보조 파일엔 lane 5+를 extraLane으로 환원.
 * auxNotesAsExtra가 chart.notes 순서(=[...main, ...aux])를 보존하므로 재저장이 원본과 바이트 동일.
 */
function serializeChartAsset(chart: ChartDocument, extraLaneCount: number): { chartJson: string; extraJson: string } {
  return {
    chartJson: serializeChart({ ...chart, notes: mainNotes(chart.notes), trillZones: mainTrillZones(chart.trillZones) }),
    extraJson: serializeExtraNotes(auxNotesAsExtra(chart.notes), extraLaneCount, chart.trillZones),
  };
}

function normalizeDifficulty(difficulty: string): string {
  return difficulty.toLowerCase();
}
