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
  encodeWavBlob,
  validateChart,
  extractTimeSignatures,
  isMeasureBoundary,
} from '../../shared';
import type { PlaybackRange, ValidationError } from '../../shared';
import {
  deleteChartAsset as persistDeleteChartAsset,
  saveChartAsset as persistChartAsset,
  supabase,
} from '../../supabase';
import { useEditorStore } from '../stores';
import { useGameStore } from '../../game/stores';

export interface FileOperationHandlers {
  handleSaveChart: () => Promise<void>;
  handleSaveAs: (targetDifficulty: string, targetLevel: number) => Promise<void>;
  handlePlayTest: (fromCursor: boolean) => void;
  handleDeleteChart: () => Promise<void>;
  handleMarkerSave: (values: Record<string, string>) => void;
  handleMarkerDelete: () => void;
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
): FileOperationHandlers {
  const chart = useEditorStore((s) => s.chart);
  const setChart = useEditorStore((s) => s.setChart);
  const activeSongId = useEditorStore((s) => s.activeSongId);
  const extraNotes = useEditorStore((s) => s.extraNotes);
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
      return;
    }

    setSaving(true);
    try {
      let chartToSave = chart;
      let resolvedJacketPath: string | null = null;
      if (pendingJacketFile) {
        const ext = pendingJacketFile.name.split('.').pop() || 'jpg';
        resolvedJacketPath = songJacketPath(activeSongId, ext);
        chartToSave = { ...chart, meta: { ...chart.meta, imageFile: resolvedJacketPath } };
      }

      const savedAsset = await persistChartAsset({
        songId: activeSongId,
        difficulty,
        chart: chartToSave,
        extraNotes,
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

      const songUpdate: Record<string, unknown> = {};

      if (pendingPreviewRange) {
        Object.assign(songUpdate, {
          preview_start: pendingPreviewRange.startTime,
          preview_end: pendingPreviewRange.endTime,
        });

        const ab = playbackRef.current?.audioBufferData;
        if (ab) {
          const wavBlob = encodeWavBlob(ab, pendingPreviewRange.startTime, pendingPreviewRange.endTime, {
            fadeInTime: pendingPreviewRange.fadeInTime,
            fadeOutTime: pendingPreviewRange.fadeOutTime,
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
  }, [chart, activeSongId, addToast, pendingPreviewRange, pendingGameplayRange, pendingJacketFile, extraNotes, extraLaneCount, playbackRef, setChart, setSaving, setValidationErrors, setPendingPreviewRange, setPendingGameplayRange, setPendingJacketFile, setJacketCacheBust, setSavedChartSnapshot, setSavedExtraSnapshot]);

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
        extraNotes,
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
  }, [chart, activeSongId, addToast, extraNotes, extraLaneCount, setChart, setSaving, setValidationErrors, setShowSaveAsModal, setSaveAsOverwriteTarget, setSavedChartSnapshot, setSavedExtraSnapshot]);

  const handlePlayTest = useCallback((fromCursor: boolean) => {
    const audioBuffer = playbackRef.current?.audioBufferData;
    if (!audioBuffer) {
      addToast('오디오가 로딩되지 않았습니다', 'error');
      return;
    }

    if (playbackRef.current?.isPlaying) {
      playbackRef.current.pause();
    }

    const gameStore = useGameStore.getState();
    gameStore.setChartData(chart);
    gameStore.setAudioBuffer(audioBuffer);
    gameStore.setStartTimeMs(fromCursor ? currentTimeMs : 0);
    gameStore.setEditorReturnUrl(window.location.pathname + window.location.search);
    gameStore.setScreen('play');

    setShowPlayTestMenu(false);
    window.location.href = '/game';
  }, [chart, currentTimeMs, addToast, setShowPlayTestMenu, playbackRef]);

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
