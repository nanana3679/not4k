import type { ChartDocument, ChartMeta } from '../shared';
import { STORAGE_BUCKET, encodeWavBlob, songAudioPath, songJacketPath, songPreviewPath } from '../shared';
import { supabase } from '../supabase/client';
import type { SonglessMedia } from './songlessMedia';
import { useEditorStore } from './stores/editorStore';

/**
 * 곡 행 없이 연 차트의 Save가 대기 미디어를 올리는 기존 규칙(곡 저장 도입 전과 같은 고정 경로 덮어쓰기).
 * 그때의 `songs` 갱신은 곡 행이 없어 바뀌는 행이 없었으므로 하지 않는다. 곡 행이 있는 차트는 `saveEditorSong`이
 * 새 경로·`save_song`으로 확정하므로 이 경로를 쓰지 않는다.
 */

/** 차트 JSON에 함께 저장할 곡 폴더의 고정 경로. 파일 확장자를 쓰고 없으면 jpg·ogg를 쓴다. */
export interface SonglessMediaPaths {
  jacketPath: string | null;
  audioPath: string | null;
}

const extension = (file: File, fallback: string) => file.name.split('.').pop() || fallback;

export function songlessMediaPaths(songId: string, media: SonglessMedia): SonglessMediaPaths {
  return {
    jacketPath: media.jacketFile ? songJacketPath(songId, extension(media.jacketFile, 'jpg')) : null,
    audioPath: media.audioFile ? songAudioPath(songId, extension(media.audioFile, 'ogg')) : null,
  };
}

/** 업로드할 차트 JSON이 올릴 미디어의 고정 경로를 가리키게 한다. */
export function withSonglessMediaPaths(chart: ChartDocument, paths: SonglessMediaPaths): ChartDocument {
  if (!paths.jacketPath && !paths.audioPath) return chart;
  return { ...chart, meta: { ...chart.meta,
    ...(paths.jacketPath ? { imageFile: paths.jacketPath } : {}),
    ...(paths.audioPath ? { audioFile: paths.audioPath } : {}),
  } };
}

/**
 * 차트 JSON을 올린 뒤 대기 미디어를 곡 폴더의 고정 경로에 덮어쓴다. 프리뷰 구간을 바꿨거나 음원을 교체했으면 재생 중인
 * 음원으로 프리뷰 클립을 다시 만든다(음원이 없으면 건너뛴다). 곡 행이 없으므로 구간·경로를 쓸 `songs` 행은 없고,
 * 프리뷰 구간은 차트 JSON의 `previewStart`·`previewEnd`로 남는다. 업로드가 실패하면 던진다.
 */
export async function uploadSonglessMedia({ songId, media, paths, meta, audioBuffer }: {
  songId: string;
  media: SonglessMedia;
  paths: SonglessMediaPaths;
  /** 저장을 시작할 때의 차트 meta. 음원만 교체했을 때 기존 프리뷰 구간을 다시 만든다. */
  meta: Pick<ChartMeta, 'previewStart' | 'previewEnd'>;
  audioBuffer: AudioBuffer | null;
}): Promise<void> {
  const bucket = supabase.storage.from(STORAGE_BUCKET);
  if (media.jacketFile && paths.jacketPath) {
    const { error } = await bucket.upload(paths.jacketPath, media.jacketFile, { upsert: true });
    if (error) throw new Error(`Jacket upload failed: ${error.message}`);
  }
  if (media.audioFile && paths.audioPath) {
    const { error } = await bucket.upload(paths.audioPath, media.audioFile, { upsert: true });
    if (error) throw new Error(`Audio upload failed: ${error.message}`);
  }
  const previewRange = media.previewRange ?? (media.audioFile && meta.previewStart != null && meta.previewEnd != null
    ? { startTime: meta.previewStart, endTime: meta.previewEnd, fadeInTime: 0, fadeOutTime: 0 } : null);
  if (previewRange && audioBuffer) {
    const blob = encodeWavBlob(audioBuffer, previewRange.startTime, previewRange.endTime, {
      fadeInTime: previewRange.fadeInTime, fadeOutTime: previewRange.fadeOutTime,
    });
    const { error } = await bucket.upload(songPreviewPath(songId), blob, { upsert: true });
    if (error) throw new Error(`Preview upload failed: ${error.message}`);
  }
}

/**
 * 저장한 대기 값만 비우고 올린 경로를 현재 차트에 반영한다. 저장 중에 새로 고른 값은 다음 Save에 남긴다.
 * 경로 반영은 편집이 아니므로 Undo 이력을 남기지 않는다.
 */
export function settleSonglessMedia(saved: SonglessMedia, paths: SonglessMediaPaths): void {
  const state = useEditorStore.getState();
  const current = state.songlessMedia;
  const same = <K extends keyof SonglessMedia>(key: K) => current[key] === saved[key];
  const { meta } = state.chart;
  const imageFile = paths.jacketPath && same('jacketFile') ? paths.jacketPath : meta.imageFile;
  const audioFile = paths.audioPath && same('audioFile') ? paths.audioPath : meta.audioFile;
  if (imageFile !== meta.imageFile || audioFile !== meta.audioFile) {
    state.reconcileSongMedia({ imageFile, audioFile, previewAudioFile: meta.previewAudioFile });
  }
  state.setSonglessMedia({
    previewRange: same('previewRange') ? null : current.previewRange,
    gameplayRange: same('gameplayRange') ? null : current.gameplayRange,
    jacketFile: same('jacketFile') ? null : current.jacketFile,
    audioFile: same('audioFile') ? null : current.audioFile,
  });
}
