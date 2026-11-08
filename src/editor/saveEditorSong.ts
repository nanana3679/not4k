import { parseSongTiming } from '../shared/songAssets/songTiming';
import { canEncodeWavRange, encodeWavBlob } from '../shared';
import { countOtherSongCharts, findDifferingSongCharts, saveSong, uploadSongMedia } from '../supabase/saveSong';
import { DEFAULT_PREVIEW_FADE } from './components/previewRangeState';
import { isSongTimingDirty, songValues } from './songState';
import { useEditorStore } from './stores/editorStore';
import { SONG_SAVE_COPY, SAVE_IN_PROGRESS_COPY } from './editorCopy';

const extension = (file: File, fallback: string) => file.name.includes('.') ? file.name.split('.').pop() || fallback : fallback;

/** 이행 거절만 차트 저장을 계속하며, 나머지 취소·실패·차트 전환은 전체 저장을 중단한다. */
export type SaveEditorSongResult = 'saved' | 'migration-declined' | 'aborted';

/** 시작 초안의 곡 저장 결과. 저장 성공 때만 곡 기준·리비전·대기 파일을 갱신한다. */
export async function saveEditorSong(
  audioBuffer: AudioBuffer | null,
  confirm: (message: string) => boolean,
): Promise<SaveEditorSongResult> {
  const start = useEditorStore.getState();
  if (!start.song || !start.activeSongId) return 'aborted';
  if (start.isSavingSong || start.isSavingChart) {
    start.addToast(SAVE_IN_PROGRESS_COPY.secondSave, 'error');
    return 'aborted';
  }
  const song = start.song;
  // 곡 행의 제목·아티스트는 곡 추가와 같이 비울 수 없다. 확인·업로드·RPC보다 먼저 거부한다.
  if (!start.chart.meta.title.trim() || !start.chart.meta.artist.trim()) {
    start.addToast(SONG_SAVE_COPY.titleArtistRequired, 'error');
    return 'aborted';
  }
  useEditorStore.setState({ isSavingSong: true });
  try {
    const values = songValues(start.chart, song);
    parseSongTiming(values.timing);
    // 지금 프리뷰 클립(차트 사본의 프리뷰 경로)은 늘 저장 기준의 음원·구간에서 잘라 낸 것이다. 음원·구간은 Undo 이력 밖이라 기준과 달라지는 길은
    // 대기 음원을 고르거나 구간을 바꾸는 것뿐이므로, 그때만 다시 만든다(사용자 확인, 2026-11-08). 구간이 없으면 만들 클립이 없다.
    const { previewStart, previewEnd } = values;
    const previewChanged = previewStart !== song.baseline.previewStart || previewEnd !== song.baseline.previewEnd;
    const previewRange = previewStart != null && previewEnd != null && (song.pendingAudioFile || previewChanged)
      ? { startTime: previewStart, endTime: previewEnd,
        fadeInTime: song.pendingPreviewRange?.fadeInTime ?? DEFAULT_PREVIEW_FADE,
        fadeOutTime: song.pendingPreviewRange?.fadeOutTime ?? DEFAULT_PREVIEW_FADE } : null;
    // 프리뷰 클립은 재생 중인 음원으로 만든다. 만들 수 없으면 확인·파일·행보다 먼저 거부한다(음원 로딩 중이면 Save가 먼저 막는다).
    if (previewRange && !audioBuffer) {
      start.addToast(SONG_SAVE_COPY.previewAudioMissing, 'error');
      return 'aborted';
    }
    // 구간에 샘플이 없으면 인코더가 던지고, 구간이 음원 끝을 넘으면 잘린 클립이 된다. 인코더가 던지면 이미 올린 음원이
    // 고아가 되고 재시도마다 쌓이므로 음원 업로드 전에 거부한다.
    if (previewRange && audioBuffer && !canEncodeWavRange(audioBuffer, previewRange.startTime, previewRange.endTime)) {
      start.addToast(SONG_SAVE_COPY.previewOutOfRange, 'error');
      return 'aborted';
    }
    // 다른 차트는 Meta의 난이도명(JSON 사본)이 아니라 열린 `charts` 행(없으면 열린 난이도)을 빼고 고른다.
    const openChart = { chartId: start.chartRow?.id ?? null, difficulty: start.activeDifficulty ?? start.chart.meta.difficultyLabel };
    if (song.needsTimingMigration) {
      const { differing, uncompared } = await findDifferingSongCharts(start.activeSongId, openChart, values.timing);
      if (useEditorStore.getState().chartLoadGeneration !== start.chartLoadGeneration) return 'aborted';
      const details = [
        differing.length ? `${SONG_SAVE_COPY.differingCharts}: ${differing.join(', ')}` : null,
        uncompared.length ? `${SONG_SAVE_COPY.uncomparedCharts}: ${uncompared.join(', ')}` : null,
      ].filter(line => line !== null);
      const message = SONG_SAVE_COPY.migration + (details.length ? `\n\n${details.join('\n')}` : '');
      if (!confirm(message)) return 'migration-declined';
    } else if (isSongTimingDirty(start.chart, song)) {
      const count = await countOtherSongCharts(start.activeSongId, openChart);
      if (useEditorStore.getState().chartLoadGeneration !== start.chartLoadGeneration) return 'aborted';
      // 다른 차트가 없으면 이 곡 전체에 퍼지는 영향이 없으므로 묻지 않는다(RFD 0098).
      if (count > 0 && !confirm(SONG_SAVE_COPY.sharedTiming(count))) return 'aborted';
    }
    if (song.pendingJacketFile) values.jacketUrl = await uploadSongMedia(start.activeSongId, 'jacket', song.pendingJacketFile, extension(song.pendingJacketFile, 'jpg'));
    if (song.pendingAudioFile) values.audioUrl = await uploadSongMedia(start.activeSongId, 'audio', song.pendingAudioFile, extension(song.pendingAudioFile, 'ogg'));
    if (previewRange && audioBuffer) {
      const blob = encodeWavBlob(audioBuffer, previewRange.startTime, previewRange.endTime, previewRange);
      values.previewUrl = await uploadSongMedia(start.activeSongId, 'preview', blob, 'wav');
    }
    const revision = await saveSong(start.activeSongId, song.revision, values);
    const current = useEditorStore.getState();
    if (current.chartLoadGeneration !== start.chartLoadGeneration || !current.song) return 'aborted';
    current.completeSongSave(song, values, revision);
    current.addToast(SONG_SAVE_COPY.saved, 'info');
    return 'saved';
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
    start.addToast(code === 'PT409' ? SONG_SAVE_COPY.conflict : code === '42501' ? SONG_SAVE_COPY.permission
      : code === 'PT404' ? SONG_SAVE_COPY.missing : SONG_SAVE_COPY.failed, 'error');
    return 'aborted';
  } finally {
    if (useEditorStore.getState().chartLoadGeneration === start.chartLoadGeneration) {
      useEditorStore.setState({ isSavingSong: false });
    }
  }
}
