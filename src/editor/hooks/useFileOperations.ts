/**
 * useFileOperations — 파일 저장/삭제 핸들러
 */

import { useCallback } from 'react';
import type { RefObject } from 'react';
import type { PlaybackController } from '../playback/PlaybackController';
import {
  STORAGE_BUCKET,
  songPreviewPath,
  songJacketPath,
  songAudioPath,
  encodeWavBlob,
  validateChart,
  extractTimeSignatures,
  isMeasureBoundary,
  toPlayableChart,
} from '../../shared';
import type { Chart, Lane, PlayableChart, PlaybackRange, TutorialDiagramId, ValidationError } from '../../shared';
import {
  deleteChartAsset as persistDeleteChartAsset,
  saveChartAsset as persistChartAsset,
  supabase,
} from '../../supabase';
import { useEditorStore } from '../stores';
import { useGameStore } from '../../game/stores';
import { hiddenAuxViolationMessage } from '../validationFeedback';

export interface FileOperationHandlers {
  handleSaveChart: () => Promise<void>;
  handleSaveAs: (targetDifficulty: string, targetLevel: number) => Promise<void>;
  handlePlayTest: (fromCursor: boolean) => void;
  handleDeleteChart: () => Promise<void>;
  handleMarkerSave: (values: Record<string, string>) => void;
  handleMarkerDelete: () => void;
}

/** 테스트 플레이가 게임 스토어에 적용하는 액션 (테스트에서 주입 가능하도록 분리) */
export interface PlayTestGameActions {
  setChartData: (chart: PlayableChart | null) => void;
  setAudioBuffer: (buffer: AudioBuffer | null) => void;
  setStartTimeMs: (ms: number) => void;
  setEditorReturnUrl: (url: string | null) => void;
  setScreen: (screen: 'play') => void;
}

export interface PerformPlayTestParams {
  /** true면 현재 커서 위치부터, false면 처음(0)부터 시작 */
  fromCursor: boolean;
  audioBuffer: AudioBuffer | null;
  isPlaying: boolean;
  pause: () => void;
  chart: Chart;
  extraLaneCount: number;
  currentTimeMs: number;
  returnUrl: string;
  game: PlayTestGameActions;
  addToast: (message: string, type: 'error') => void;
  closeMenu: () => void;
  navigate: () => void;
}

/**
 * 테스트 플레이 전환 로직 (순수: 의존성 주입).
 * 오디오가 로딩되지 않았으면 에러 토스트만 띄우고 화면 전환 없이 false를 반환한다.
 * 성공 시 게임 스토어를 채우고 play 화면으로 전환한 뒤 true를 반환한다.
 */
export function performPlayTest(params: PerformPlayTestParams): boolean {
  const {
    fromCursor, audioBuffer, isPlaying, pause, chart, extraLaneCount, currentTimeMs,
    returnUrl, game, addToast, closeMenu, navigate,
  } = params;

  if (!audioBuffer) {
    addToast('오디오가 로딩되지 않았습니다', 'error');
    return false;
  }

  // 플레이/프리뷰 진입 게이트 (RFD 0017 §3-2) — 게임은 valid 차트를 전제하므로,
  // 낙관적 편집으로 남은 위반(구조·의미)이 있으면 진입을 막는다. 버튼 비활성이
  // 1차 UX이고 이 검사는 다른 진입 경로(단축키 등)를 막는 backstop이다.
  const violations = validateChart({
    notes: chart.notes,
    trillZones: chart.trillZones,
    events: chart.events,
  });
  if (violations.length > 0) {
    addToast(
      hiddenAuxViolationMessage(violations, chart.notes, extraLaneCount)
        ?? `배치 제약 위반 ${violations.length}건이 남아 있어 플레이할 수 없습니다`,
      'error',
    );
    return false;
  }

  if (isPlaying) pause();

  game.setChartData(toPlayableChart(chart));
  game.setAudioBuffer(audioBuffer);
  game.setStartTimeMs(fromCursor ? currentTimeMs : 0);
  game.setEditorReturnUrl(returnUrl);
  game.setScreen('play');

  closeMenu();
  navigate();
  return true;
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
  setSaving: (v: boolean) => void,
  setDeleting: (v: boolean) => void,
  setValidationErrors: (errors: ValidationError[]) => void,
  setShowSaveAsModal: (v: boolean) => void,
  setSaveAsOverwriteTarget: (v: { difficulty: string; level: number } | null) => void,
  setShowDeleteConfirm: (v: boolean) => void,
  setShowPlayTestMenu: (v: boolean) => void,
  setSavedChartSnapshot: (v: string) => void,
  setSavedExtraSnapshot: (v: string) => void,
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
  const currentTimeMs = useEditorStore((s) => s.currentTimeMs);
  const addToast = useEditorStore((s) => s.addToast);
  const editingMarker = useEditorStore((s) => s.editingMarker);
  const setEditingMarker = useEditorStore((s) => s.setEditingMarker);

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

    const errors = validateChart({
      notes: chart.notes,
      trillZones: chart.trillZones,
      events: chart.events,
    });
    if (errors.length > 0) {
      setValidationErrors(errors);
      const hiddenMessage = hiddenAuxViolationMessage(errors, chart.notes, extraLaneCount);
      if (hiddenMessage) addToast(hiddenMessage, 'error');
      return;
    }

    setSaving(true);
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
        setChart(chartToSave);
        setPendingJacketFile(null);
        setJacketCacheBust(Date.now());
      }

      if (pendingAudioFile && resolvedAudioPath) {
        const { error: audioUpErr } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(resolvedAudioPath, pendingAudioFile, { upsert: true });
        if (audioUpErr) throw new Error(`Audio upload failed: ${audioUpErr.message}`);
        await supabase.from('songs').update({ audio_url: resolvedAudioPath }).eq('id', activeSongId);
        setChart(chartToSave);
        setPendingAudioFile(null);
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

      setSavedChartSnapshot(savedAsset.chartJson);
      setSavedExtraSnapshot(savedAsset.extraJson);
      addToast('Chart saved', 'info');
    } catch (err: unknown) {
      console.error('useFileOperations:', err);
      addToast('저장에 실패했습니다. 잠시 후 다시 시도해주세요.', 'error');
    } finally {
      setSaving(false);
    }
  }, [chart, activeSongId, addToast, pendingPreviewRange, pendingGameplayRange, pendingJacketFile, pendingAudioFile, extraLaneCount, playbackRef, setChart, setSaving, setValidationErrors, setPendingPreviewRange, setPendingGameplayRange, setPendingJacketFile, setPendingAudioFile, setJacketCacheBust, setSavedChartSnapshot, setSavedExtraSnapshot]);

  const handleSaveAs = useCallback(async (targetDifficulty: string, targetLevel: number) => {
    if (!activeSongId) {
      addToast('No song selected — cannot save', 'error');
      return;
    }

    const errors = validateChart({
      notes: chart.notes,
      trillZones: chart.trillZones,
      events: chart.events,
    });
    if (errors.length > 0) {
      setValidationErrors(errors);
      const hiddenMessage = hiddenAuxViolationMessage(errors, chart.notes, extraLaneCount);
      if (hiddenMessage) addToast(hiddenMessage, 'error');
      setShowSaveAsModal(false);
      return;
    }

    setSaving(true);
    setShowSaveAsModal(false);
    setSaveAsOverwriteTarget(null);
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

      setChart(chartToSave);
      setSavedChartSnapshot(savedAsset.chartJson);
      setSavedExtraSnapshot(savedAsset.extraJson);

      window.history.replaceState(null, '', `?songId=${activeSongId}&difficulty=${difficulty}`);

      addToast(`Chart saved as ${targetDifficulty.toUpperCase()} Lv.${targetLevel}`, 'info');
    } catch (err: unknown) {
      console.error('useFileOperations:', err);
      addToast('저장에 실패했습니다. 잠시 후 다시 시도해주세요.', 'error');
    } finally {
      setSaving(false);
    }
  }, [chart, activeSongId, addToast, extraLaneCount, setChart, setSaving, setValidationErrors, setShowSaveAsModal, setSaveAsOverwriteTarget, setSavedChartSnapshot, setSavedExtraSnapshot]);

  const handlePlayTest = useCallback((fromCursor: boolean) => {
    const game = useGameStore.getState();
    performPlayTest({
      fromCursor,
      audioBuffer: playbackRef.current?.audioBufferData ?? null,
      isPlaying: playbackRef.current?.isPlaying ?? false,
      pause: () => playbackRef.current?.pause(),
      chart,
      extraLaneCount,
      currentTimeMs,
      returnUrl: window.location.pathname + window.location.search,
      game: {
        setChartData: game.setChartData,
        setAudioBuffer: game.setAudioBuffer,
        setStartTimeMs: game.setStartTimeMs,
        setEditorReturnUrl: game.setEditorReturnUrl,
        setScreen: game.setScreen,
      },
      addToast,
      closeMenu: () => setShowPlayTestMenu(false),
      // 전체 페이지 리로드(window.location)를 쓰면 게임 스토어의 비영속 상태
      // (screen='play', chartData, audioBuffer 등)가 초기화돼 타이틀 화면으로 떨어진다.
      // react-router 클라이언트 네비게이션으로 같은 JS 컨텍스트를 유지한다.
      navigate: () => navigateTo('/game'),
    });
  }, [chart, extraLaneCount, currentTimeMs, addToast, setShowPlayTestMenu, playbackRef, navigateTo]);

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

  // 마커 편집 핸들러
  const editingEvt = editingMarker ? chart.events[editingMarker.index] : null;
  const isEditingInitial = editingEvt && editingEvt.beat.n === 0 && (editingEvt.type === 'bpm' || editingEvt.type === 'timeSignature');

  const handleMarkerSave = useCallback((values: Record<string, string>) => {
    if (!editingMarker) return;

    const updated = { ...chart };
    updated.events = [...chart.events];
    const evt = updated.events[editingMarker.index];
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
        const currentTimeSigs = extractTimeSignatures(chart.events);
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

    updated.events[editingMarker.index] = newEvt;

    setChart(updated);
    rendererRef.current?.setChart(updated);
    setEditingMarker(null);
  }, [editingMarker, chart, rendererRef, setChart, setEditingMarker, addToast]);

  const handleMarkerDelete = useCallback(() => {
    if (!editingMarker) return;

    if (isEditingInitial) {
      addToast('Cannot delete initial event marker');
      return;
    }

    setChart({
      ...chart,
      events: chart.events.filter((_, i) => i !== editingMarker.index),
    });
    setEditingMarker(null);
  }, [editingMarker, isEditingInitial, chart, setChart, setEditingMarker, addToast]);

  return {
    handleSaveChart,
    handleSaveAs,
    handlePlayTest,
    handleDeleteChart,
    handleMarkerSave,
    handleMarkerDelete,
  };
}
