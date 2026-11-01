import { deleteEvents, isInitialTimingEvent } from '../editing/eventEditing';
/**
 * useFileOperations — 파일 저장/삭제 핸들러
 */

import { useCallback, useLayoutEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { PlaybackController } from '../playback/PlaybackController';
import {
  STORAGE_BUCKET,
  songPreviewPath,
  songJacketPath,
  songAudioPath,
  encodeWavBlob,
  extractTimeSignatureChanges,
  isMeasureBoundary,
} from '../../shared';
import type { Lane, PlaybackRange, TutorialDiagramId, ValidationError } from '../../shared';
import {
  deleteChartAsset as persistDeleteChartAsset,
  saveChartAsset as persistChartAsset,
  supabase,
} from '../../supabase';
import { useEditorStore } from '../stores';
import { useGameStore } from '../../game/stores';
import { performPlayTest } from '../playtest/performPlayTest';
import { editorChartErrors } from '../documentValidation';
import type { SavedChartJson } from '../savedChart';
import { PAUSE_TO_EDIT_COPY, SAVE_IN_PROGRESS_COPY } from '../editorCopy';
export { performPlayTest } from '../playtest/performPlayTest';
export type { PerformPlayTestParams, PlayTestGameActions } from '../playtest/performPlayTest';

export interface FileOperationHandlers {
  handleSaveChart: () => Promise<void>;
  handleSaveAs: (targetDifficulty: string, targetLevel: number) => Promise<void>;
  handlePlayTest: (fromCursor: boolean) => void;
  handleDeleteChart: () => Promise<void>;
  handleEventSave: (values: Record<string, string>) => void;
  handleEventDelete: () => void;
}

/**
 * 교체할 오디오 파일이 있으면 업로드 대상 storage 경로를 계산한다.
 * 파일 확장자를 그대로 쓰되, 없으면 기본 'ogg'를 사용한다.
 * 교체 파일이 없으면 null을 반환한다.
 */
export function resolveAudioUploadPath(
  pendingAudioFile: File | null,
  songId: string,
): string | null {
  if (!pendingAudioFile) return null;
  const ext = pendingAudioFile.name.split('.').pop() || 'ogg';
  return songAudioPath(songId, ext);
}

/**
 * 프리뷰 클립(preview.wav)을 재생성해야 하는 구간을 결정한다.
 * - 프리뷰 구간을 새로 지정/변경했으면 그 구간을 사용한다.
 * - 구간 변경은 없지만 오디오를 교체했고 기존 프리뷰 구간이 있으면,
 *   같은 구간을 새 음원 기준으로 다시 인코딩하기 위해 그 구간을 반환한다(페이드 없음).
 * - 둘 다 아니면 null(재생성 안 함).
 */
export function resolvePreviewRegenRange(
  pendingPreviewRange: PlaybackRange | null,
  audioReplaced: boolean,
  meta: { previewStart?: number; previewEnd?: number },
): PlaybackRange | null {
  if (pendingPreviewRange) return pendingPreviewRange;
  if (audioReplaced && meta.previewStart != null && meta.previewEnd != null) {
    return {
      startTime: meta.previewStart,
      endTime: meta.previewEnd,
      fadeInTime: 0,
      fadeOutTime: 0,
    };
  }
  return null;
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
  setPendingPreviewRange: (v: PlaybackRange | null) => void,
  setPendingGameplayRange: (v: PlaybackRange | null) => void,
  setPendingJacketFile: (v: File | null) => void,
  setJacketCacheBust: (v: number) => void,
  pendingPreviewRange: PlaybackRange | null,
  pendingGameplayRange: PlaybackRange | null,
  pendingJacketFile: File | null,
  setPendingAudioFile: (v: File | null) => void,
  pendingAudioFile: File | null,
  /** 테스트 플레이 시 /game으로 이동. 전체 리로드 대신 react-router 네비게이션을 주입한다. */
  navigateTo: (path: string) => void,
): FileOperationHandlers {
  const chart = useEditorStore((s) => s.chart);
  const setChart = useEditorStore((s) => s.setChart);
  const activeSongId = useEditorStore((s) => s.activeSongId);
  const extraLaneCount = useEditorStore((s) => s.extraLaneCount);
  const addToast = useEditorStore((s) => s.addToast);
  const beginChartSave = useEditorStore((s) => s.beginChartSave);
  const finishChartSave = useEditorStore((s) => s.finishChartSave);
  const editingEvent = useEditorStore((s) => s.editingEvent);
  const setEditingEvent = useEditorStore((s) => s.setEditingEvent);
  // 저장 콜백은 시작 시 파일을 캡처한다. 완료 시에는 마지막으로 적용한 Meta의 파일과 identity를 비교한다.
  const pendingAssetsRef = useRef({ jacket: pendingJacketFile, audio: pendingAudioFile });
  useLayoutEffect(() => {
    pendingAssetsRef.current = { jacket: pendingJacketFile, audio: pendingAudioFile };
  }, [pendingJacketFile, pendingAudioFile]);

  const handleSaveChart = useCallback(async () => {
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
      let chartToSave = chart;
      let resolvedJacketPath: string | null = null;
      if (pendingJacketFile) {
        const ext = pendingJacketFile.name.split('.').pop() || 'jpg';
        resolvedJacketPath = songJacketPath(activeSongId, ext);
        chartToSave = { ...chartToSave, meta: { ...chartToSave.meta, imageFile: resolvedJacketPath } };
      }

      const resolvedAudioPath = resolveAudioUploadPath(pendingAudioFile, activeSongId);
      if (resolvedAudioPath) {
        chartToSave = { ...chartToSave, meta: { ...chartToSave.meta, audioFile: resolvedAudioPath } };
      }

      const savedAsset = await persistChartAsset({
        songId: activeSongId,
        difficulty,
        chart: chartToSave,
        extraLaneCount,
      });

      if (pendingJacketFile && resolvedJacketPath) {
        const { error: jacketUpErr } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(resolvedJacketPath, pendingJacketFile, { upsert: true });
        if (jacketUpErr) throw new Error(`Jacket upload failed: ${jacketUpErr.message}`);
        await supabase.from('songs').update({ jacket_url: resolvedJacketPath }).eq('id', activeSongId);
        if (pendingAssetsRef.current.jacket === pendingJacketFile) {
          const currentChart = useEditorStore.getState().chart;
          setChart({ ...currentChart, meta: { ...currentChart.meta, imageFile: resolvedJacketPath } });
          setPendingJacketFile(null);
        }
        setJacketCacheBust(Date.now());
      }

      if (pendingAudioFile && resolvedAudioPath) {
        const { error: audioUpErr } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(resolvedAudioPath, pendingAudioFile, { upsert: true });
        if (audioUpErr) throw new Error(`Audio upload failed: ${audioUpErr.message}`);
        await supabase.from('songs').update({ audio_url: resolvedAudioPath }).eq('id', activeSongId);
        if (pendingAssetsRef.current.audio === pendingAudioFile) {
          const currentChart = useEditorStore.getState().chart;
          setChart({ ...currentChart, meta: { ...currentChart.meta, audioFile: resolvedAudioPath } });
          setPendingAudioFile(null);
        }
      }

      const songUpdate: Record<string, unknown> = {};

      if (pendingPreviewRange) {
        Object.assign(songUpdate, {
          preview_start: pendingPreviewRange.startTime,
          preview_end: pendingPreviewRange.endTime,
        });
      }

      // 프리뷰 클립은 (1) 구간 변경 시 또는 (2) 오디오 교체 시(기존 구간 유지) 재생성한다.
      const previewRegenRange = resolvePreviewRegenRange(
        pendingPreviewRange,
        pendingAudioFile != null,
        chart.meta,
      );
      if (previewRegenRange) {
        const ab = playbackRef.current?.audioBufferData;
        if (ab) {
          const wavBlob = encodeWavBlob(ab, previewRegenRange.startTime, previewRegenRange.endTime, {
            fadeInTime: previewRegenRange.fadeInTime,
            fadeOutTime: previewRegenRange.fadeOutTime,
          });
          const previewPath = songPreviewPath(activeSongId);
          const { error: prevUpErr } = await supabase.storage
            .from(STORAGE_BUCKET)
            .upload(previewPath, wavBlob, { upsert: true });
          if (prevUpErr) throw new Error(`Preview upload failed: ${prevUpErr.message}`);
          songUpdate.preview_url = previewPath;
        }
      }

      if (pendingGameplayRange) {
        Object.assign(songUpdate, {
          gameplay_start: pendingGameplayRange.startTime,
          gameplay_end: pendingGameplayRange.endTime,
          gameplay_fade_in: pendingGameplayRange.fadeInTime,
          gameplay_fade_out: pendingGameplayRange.fadeOutTime,
        });
      }

      // 오디오/프리뷰 파일을 교체하면 storage 경로(URL)는 그대로라 브라우저 캐시가
      // 옛 파일을 제공한다. updated_at을 갱신해 프리뷰 재생 URL의 캐시버스트 토큰으로 쓴다.
      // (songs.updated_at은 default now()라 UPDATE 시 자동 갱신되지 않으므로 직접 넣는다.)
      if (pendingAudioFile != null || previewRegenRange != null) {
        songUpdate.updated_at = new Date().toISOString();
      }

      if (Object.keys(songUpdate).length > 0) {
        const { error: songUpdateError } = await supabase
          .from('songs')
          .update(songUpdate)
          .eq('id', activeSongId);
        if (songUpdateError) throw new Error(`Song settings update failed: ${songUpdateError.message}`);

        setPendingPreviewRange(null);
        setPendingGameplayRange(null);
      }

      // 업로드한 메인·보조 JSON(저장을 시작할 때의 chartToSave)을 아래 finally에서 savedChartJson으로 정한다.
      // 저장 결과의 경로만 현재 차트에 합치므로 저장 중 편집은 남고 업로드한 JSON과 달라 dirty다.
      uploadedJson = { chartJson: savedAsset.chartJson, extraJson: savedAsset.extraJson };
      addToast('Chart saved', 'info');
    } catch (err: unknown) {
      console.error('useFileOperations:', err);
      addToast('저장에 실패했습니다. 잠시 후 다시 시도해주세요.', 'error');
    } finally {
      // 실패(uploadedJson null)면 savedChartJson을 그대로 둬 dirty가 남는다. 그 사이 차트를 새로 불러왔으면 store가 무시한다.
      finishChartSave(saveGeneration, uploadedJson);
    }
  }, [chart, activeSongId, addToast, pendingPreviewRange, pendingGameplayRange, pendingJacketFile, pendingAudioFile, extraLaneCount, playbackRef, setChart, beginChartSave, finishChartSave, setValidationErrors, setPendingPreviewRange, setPendingGameplayRange, setPendingJacketFile, setPendingAudioFile, setJacketCacheBust]);

  const handleSaveAs = useCallback(async (targetDifficulty: string, targetLevel: number) => {
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
      uploadedJson = { chartJson: savedAsset.chartJson, extraJson: savedAsset.extraJson };

      window.history.replaceState(null, '', `?songId=${activeSongId}&difficulty=${difficulty}`);

      addToast(`Chart saved as ${targetDifficulty.toUpperCase()} Lv.${targetLevel}`, 'info');
    } catch (err: unknown) {
      console.error('useFileOperations:', err);
      addToast('저장에 실패했습니다. 잠시 후 다시 시도해주세요.', 'error');
    } finally {
      finishChartSave(saveGeneration, uploadedJson);
    }
  }, [chart, activeSongId, addToast, extraLaneCount, setChart, beginChartSave, finishChartSave, setValidationErrors, setShowSaveAsModal, setSaveAsOverwriteTarget]);

  const handlePlayTest = useCallback((fromCursor: boolean) => {
    // 저장이 끝나기 전에 /game으로 가면 페이지가 다시 마운트되어, 진행 중인 저장이 끝날 때 하는 페이지 상태 정리
    // (구간·재킷·오디오 대기 비우기)가 사라진 페이지에 닿는다. 툴바 버튼도 비활성이지만 다른 경로까지 여기서 막는다.
    if (useEditorStore.getState().isSavingChart) {
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

    if (isInitialTimingEvent(evt)) {
      const editorLane = Number(values.editorLane ?? evt.editorLane ?? 1);
      if (!Number.isInteger(editorLane) || editorLane < 1 || editorLane > extraLaneCount) {
        addToast('보조 레인은 현재 보조 레인 범위 안의 정수여야 합니다');
        return;
      }
      newEvt = { ...newEvt, editorLane };
    }
    updated.events[editingEvent.index] = newEvt;

    setChart(updated);
    rendererRef.current?.setChart(updated);
    setEditingEvent(null);
  }, [editingEvent, chart, extraLaneCount, rendererRef, setChart, setEditingEvent, addToast]);

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
