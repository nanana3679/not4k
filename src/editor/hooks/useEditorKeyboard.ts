/**
 * useEditorKeyboard — 키보드 단축키 처리
 */

import { useEffect } from 'react';
import type { RefObject } from 'react';
import type { PlaybackController } from '../playback/PlaybackController';
import type { SelectMode } from '../modes';
import type { SnapZoomController } from '../timeline/SnapZoomController';
import { msToBeat } from '../../shared';
import type { BpmMarker } from '../../shared';
import { useEditorStore } from '../stores';

export function useEditorKeyboard(
  playbackRef: RefObject<PlaybackController | null>,
  selectModeRef: RefObject<SelectMode | null>,
  snapZoomRef: RefObject<SnapZoomController | null>,
  bpmMarkers: BpmMarker[],
  // Focused editor UI state (disables global shortcuts)
  editingMarker: unknown,
  showMetaModal: boolean,
  showCustomSnapModal: boolean,
  showDeleteConfirm: boolean,
  showLeaveConfirm: boolean,
  showSaveAsModal: boolean,
  showOffsetToolbar: boolean,
  validationErrorsCount: number,
) {
  const mode = useEditorStore((s) => s.mode);
  const setMode = useEditorStore((s) => s.setMode);
  const addToast = useEditorStore((s) => s.addToast);
  const chart = useEditorStore((s) => s.chart);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Disable shortcuts while focused editor UI is open.
      if (editingMarker || showMetaModal || showCustomSnapModal || showDeleteConfirm || showLeaveConfirm || showSaveAsModal || showOffsetToolbar || validationErrorsCount > 0) return;

      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        const state = useEditorStore.getState();
        if (e.shiftKey) {
          if (state.historyFuture.length > 0) {
            state.redo();
            addToast('Redo', 'info');
          }
        } else if (state.historyPast.length > 0) {
          state.undo();
          addToast('Undo', 'info');
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        const state = useEditorStore.getState();
        if (state.historyFuture.length > 0) {
          state.redo();
          addToast('Redo', 'info');
        }
        return;
      }

      // Select mode: Ctrl+C / Ctrl+X / Ctrl+V
      if (mode === 'select' && selectModeRef.current && (e.ctrlKey || e.metaKey)) {
        if (e.key === 'c' || e.key === 'C') {
          e.preventDefault();
          const count = selectModeRef.current.copy();
          if (count > 0) addToast(`${count}개 노트 복사됨`, 'info');
          else addToast('복사할 노트를 선택하세요', 'warn');
          return;
        }
        if (e.key === 'x' || e.key === 'X') {
          e.preventDefault();
          const count = selectModeRef.current.cut();
          if (count > 0) addToast(`${count}개 노트 잘라냄`, 'info');
          else addToast('잘라낼 노트를 선택하세요', 'warn');
          return;
        }
        if (e.key === 'v' || e.key === 'V') {
          e.preventDefault();
          if (!selectModeRef.current.hasClipboard) return;
          const cursorTimeMs = useEditorStore.getState().currentTimeMs;
          const beatFloat = msToBeat(cursorTimeMs, bpmMarkers, chart.meta.offsetMs);
          const sd = snapZoomRef.current?.snapDivision ?? 4;
          const grid = 4 / sd;
          const k = Math.round(beatFloat / grid);
          const targetBeat = { n: k * 4, d: sd };
          const count = selectModeRef.current.paste(targetBeat);
          if (count > 0) addToast(`${count}개 노트 붙여넣기 — Enter로 확정, Esc로 취소`, 'info');
          return;
        }
      }

      // 모드 단축키
      if (e.key === 'c' || e.key === 'C') {
        if (!e.ctrlKey && !e.metaKey) { setMode('create'); return; }
      }
      if (e.key === 's' || e.key === 'S') {
        if (!e.ctrlKey && !e.metaKey) { setMode('select'); return; }
      }
      if (e.key === 'd' || e.key === 'D') {
        if (!e.ctrlKey && !e.metaKey) { setMode('delete'); return; }
      }

      // 스페이스: 재생/정지
      if (e.key === ' ') {
        e.preventDefault();
        playbackRef.current?.togglePlay();
        return;
      }

      // G: 정밀도 면제 토글 — 포인트 노트는 grace, 싱글 롱노트는 hold-only
      if ((e.key === 'g' || e.key === 'G') && !e.ctrlKey && !e.metaKey) {
        const state = useEditorStore.getState();
        const selected = state.selectedNotes;
        const currentChart = state.chart;
        if (selected.size > 0 && currentChart) {
          e.preventDefault();
          const newNotes = [...currentChart.notes];
          let toggled = 0;
          for (const idx of selected) {
            const note = newNotes[idx];
            if (note && !('endBeat' in note)) {
              const pn = { ...note } as import('../../shared').PointNote;
              pn.grace = !pn.grace;
              if (!pn.grace) delete pn.grace;
              newNotes[idx] = pn;
              toggled++;
            } else if (note && 'endBeat' in note && note.type === 'long') {
              // 싱글 롱노트: hold-only 토글 (grace와 동일한 G 조작)
              const rn = { ...note } as import('../../shared').RangeNote;
              rn.holdOnly = !rn.holdOnly;
              if (!rn.holdOnly) delete rn.holdOnly;
              newNotes[idx] = rn;
              toggled++;
            }
          }
          if (toggled > 0) {
            state.setChart({ ...currentChart, notes: newNotes });
            addToast(`Grace/hold-only 토글: ${toggled}개 노트`, 'info');
          }
          return;
        }
      }

      // Delete/Backspace: 선택 노트 삭제 (모드 무관)
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectModeRef.current) {
        e.preventDefault();
        if (selectModeRef.current.isPendingPaste) {
          selectModeRef.current.cancelPaste();
        } else {
          selectModeRef.current.deleteSelected();
        }
        return;
      }

      // Select 모드 전용 단축키
      if (mode === 'select' && selectModeRef.current) {
        const isPaste = selectModeRef.current.isPendingPaste;

        if (e.key === 'Escape' && isPaste) {
          e.preventDefault();
          selectModeRef.current.cancelPaste();
          return;
        }

        if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (isPaste) selectModeRef.current.movePasteBySnap('up');
          else if (e.shiftKey) selectModeRef.current.resizeEndBySnap('up');
          else selectModeRef.current.moveBySnap('up');
          return;
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (isPaste) selectModeRef.current.movePasteBySnap('down');
          else if (e.shiftKey) selectModeRef.current.resizeEndBySnap('down');
          else selectModeRef.current.moveBySnap('down');
          return;
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          if (isPaste) selectModeRef.current.movePasteByLane('left');
          else selectModeRef.current.moveByLane('left');
          return;
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          if (isPaste) selectModeRef.current.movePasteByLane('right');
          else selectModeRef.current.moveByLane('right');
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          selectModeRef.current.confirmPlacement();
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    mode, setMode,
    editingMarker, showMetaModal, showCustomSnapModal, showDeleteConfirm, showLeaveConfirm, showSaveAsModal, showOffsetToolbar, validationErrorsCount,
    addToast, bpmMarkers, chart.meta.offsetMs,
    playbackRef, selectModeRef, snapZoomRef,
  ]);
}
