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
  extractTimeSignatureChanges,
  isMeasureBoundary,
} from '../../shared';
import type { Lane, TutorialDiagramId, ValidationError } from '../../shared';
import {
  deleteChartAsset as persistDeleteChartAsset,
  saveChartAsset as persistChartAsset,
} from '../../supabase';
import { useEditorStore } from '../stores';
import { useGameStore } from '../../game/stores';
import { performPlayTest } from '../playtest/performPlayTest';
import { editorChartErrors } from '../documentValidation';
import type { SavedChartJson } from '../savedChart';
import { PAUSE_TO_EDIT_COPY, SAVE_IN_PROGRESS_COPY } from '../editorCopy';
export { performPlayTest } from '../playtest/performPlayTest';
export type { PerformPlayTestParams, PlayTestGameActions } from '../playtest/performPlayTest';

/** Save·Save As는 같은 시작 초안을 사용한다. 기다리는 동안 추가한 편집은 저장 기준에 넣지 않는다. */
async function prepareSave(audioBuffer: AudioBuffer | null) {
  const start = useEditorStore.getState();
  if (start.isSavingSong || start.isSavingChart) {
    start.addToast(SAVE_IN_PROGRESS_COPY.secondSave, 'error');
    return null;
  }
  const songDirty = isSongDirty(start.chart, start.song);
  const chartDirty = isChartDirty(start.chart, start.extraLaneCount, start.savedChartJson, start.song !== null);
  if (songDirty && !await saveEditorSong(audioBuffer, message => window.confirm(message))) return null;
  const current = useEditorStore.getState();
  if (current.chartLoadGeneration !== start.chartLoadGeneration) return null;
  // 업로드로 확정된 곡 경로만 사본에 반영한다. 저장 중의 노트·타이밍 편집은 다음 저장에 남긴다.
  const savedSong = songDirty ? current.song?.baseline : null;
  const chart = savedSong ? { ...start.chart, meta: { ...start.chart.meta,
    imageFile: savedSong.jacketUrl ?? '', audioFile: savedSong.audioUrl, previewAudioFile: savedSong.previewUrl ?? '',
  } } : start.chart;
  return { chart, activeSongId: start.activeSongId, extraLaneCount: start.extraLaneCount,
    chartLoadGeneration: start.chartLoadGeneration,
    // 아무 변경도 없으면 기존처럼 현재 차트를 저장한다.
    saveChart: chartDirty || !songDirty };
}

export interface FileOperationHandlers {
  handleSaveChart: () => Promise<void>;
  handleSaveAs: (targetDifficulty: string, targetLevel: number) => Promise<void>;
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
    const prepared = await prepareSave(playbackRef.current?.audioBufferData ?? null);
    if (!prepared || !prepared.saveChart
      || useEditorStore.getState().chartLoadGeneration !== prepared.chartLoadGeneration) return;
    const { chart, activeSongId, extraLaneCount } = prepared;
    if (!activeSongId) {
      addToast('No song selected — cannot save to server', 'error');
      return;
    }
    const difficulty = chart.meta.difficultyLabel.toLowerCase();
    if (!difficulty) {
      addToast('Difficulty label is empty', 'error');
      return;
    }

    // 저장 게이트도 보조 레인 위반을 동일하게 본다 (RFD 0018 §3-6 — ③ 후 chart.notes로 환원)
    const errors = editorChartErrors({
      notes: chart.notes,
      trillZones: chart.trillZones,
      restZones: chart.restZones,
      events: chart.events,
    });
    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }

    // 저장 진행은 store가 소유한다. 테스트 플레이에서 돌아와 페이지가 다시 마운트돼도 진행 중인 저장을 알고 막는다.
    const saveGeneration = beginChartSave();
    if (saveGeneration === null) {
      // Save 버튼은 저장 중 비활성이다. 다른 경로로 들어와도 저장을 겹쳐 시작하지 않는다.
      addToast(SAVE_IN_PROGRESS_COPY.secondSave, 'error');
      return;
    }
    let uploadedJson: SavedChartJson | null = null;
    try {
      const savedAsset = await persistChartAsset({
        songId: activeSongId,
        difficulty,
        chart,
        extraLaneCount,
      });

      uploadedJson = { chartJson: savedAsset.chartJson, extraJson: savedAsset.extraJson };
      addToast('Chart saved', 'info');
    } catch (err: unknown) {
      console.error('useFileOperations:', err);
      addToast('저장에 실패했습니다. 잠시 후 다시 시도해주세요.', 'error');
    } finally {
      // 실패(uploadedJson null)면 savedChartJson을 그대로 둬 dirty가 남는다. 그 사이 차트를 새로 불러왔으면 store가 무시한다.
      finishChartSave(saveGeneration, uploadedJson);
    }
  }, [playbackRef, addToast, beginChartSave, finishChartSave, setValidationErrors]);

  const handleSaveAs = useCallback(async (targetDifficulty: string, targetLevel: number) => {
    const prepared = await prepareSave(playbackRef.current?.audioBufferData ?? null);
    if (!prepared || useEditorStore.getState().chartLoadGeneration !== prepared.chartLoadGeneration) return;
    const { chart, activeSongId, extraLaneCount } = prepared;
    if (!activeSongId) {
      addToast('No song selected — cannot save', 'error');
      return;
    }

    // 저장 게이트도 보조 레인 위반을 동일하게 본다 (RFD 0018 §3-6)
    const errors = editorChartErrors({
      notes: chart.notes,
      trillZones: chart.trillZones,
      restZones: chart.restZones,
      events: chart.events,
    });
    if (errors.length > 0) {
      setValidationErrors(errors);
      setShowSaveAsModal(false);
      return;
    }

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

      const savedAsset = await persistChartAsset({
        songId: activeSongId,
        difficulty,
        chart: chartToSave,
        extraLaneCount,
      });

      const currentChart = useEditorStore.getState().chart;
      setChart({
        ...currentChart,
        meta: { ...currentChart.meta, difficultyLabel: targetDifficulty, difficultyLevel: targetLevel },
      });
      const current = useEditorStore.getState();
      if (current.song && current.chartSaveGeneration === saveGeneration) {
        // 다음 곡 이행 확인에서는 Save As로 열린 차트를 비교 대상에서 제외한다.
        current.setSong({ ...current.song, sourceDifficulty: targetDifficulty });
      }
      uploadedJson = { chartJson: savedAsset.chartJson, extraJson: savedAsset.extraJson };

      window.history.replaceState(null, '', `?songId=${activeSongId}&difficulty=${difficulty}`);

      addToast(`Chart saved as ${targetDifficulty.toUpperCase()} Lv.${targetLevel}`, 'info');
    } catch (err: unknown) {
      console.error('useFileOperations:', err);
      addToast('저장에 실패했습니다. 잠시 후 다시 시도해주세요.', 'error');
    } finally {
      finishChartSave(saveGeneration, uploadedJson);
    }
  }, [playbackRef, addToast, setChart, beginChartSave, finishChartSave, setValidationErrors, setShowSaveAsModal, setSaveAsOverwriteTarget]);

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
    const difficulty = chart.meta.difficultyLabel.toLowerCase();
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
      });

      addToast('Chart deleted', 'info');
      window.location.href = '/game';
    } catch (err: unknown) {
      console.error('useFileOperations:', err);
      addToast('저장에 실패했습니다. 잠시 후 다시 시도해주세요.', 'error');
    } finally {
      setDeleting(false);
    }
  }, [chart, activeSongId, addToast, setDeleting, setShowDeleteConfirm]);

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
