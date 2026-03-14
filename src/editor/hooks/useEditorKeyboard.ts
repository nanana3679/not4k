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
  // 모달 열림 상태 (단축키 비활성화 조건)
  editingMarker: unknown,
  showMetaModal: boolean,
  showCustomSnapModal: boolean,
  showDeleteConfirm: boolean,
  showLeaveConfirm: boolean,
  showSaveAsModal: boolean,
  validationErrorsCount: number,
) {
  const mode = useEditorStore((s) => s.mode);
  const setMode = useEditorStore((s) => s.setMode);
  const addToast = useEditorStore((s) => s.addToast);
  const chart = useEditorStore((s) => s.chart);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 모달이 열려 있으면 단축키 비활성화
      if (editingMarker || showMetaModal || showCustomSnapModal || showDeleteConfirm || showLeaveConfirm || showSaveAsModal || validationErrorsCount > 0) return;

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

      // G: grace 플래그 토글 (선택된 포인트 노트)
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
            }
          }
          if (toggled > 0) {
            state.setChart({ ...currentChart, notes: newNotes });
            addToast(`Grace 토글: ${toggled}개 노트`, 'info');
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
    editingMarker, showMetaModal, showCustomSnapModal, showDeleteConfirm, showLeaveConfirm, showSaveAsModal, validationErrorsCount,
    addToast, bpmMarkers, chart.meta.offsetMs,
  ]);
}
