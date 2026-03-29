/**
 * useFileOperations — 파일 저장/삭제/테스트플레이 핸들러
 */

import { useCallback } from 'react';
import type { RefObject } from 'react';
import type { PlaybackController } from '../playback/PlaybackController';
import { useNavigate } from 'react-router-dom';
import {
  serializeChart,
  serializeExtraNotes,
  STORAGE_BUCKET,
  songChartPath,
  songChartExtraPath,
  songPreviewPath,
  songJacketPath,
  encodeWavBlob,
  validateChart,
  extractTimeSignatures,
  isMeasureBoundary,
} from '../../shared';
import type { ValidationError } from '../../shared';
import { supabase } from '../../supabase';
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
  setPendingPreviewRange: (v: { startTime: number; endTime: number } | null) => void,
  setPendingJacketFile: (v: File | null) => void,
  setJacketCacheBust: (v: number) => void,
  pendingPreviewRange: { startTime: number; endTime: number } | null,
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

  const editorNavigate = useNavigate();

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

      const chartJson = serializeChart(chartToSave);
      const chartPath = songChartPath(activeSongId, difficulty);
      const chartBlob = new Blob([chartJson], { type: 'application/json' });
      const chartUpload = supabase.storage
        .from(STORAGE_BUCKET)
        .upload(chartPath, chartBlob, { upsert: true });

      const extraPath = songChartExtraPath(activeSongId, difficulty);
      const hasExtra = extraLaneCount > 0 || extraNotes.length > 0;
      const extraUpload = hasExtra
        ? supabase.storage
            .from(STORAGE_BUCKET)
            .upload(extraPath, new Blob([serializeExtraNotes(extraNotes, extraLaneCount)], { type: 'application/json' }), { upsert: true })
        : supabase.storage.from(STORAGE_BUCKET).remove([extraPath]);

      const [chartResult, extraResult] = await Promise.all([chartUpload, extraUpload]);
      if (chartResult.error) throw new Error(`Upload failed: ${chartResult.error.message}`);
      if (hasExtra && extraResult.error) throw new Error(`Extra upload failed: ${extraResult.error.message}`);

      const { error: dbError } = await supabase.from('charts').upsert({
        song_id: activeSongId,
        difficulty_label: difficulty,
        difficulty_level: chart.meta.difficultyLevel,
        offset_ms: chart.meta.offsetMs,
      }, { onConflict: 'song_id,difficulty_label' });
      if (dbError) throw new Error(`DB save failed: ${dbError.message}`);

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

      if (pendingPreviewRange) {
        const songUpdate: Record<string, unknown> = {
          preview_start: pendingPreviewRange.startTime,
          preview_end: pendingPreviewRange.endTime,
        };

        const ab = playbackRef.current?.audioBufferData;
        if (ab) {
          const wavBlob = encodeWavBlob(ab, pendingPreviewRange.startTime, pendingPreviewRange.endTime);
          const previewPath = songPreviewPath(activeSongId);
          const { error: prevUpErr } = await supabase.storage
            .from(STORAGE_BUCKET)
            .upload(previewPath, wavBlob, { upsert: true });
          if (prevUpErr) throw new Error(`Preview upload failed: ${prevUpErr.message}`);
          songUpdate.preview_url = previewPath;
        }

        const { error: songUpdateError } = await supabase
          .from('songs')
          .update(songUpdate)
          .eq('id', activeSongId);
        if (songUpdateError) throw new Error(`Song preview update failed: ${songUpdateError.message}`);

        setPendingPreviewRange(null);
      }

      setSavedChartSnapshot(chartJson);
      setSavedExtraSnapshot(serializeExtraNotes(extraNotes, extraLaneCount));
      addToast('Chart saved', 'info');
    } catch (err: unknown) {
      console.error('useFileOperations:', err);
      addToast('저장에 실패했습니다. 잠시 후 다시 시도해주세요.', 'error');
    } finally {
      setSaving(false);
    }
  }, [chart, activeSongId, addToast, pendingPreviewRange, pendingJacketFile, extraNotes, extraLaneCount, setChart, setSaving, setValidationErrors, setPendingPreviewRange, setPendingJacketFile, setJacketCacheBust, setSavedChartSnapshot, setSavedExtraSnapshot]);

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

      const chartJson = serializeChart(chartToSave);
      const chartPath = songChartPath(activeSongId, difficulty);
      const chartBlob = new Blob([chartJson], { type: 'application/json' });
      const chartUpload = supabase.storage
        .from(STORAGE_BUCKET)
        .upload(chartPath, chartBlob, { upsert: true });

      const extraPath = songChartExtraPath(activeSongId, difficulty);
      const hasExtra = extraLaneCount > 0 || extraNotes.length > 0;
      const extraUpload = hasExtra
        ? supabase.storage
            .from(STORAGE_BUCKET)
            .upload(extraPath, new Blob([serializeExtraNotes(extraNotes, extraLaneCount)], { type: 'application/json' }), { upsert: true })
        : supabase.storage.from(STORAGE_BUCKET).remove([extraPath]);

      const [chartResult, extraResult] = await Promise.all([chartUpload, extraUpload]);
      if (chartResult.error) throw new Error(`Upload failed: ${chartResult.error.message}`);
      if (hasExtra && extraResult.error) throw new Error(`Extra upload failed: ${extraResult.error.message}`);

      const { error: dbError } = await supabase.from('charts').upsert({
        song_id: activeSongId,
        difficulty_label: difficulty,
        difficulty_level: targetLevel,
        offset_ms: chart.meta.offsetMs,
      }, { onConflict: 'song_id,difficulty_label' });
      if (dbError) throw new Error(`DB save failed: ${dbError.message}`);

      setChart(chartToSave);
      setSavedChartSnapshot(chartJson);
      setSavedExtraSnapshot(serializeExtraNotes(extraNotes, extraLaneCount));

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
    editorNavigate('/game');
  }, [chart, currentTimeMs, editorNavigate, addToast, setShowPlayTestMenu]);

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
      const { error: dbError } = await supabase
        .from('charts')
        .delete()
        .eq('song_id', activeSongId)
        .eq('difficulty_label', difficulty);
      if (dbError) throw new Error(`DB delete failed: ${dbError.message}`);

      const path = songChartPath(activeSongId, difficulty);
      const extraPath = songChartExtraPath(activeSongId, difficulty);
      const { error: storageError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .remove([path, extraPath]);
      if (storageError) throw new Error(`Storage delete failed: ${storageError.message}`);

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
  const isEditingBeatZero = editingMarker && chart.events[editingMarker.index]?.beat.n === 0;

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
  }, [editingMarker, chart, setChart, setEditingMarker, addToast]);

  const handleMarkerDelete = useCallback(() => {
    if (!editingMarker) return;

    if (isEditingBeatZero) {
      addToast('Cannot delete initial event marker');
      return;
    }

    setChart({
      ...chart,
      events: chart.events.filter((_, i) => i !== editingMarker.index),
    });
    setEditingMarker(null);
  }, [editingMarker, isEditingBeatZero, chart, setChart, setEditingMarker, addToast]);

  return {
    handleSaveChart,
    handleSaveAs,
    handlePlayTest,
    handleDeleteChart,
    handleMarkerSave,
    handleMarkerDelete,
  };
}
