import { parseSongTiming } from '../shared/songAssets/songTiming';
import { encodeWavBlob } from '../shared';
import { countOtherSongCharts, findDifferingSongCharts, saveSong, uploadSongMedia } from '../supabase/saveSong';
import { isSongTimingDirty, songValues } from './songState';
import { useEditorStore } from './stores/editorStore';
import { SONG_SAVE_COPY, SAVE_IN_PROGRESS_COPY } from './editorCopy';

const extension = (file: File, fallback: string) => file.name.includes('.') ? file.name.split('.').pop() || fallback : fallback;

/** 시작 초안을 저장하고 기준 반영 성공 여부를 반환한다. 취소·실패·차트 전환이면 후속 차트 저장을 막는다. */
export async function saveEditorSong(
  audioBuffer: AudioBuffer | null,
  confirm: (message: string) => boolean,
): Promise<boolean> {
  const start = useEditorStore.getState();
  if (!start.song || !start.activeSongId) return false;
  if (start.isSavingSong || start.isSavingChart) {
    start.addToast(SAVE_IN_PROGRESS_COPY.secondSave, 'error');
    return false;
  }
  const song = start.song;
  useEditorStore.setState({ isSavingSong: true });
  try {
    const values = songValues(start.chart, song);
    parseSongTiming(values.timing);
    if (song.needsTimingMigration) {
      const differing = await findDifferingSongCharts(start.activeSongId, song.sourceDifficulty, values.timing);
      if (useEditorStore.getState().chartLoadGeneration !== start.chartLoadGeneration) return false;
      const message = SONG_SAVE_COPY.migration + (differing.length
        ? `\n\n${SONG_SAVE_COPY.differingCharts}: ${differing.join(', ')}` : '');
      if (!confirm(message)) return false;
    } else if (isSongTimingDirty(start.chart, song)) {
      const count = await countOtherSongCharts(start.activeSongId, song.sourceDifficulty);
      if (useEditorStore.getState().chartLoadGeneration !== start.chartLoadGeneration) return false;
      if (!confirm(SONG_SAVE_COPY.sharedTiming(count))) return false;
    }
    const previewChanged = values.previewStart !== song.baseline.previewStart || values.previewEnd !== song.baseline.previewEnd;
    const previewRange = (previewChanged || song.pendingAudioFile) && values.previewStart != null && values.previewEnd != null
      ? { startTime: values.previewStart, endTime: values.previewEnd,
        fadeInTime: song.pendingPreviewRange?.fadeInTime ?? 0, fadeOutTime: song.pendingPreviewRange?.fadeOutTime ?? 0 } : null;
    // 필요한 프리뷰를 만들 수 없으면 파일이나 행을 쓰기 전에 거부한다.
    if (previewRange && !audioBuffer) throw new Error('Preview audio is not loaded');
    if (song.pendingJacketFile) values.jacketUrl = await uploadSongMedia(start.activeSongId, 'jacket', song.pendingJacketFile, extension(song.pendingJacketFile, 'jpg'));
    if (song.pendingAudioFile) values.audioUrl = await uploadSongMedia(start.activeSongId, 'audio', song.pendingAudioFile, extension(song.pendingAudioFile, 'ogg'));
    if (previewRange && audioBuffer) {
      const blob = encodeWavBlob(audioBuffer, previewRange.startTime, previewRange.endTime, previewRange);
      values.previewUrl = await uploadSongMedia(start.activeSongId, 'preview', blob, 'wav');
    }
    const revision = await saveSong(start.activeSongId, song.revision, values);
    const current = useEditorStore.getState();
    if (current.chartLoadGeneration !== start.chartLoadGeneration || !current.song) return false;
    const sameJacket = current.song.pendingJacketFile === song.pendingJacketFile;
    const sameAudio = current.song.pendingAudioFile === song.pendingAudioFile;
    const samePreview = current.song.pendingPreviewRange === song.pendingPreviewRange && sameAudio;
    const meta = { ...current.chart.meta };
    if (sameJacket && meta.imageFile === start.chart.meta.imageFile) meta.imageFile = values.jacketUrl ?? '';
    if (sameAudio && meta.audioFile === start.chart.meta.audioFile) meta.audioFile = values.audioUrl;
    if (samePreview && meta.previewAudioFile === start.chart.meta.previewAudioFile) meta.previewAudioFile = values.previewUrl ?? '';
    if (meta.imageFile !== current.chart.meta.imageFile || meta.audioFile !== current.chart.meta.audioFile
      || meta.previewAudioFile !== current.chart.meta.previewAudioFile) {
      current.reconcileSongMedia({ audioFile: meta.audioFile, imageFile: meta.imageFile, previewAudioFile: meta.previewAudioFile });
    }
    current.setSong({ ...current.song, revision, baseline: values, needsTimingMigration: false,
      pendingJacketFile: sameJacket ? null : current.song.pendingJacketFile,
      pendingAudioFile: sameAudio ? null : current.song.pendingAudioFile,
      pendingPreviewRange: samePreview ? null : current.song.pendingPreviewRange,
    });
    current.addToast(SONG_SAVE_COPY.saved, 'info');
    return true;
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
    start.addToast(code === 'PT409' ? SONG_SAVE_COPY.conflict : code === '42501' ? SONG_SAVE_COPY.permission
      : code === 'PT404' ? SONG_SAVE_COPY.missing : SONG_SAVE_COPY.failed, 'error');
    return false;
  } finally {
    if (useEditorStore.getState().chartLoadGeneration === start.chartLoadGeneration) {
      useEditorStore.setState({ isSavingSong: false });
    }
  }
}
