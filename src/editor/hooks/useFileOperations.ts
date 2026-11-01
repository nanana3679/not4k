import { isSongDirty } from '../songState';
import { saveEditorSong } from '../saveEditorSong';
import { isChartDirty } from '../savedChart';
import { deleteEvents } from '../editing/eventEditing';
/**
 * useFileOperations — 파일 저장/삭제 핸들러
 */

import { useCallback } from 'react';
import type { RefObject } from 'react';
import type { PlaybackController } from '../playback/PlaybackController';
import {
  ChartSaveError,
  extractTimeSignatureChanges,
  isMeasureBoundary,
} from '../../shared';
import type { ChartAssetWriteResult, SaveChartAssetInput, Lane, TutorialDiagramId, ValidationError } from '../../shared';
import {
  createChartAsset as persistNewChartAsset,
  deleteChartAsset as persistDeleteChartAsset,
  saveChartAsset as persistChartAsset,
  saveSonglessChartAsset as persistSonglessChartAsset,
} from '../../supabase';
import { fetchChartRows, findChartRow, type StoredChartRow } from '../../supabase/chartRows';
import { useEditorStore } from '../stores';
import { useGameStore } from '../../game/stores';
import { performPlayTest } from '../playtest/performPlayTest';
import { editorChartErrors } from '../documentValidation';
import type { SavedChartJson } from '../savedChart';
import { CHART_SAVE_COPY, PAUSE_TO_EDIT_COPY, SAVE_AUDIO_LOADING_COPY, SAVE_IN_PROGRESS_COPY } from '../editorCopy';
import { settleSonglessMedia, songlessMediaPaths, uploadSonglessMedia, withSonglessMediaPaths } from '../saveSonglessMedia';
import { hasSonglessMedia } from '../songlessMedia';
export { performPlayTest } from '../playtest/performPlayTest';
export type { PerformPlayTestParams, PlayTestGameActions } from '../playtest/performPlayTest';

type EditorStoreState = ReturnType<typeof useEditorStore.getState>;

/**
 * 열린 차트의 난이도 경로. 열린 `charts` 행이 있으면 그 행의 난이도명이고(`activeDifficulty`도 같은 값이다), 행이 없으면
 * URL·Save As가 정한 `activeDifficulty`, 그것도 없을 때만 meta의 난이도명이다. 저장할 행을 고르는 것은 이 이름이 아니라
 * `chartRow`의 ID이며, 이 이름은 새 경로 이름·새 행의 난이도명·삭제 대상에 쓴다.
 */
function activeChartDifficulty(state: Pick<EditorStoreState, 'chartRow' | 'activeDifficulty' | 'chart'>): string {
  return state.chartRow?.difficultyLabel ?? state.activeDifficulty ?? state.chart.meta.difficultyLabel;
}

/**
 * 곡 행이 있는가. 곡 행이 없으면 `charts` 행도 만들 수 없어(FK) 차트 저장은 RFD 0107 이전처럼 결정적 경로에 파일만 쓴다.
 * 열린 `charts` 행이 있으면 곡 행도 있다.
 */
function hasSongRow(state: Pick<EditorStoreState, 'song' | 'chartRow'>): boolean {
  return state.song !== null || state.chartRow !== null;
}

/** 대상 행 조회 전후 모두 현재 저장 잠금과 음원 준비 상태를 확인한다. */
function canStartSave(state: EditorStoreState, isAudioLoading: () => boolean): boolean {
  if (state.isSavingSong || state.isSavingChart) {
    state.addToast(SAVE_IN_PROGRESS_COPY.secondSave, 'error');
    return false;
  }
  if (isAudioLoading()) {
    state.addToast(SAVE_AUDIO_LOADING_COPY, 'error');
    return false;
  }
  return true;
}

/**
 * Save·Save As는 같은 시작 초안을 사용한다. 기다리는 동안 추가한 편집은 저장 기준에 넣지 않는다.
 * 곡을 저장하기 전에 저장 중·음원 로딩·저장별 조건(precheck)·차트 검증을 모두 확인해, 곡만 저장되고 차트 저장이 막히는 일을 줄인다.
 */
async function prepareSave(
  audioBuffer: AudioBuffer | null,
  isAudioLoading: () => boolean,
  onValidationErrors: (errors: ValidationError[]) => void,
  /** 곡 저장 전에 확인할 저장별 조건. 안내를 띄우고 false를 돌려주면 아무것도 쓰지 않는다. */
  precheck: (state: EditorStoreState) => boolean | Promise<boolean>,
) {
  const beforeCheck = useEditorStore.getState();
  if (!canStartSave(beforeCheck, isAudioLoading)) return null;
  const checked = precheck(beforeCheck);
  if (!(typeof checked === 'boolean' ? checked : await checked)) return null;
  // 대상 조회 동안 편집할 수 있으므로, 실제 곡 저장이 시작할 때 곡·차트의 공통 초안을 잡는다.
  const start = useEditorStore.getState();
  if (start.chartLoadGeneration !== beforeCheck.chartLoadGeneration) return null;
  if (start !== beforeCheck && !canStartSave(start, isAudioLoading)) return null;
  // 곡만 변경해도 전체 차트를 먼저 검증한다. 공통 타이밍을 게시한 뒤에는 차단할 수 없다.
  const errors = editorChartErrors(start.chart);
  if (errors.length > 0) {
    onValidationErrors(errors);
    return null;
  }
  const songDirty = isSongDirty(start.chart, start.song);
  const chartDirty = isChartDirty(start.chart, start.extraLaneCount, start.savedChartJson, start.song !== null);
  const songSaveResult = songDirty || start.song?.needsTimingMigration
    ? await saveEditorSong(audioBuffer, message => window.confirm(message)) : null;
  if (songSaveResult === 'aborted') return null;
  const current = useEditorStore.getState();
  if (current.chartLoadGeneration !== start.chartLoadGeneration) return null;
  // 업로드로 확정된 곡 경로만 사본에 반영한다. 저장 중의 노트·타이밍 편집은 다음 저장에 남긴다.
  const savedSong = songSaveResult === 'saved' ? current.song?.baseline : null;
  const chart = savedSong ? { ...start.chart, meta: { ...start.chart.meta,
    imageFile: savedSong.jacketUrl ?? '', audioFile: savedSong.audioUrl, previewAudioFile: savedSong.previewUrl ?? '',
  } } : start.chart;
  return { chart, activeSongId: start.activeSongId, extraLaneCount: start.extraLaneCount,
    chartLoadGeneration: start.chartLoadGeneration, difficulty: activeChartDifficulty(start),
    // 열 때 읽은(또는 마지막 저장이 확정한) `charts` 행. 차트 저장은 이 행의 ID·리비전으로 save_chart를 부른다.
    chartRow: start.chartRow, hasSongRow: hasSongRow(start),
    // 곡 행이 없으면 기존 규칙대로 차트와 함께 대기 미디어를 올린다.
    songlessMedia: !hasSongRow(start) && hasSonglessMedia(start.songlessMedia) ? start.songlessMedia : null,
    // 아무 변경도 없거나 이행을 거절했으면 곡 변경 여부와 관계없이 현재 차트를 저장한다.
    saveChart: chartDirty || !songDirty || songSaveResult === 'migration-declined' };
}

/** 저장 함수가 보존한 SQLSTATE(`code`)로 차트 저장 실패 안내를 고른다. 행 갱신 결과를 확인하지 못한 경우는 일반 업로드 실패와 구별한다. */
function chartSaveErrorCopy(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
  switch (code) {
    case 'PT409': return CHART_SAVE_COPY.conflict;
    case 'PT404': return CHART_SAVE_COPY.missing;
    case '42501': return CHART_SAVE_COPY.permission;
    case '23505': return CHART_SAVE_COPY.exists;
    default: return !code && error instanceof ChartSaveError ? CHART_SAVE_COPY.unconfirmed : CHART_SAVE_COPY.failed;
  }
}

/** 응답 유실은 같은 UUID가 방금 올린 파일을 가리킬 때만 성공으로 복구한다. 다른 저장은 채택하지 않는다. */
async function saveChartWithRecovery(input: SaveChartAssetInput): Promise<ChartAssetWriteResult> {
  try {
    return await persistChartAsset(input);
  } catch (error) {
    if (error instanceof ChartSaveError && (!error.code || error.code === 'PT409')) {
      try {
        const row = findChartRow(await fetchChartRows(input.songId), input.difficulty);
        if (row?.id === input.row.chartId && row.chartPath === error.files.chartPath) {
          return { ...error.files, row: { chartId: row.id, revision: row.revision } };
        }
      } catch {
        // 확인 조회도 실패하면 원래 저장 오류와 미저장 편집을 유지한다.
      }
    }
    throw error;
  }
}

/** 저장으로 확정된 행. 행의 난이도명은 저장으로 바뀌지 않으므로 대상 행의 이름을 유지한다. */
function savedChartRow(written: ChartAssetWriteResult, difficultyLabel: string): StoredChartRow {
  return { id: written.row.chartId, difficultyLabel, revision: written.row.revision,
    chartPath: written.chartPath, chartExtraPath: written.extraPath };
}

export interface FileOperationHandlers {
  handleSaveChart: () => Promise<void>;
  /** `overwrite`는 사용자가 기존 대상 난이도의 덮어쓰기를 확인했을 때만 true다. false면 새 행만 만든다. */
  handleSaveAs: (targetDifficulty: string, targetLevel: number, overwrite?: boolean) => Promise<void>;
  handlePlayTest: (fromCursor: boolean) => void;
  handleDeleteChart: () => Promise<void>;
  handleEventSave: (values: Record<string, string>) => void;
  handleEventDelete: () => void;
}

export function useFileOperations(
  playbackRef: RefObject<PlaybackController | null>,
  rendererRef: RefObject<{ setChart: (c: unknown) => void } | null>,
  setDeleting: (v: boolean) => void,
  setValidationErrors: (errors: ValidationError[]) => void,
  setShowSaveAsModal: (v: boolean) => void,
  setSaveAsOverwriteTarget: (v: { difficulty: string; level: number } | null) => void,
  setShowDeleteConfirm: (v: boolean) => void,
  setShowPlayTestMenu: (v: boolean) => void,
  /** 테스트 플레이 시 /game으로 이동. 전체 리로드 대신 react-router 네비게이션을 주입한다. */
  navigateTo: (path: string) => void,
  /** 에디터 음원을 불러오는 중인가. 불러오는 동안에는 Save·Save As를 시작하지 않는다. */
  isAudioLoading: () => boolean = () => false,
): FileOperationHandlers {
  const chart = useEditorStore((s) => s.chart);
  const setChart = useEditorStore((s) => s.setChart);
  const activeSongId = useEditorStore((s) => s.activeSongId);
  const addToast = useEditorStore((s) => s.addToast);
  const beginChartSave = useEditorStore((s) => s.beginChartSave);
  const finishChartSave = useEditorStore((s) => s.finishChartSave);
  const editingEvent = useEditorStore((s) => s.editingEvent);
  const setEditingEvent = useEditorStore((s) => s.setEditingEvent);
  const handleSaveChart = useCallback(async () => {
    const prepared = await prepareSave(playbackRef.current?.audioBufferData ?? null, isAudioLoading, setValidationErrors, state => {
      if (!state.activeSongId) {
        addToast('No song selected — cannot save to server', 'error');
        return false;
      }
      if (!state.chart.meta.difficultyLabel) {
        addToast('Difficulty label is empty', 'error');
        return false;
      }
      return true;
    });
    if (!prepared || !prepared.saveChart || !prepared.activeSongId
      || useEditorStore.getState().chartLoadGeneration !== prepared.chartLoadGeneration) return;
    // 행·경로는 Meta의 난이도명이 아니라 열린 차트의 것이다(이름 변경은 Save As). 곡 행만 있고 charts 행 없이 연 차트는 열린 난이도로 행을 만든다.
    const { chart, activeSongId, extraLaneCount, difficulty, chartRow, songlessMedia } = prepared;

    // 저장 진행은 store가 소유한다. 테스트 플레이에서 돌아와 페이지가 다시 마운트돼도 진행 중인 저장을 알고 막는다.
    const saveGeneration = beginChartSave();
    if (saveGeneration === null) {
      // Save 버튼은 저장 중 비활성이다. 다른 경로로 들어와도 저장을 겹쳐 시작하지 않는다.
      addToast(SAVE_IN_PROGRESS_COPY.secondSave, 'error');
      return;
    }
    let uploadedJson: SavedChartJson | null = null;
    let savedRow: StoredChartRow | undefined;
    try {
      if (prepared.hasSongRow) {
        // 새 경로에 올린 뒤 save_chart(열 때 본 리비전) 한 번으로 행을 확정한다. 실패하면 행은 이전 파일을 가리킨다(RFD 0107).
        const written = chartRow
          ? await saveChartWithRecovery({ songId: activeSongId, difficulty, chart, extraLaneCount,
            row: { chartId: chartRow.id, revision: chartRow.revision } })
          : await persistNewChartAsset({ songId: activeSongId, difficulty, chart, extraLaneCount });
        uploadedJson = { chartJson: written.chartJson, extraJson: written.extraJson };
        savedRow = savedChartRow(written, chartRow?.difficultyLabel ?? written.difficulty);
      } else {
        // 곡 행이 없으면 행 없이 결정적 경로에 차트를 덮어쓴 뒤 대기 미디어를 고정 경로에 올린다(기존 규칙).
        const mediaPaths = songlessMedia ? songlessMediaPaths(activeSongId, songlessMedia) : null;
        const written = await persistSonglessChartAsset({ songId: activeSongId, difficulty,
          chart: mediaPaths ? withSonglessMediaPaths(chart, mediaPaths) : chart, extraLaneCount });
        if (songlessMedia && mediaPaths) {
          await uploadSonglessMedia({ songId: activeSongId, media: songlessMedia, paths: mediaPaths, meta: chart.meta,
            audioBuffer: playbackRef.current?.audioBufferData ?? null });
          if (useEditorStore.getState().chartSaveGeneration === saveGeneration) settleSonglessMedia(songlessMedia, mediaPaths);
        }
        uploadedJson = { chartJson: written.chartJson, extraJson: written.extraJson };
      }
      addToast(CHART_SAVE_COPY.saved, 'info');
    } catch (err: unknown) {
      console.error('useFileOperations:', err);
      addToast(chartSaveErrorCopy(err), 'error');
    } finally {
      // 실패(uploadedJson null)면 savedChartJson·리비전을 그대로 둬 dirty가 남는다. 그 사이 차트를 새로 불러왔으면 store가 무시한다.
      finishChartSave(saveGeneration, uploadedJson, savedRow);
    }
  }, [playbackRef, addToast, beginChartSave, finishChartSave, setValidationErrors, isAudioLoading]);

  const handleSaveAs = useCallback(async (targetDifficulty: string, targetLevel: number, overwrite = false) => {
    const confirmed: { row: StoredChartRow | null } = { row: null };
    const prepared = await prepareSave(playbackRef.current?.audioBufferData ?? null, isAudioLoading, errors => {
      setValidationErrors(errors);
      setShowSaveAsModal(false);
    }, state => {
      if (!state.activeSongId) {
        addToast('No song selected — cannot save', 'error');
        return false;
      }
      if (overwrite && hasSongRow(state)) {
        // 확인 시점의 UUID·리비전을 곡 미디어 업로드 전에 잡는다. 이후 조회로 저장 대상을 바꾸지 않는다.
        return fetchChartRows(state.activeSongId).then(rows => {
          confirmed.row = findChartRow(rows, targetDifficulty);
          if (!confirmed.row) {
            addToast(CHART_SAVE_COPY.missing, 'error');
            return false;
          }
          return true;
        }).catch(error => {
          addToast(chartSaveErrorCopy(error), 'error');
          return false;
        });
      }
      return true;
    });
    if (!prepared || !prepared.activeSongId
      || useEditorStore.getState().chartLoadGeneration !== prepared.chartLoadGeneration) return;
    const { chart, activeSongId, extraLaneCount } = prepared;

    const saveGeneration = beginChartSave();
    if (saveGeneration === null) {
      addToast(SAVE_IN_PROGRESS_COPY.secondSave, 'error');
      return;
    }
    setShowSaveAsModal(false);
    setSaveAsOverwriteTarget(null);
    let uploadedJson: SavedChartJson | null = null;
    try {
      const difficulty = targetDifficulty.toLowerCase();

      const chartToSave = {
        ...chart,
        meta: {
          ...chart.meta,
          difficultyLabel: targetDifficulty,
          difficultyLevel: targetLevel,
        },
      };

      let savedRow: StoredChartRow | null = null;
      if (prepared.hasSongRow) {
        const target = confirmed.row;
        // 확인한 행만 갱신한다. 확인 없는 새 난이도는 create_chart가 중복을 23505로 거부한다.
        const written = target
          ? await saveChartWithRecovery({ songId: activeSongId, difficulty: target.difficultyLabel, chart: chartToSave, extraLaneCount,
            row: { chartId: target.id, revision: target.revision } })
          : await persistNewChartAsset({ songId: activeSongId, difficulty, chart: chartToSave, extraLaneCount });
        uploadedJson = { chartJson: written.chartJson, extraJson: written.extraJson };
        savedRow = savedChartRow(written, target?.difficultyLabel ?? written.difficulty);
      } else {
        // 곡 행이 없으면 행을 만들 수 없어(FK) 대상 난이도의 결정적 경로에 덮어쓴다(기존 규칙).
        const written = await persistSonglessChartAsset({ songId: activeSongId, difficulty, chart: chartToSave, extraLaneCount });
        uploadedJson = { chartJson: written.chartJson, extraJson: written.extraJson };
      }

      const current = useEditorStore.getState();
      // 그 사이 다른 차트를 열었으면 새 차트의 난이도·행·URL을 바꾸지 않는다(finishChartSave도 같은 세대로 무시한다).
      if (current.chartSaveGeneration === saveGeneration) {
        // 열린 차트의 정체성(난이도·`charts` 행) 변경은 편집이 아니다. 한 번에 바꾸고 Undo 이력에 남기지 않아,
        // Undo가 이전 난이도를 되살리거나 다음 Save가 원래 차트의 행에 쓰지 않게 한다.
        current.adoptChartIdentity(targetDifficulty, targetLevel, savedRow);
        // 다음 곡 이행 확인에서는 Save As로 열린 차트를 비교 대상에서 제외한다.
        if (current.song) current.setSong({ ...current.song, sourceDifficulty: targetDifficulty });
        window.history.replaceState(null, '', `?songId=${encodeURIComponent(activeSongId)}&difficulty=${encodeURIComponent(useEditorStore.getState().activeDifficulty!)}`);
      }

      addToast(`Chart saved as ${targetDifficulty.toUpperCase()} Lv.${targetLevel}`, 'info');
    } catch (err: unknown) {
      console.error('useFileOperations:', err);
      addToast(chartSaveErrorCopy(err), 'error');
    } finally {
      // 저장 대상 행(새 ID 또는 덮어쓴 행)은 위 adoptChartIdentity가 난이도와 함께 바꿨다. 여기서는 저장 기준만 정한다.
      finishChartSave(saveGeneration, uploadedJson);
    }
  }, [playbackRef, addToast, beginChartSave, finishChartSave, setValidationErrors, setShowSaveAsModal, setSaveAsOverwriteTarget, isAudioLoading]);

  const handlePlayTest = useCallback((fromCursor: boolean) => {
    // 곡·차트 저장 완료 전에 테스트 플레이로 이동하지 않는다. 툴바 밖 호출도 같은 조건을 적용한다.
    if (useEditorStore.getState().isSavingChart || useEditorStore.getState().isSavingSong) {
      addToast(SAVE_IN_PROGRESS_COPY.playTest, 'error');
      return;
    }
    const editor = useEditorStore.getState();
    const game = useGameStore.getState();
    performPlayTest({
      fromCursor,
      audioBuffer: playbackRef.current?.audioBufferData ?? null,
      isPlaying: playbackRef.current?.isPlaying ?? false,
      pause: () => playbackRef.current?.pause(),
      // 원본문서 전체를 검증한다. 명시 main은 새 별도 경로가 소유하고 구형 main은 기존 재생을 보존한다.
      chart: editor.chart,
      currentTimeMs: editor.currentTimeMs,
      returnUrl: window.location.pathname + window.location.search,
      game: {
        setChartData: game.setChartData,
        setAudioBuffer: game.setAudioBuffer,
        setStartTimeMs: game.setStartTimeMs,
        setEditorReturnUrl: game.setEditorReturnUrl,
        setScreen: game.setScreen,
        startExplicitPlayTest: game.startExplicitPlayTest,
      },
      addToast,
      closeMenu: () => setShowPlayTestMenu(false),
      // 열린 편집(붙여넣기 대기·드래그)은 모드 전환 같은 독립 명령처럼 확정해 테스트한 상태를 Undo 1개로 남긴다(RFD 0099).
      // 테스트 플레이는 재생기의 play()를 거치지 않으므로 여기서 정리해야, 돌아와 재생을 시작해도 테스트한 노트가 남는다.
      // 진입이 거절되면(오디오 없음·배치 제약 위반 등) 확정하지 않아 Esc 취소·방향키 이동이 그대로 남는다.
      // 확정은 history만 남기고 차트를 바꾸지 않으므로 게임은 위에서 넘긴 차트를 그대로 받는다.
      beforeEnter: () => useEditorStore.getState().commitEditTransaction(),
      // 전체 페이지 리로드(window.location)를 쓰면 게임 스토어의 비영속 상태
      // (screen='play', chartData, audioBuffer 등)가 초기화돼 타이틀 화면으로 떨어진다.
      // react-router 클라이언트 네비게이션으로 같은 JS 컨텍스트를 유지한다.
      navigate: () => navigateTo('/game'),
    });
  }, [addToast, setShowPlayTestMenu, playbackRef, navigateTo]);

  const handleDeleteChart = useCallback(async () => {
    if (!activeSongId) {
      addToast('No song selected — cannot delete', 'error');
      return;
    }
    // Save와 같이 열린 차트의 난이도 경로를 지운다. meta의 난이도명이 달라도 다른 난이도의 차트를 지우지 않는다.
    const difficulty = activeChartDifficulty(useEditorStore.getState());
    if (!difficulty) {
      addToast('Difficulty label is empty', 'error');
      return;
    }

    setDeleting(true);
    setShowDeleteConfirm(false);
    try {
      await persistDeleteChartAsset({
        songId: activeSongId,
        difficulty,
        chartId: useEditorStore.getState().chartRow?.id,
      });

      addToast('Chart deleted', 'info');
      window.location.href = '/game';
    } catch (err: unknown) {
      console.error('useFileOperations:', err);
      addToast('저장에 실패했습니다. 잠시 후 다시 시도해주세요.', 'error');
    } finally {
      setDeleting(false);
    }
  }, [activeSongId, addToast, setDeleting, setShowDeleteConfirm]);

  // 이벤트 편집 핸들러

  const handleEventSave = useCallback((values: Record<string, string>) => {
    if (!editingEvent) return;
    // 재생 중에는 이벤트 값(BPM·박자표 포함)을 바꾸지 않는다(RFD 0099). 편집 창의 Save도 비활성이지만 다른 경로까지 막는다.
    // 렌더러에 직접 넘기기 전에 막아야 store가 거부한 차트가 화면에만 그려지지 않는다.
    if (useEditorStore.getState().isPlaying) {
      addToast(PAUSE_TO_EDIT_COPY, 'warn');
      return;
    }

    const updated = { ...chart };
    updated.events = [...chart.events];
    const evt = updated.events[editingEvent.index];
    const isBeatZeroEvent = evt.beat.n === 0;

    // Build updated event based on its existing type
    let newEvt: typeof evt;
    if (evt.type === 'bpm') {
      const bpmVal = parseFloat(values.eventBpm ?? '');
      if (isNaN(bpmVal) || bpmVal <= 0) { addToast('BPM은 0보다 큰 숫자여야 합니다'); return; }
      newEvt = { ...evt, bpm: bpmVal };
    } else if (evt.type === 'timeSignature') {
      const tsN = Number(values.tsNumerator);
      const tsD = Number(values.tsDenominator);
      if (!Number.isInteger(tsN) || !Number.isInteger(tsD) || tsN <= 0 || tsD <= 0) {
        addToast('박자표 분자/분모는 자연수(양의 정수)만 가능합니다'); return;
      }
      if (!isBeatZeroEvent) {
        const currentTimeSigs = extractTimeSignatureChanges(chart.events);
        if (currentTimeSigs.length > 0 && !isMeasureBoundary(evt.beat, currentTimeSigs)) {
          addToast('박자표는 마디의 시작 위치에만 배치할 수 있습니다'); return;
        }
      }
      newEvt = { ...evt, beatPerMeasure: { n: tsN, d: tsD } };
    } else if (evt.type === 'text') {
      newEvt = { ...evt, text: values.text ?? '' };
    } else if (evt.type === 'tutorialInput') {
      const lane = Number(values.inputLane);
      const keyCode = (values.keyCode ?? '').trim();
      const keyLabel = (values.keyLabel ?? '').trim();
      if (![1, 2, 3, 4].includes(lane)) {
        addToast('튜토리얼 입력 레인은 L1~L4 중 하나여야 합니다'); return;
      }
      if (!keyCode) {
        addToast('튜토리얼 입력 keyCode는 비워둘 수 없습니다'); return;
      }
      const baseEvent = { ...evt, lane: lane as Lane, keyCode };
      if (keyLabel) {
        newEvt = { ...baseEvent, keyLabel };
      } else {
        const { keyLabel: _removed, ...withoutLabel } = baseEvent;
        void _removed;
        newEvt = withoutLabel;
      }
    } else if (evt.type === 'tutorialDiagram') {
      const diagramId = (values.diagramId ?? '').trim();
      if (diagramId !== 'connected-switch' && diagramId !== 'connected-overlap') {
        addToast('튜토리얼 도식은 connected-switch 또는 connected-overlap 중 하나여야 합니다'); return;
      }
      newEvt = { ...evt, diagramId: diagramId as TutorialDiagramId };
    } else {
      // 'auto' | 'stop' — no editable fields beyond beat/endBeat
      newEvt = evt;
    }

    // 편집 창은 값만 바꾼다. 초기 BPM·박자의 보조 레인은 1·2로 고정이라(RFD 0082) values의 레인을 읽지 않는다.
    updated.events[editingEvent.index] = newEvt;

    setChart(updated);
    rendererRef.current?.setChart(updated);
    setEditingEvent(null);
  }, [editingEvent, chart, rendererRef, setChart, setEditingEvent, addToast]);

  const handleEventDelete = useCallback(() => {
    if (!editingEvent) return;
    if (useEditorStore.getState().isPlaying) {
      addToast(PAUSE_TO_EDIT_COPY, 'warn');
      return;
    }

    const next = deleteEvents(chart, new Set([editingEvent.index]));
    if (!next) {
      addToast('Cannot delete initial event');
      return;
    }
    setChart(next);
    setEditingEvent(null);
  }, [editingEvent, chart, setChart, setEditingEvent, addToast]);

  return {
    handleSaveChart,
    handleSaveAs,
    handlePlayTest,
    handleDeleteChart,
    handleEventSave,
    handleEventDelete,
  };
}
