/**
 * useEditorKeyboard — 키보드 단축키 처리
 */

import { useEffect } from 'react';
import { toggleNoteGrace } from '../editing/noteProperties';
import type { RefObject } from 'react';
import type { PlaybackController } from '../playback/PlaybackController';
import type { SelectMode } from '../modes';
import { msToBeat } from '../../shared';
import type { BpmChange } from '../../shared';
import type { ToastType } from '../../shared/toast';
import { selectCanRedo, selectCanUndo, useEditorStore, type EditorModeName } from '../stores';

/** 단축키 처리가 읽는 키 입력 사실. 테스트는 이 필드만 채운 객체를 넘긴다. */
export type EditorKeyEvent = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'preventDefault'>;

/** 단축키 처리가 쓰는 화면 상태와 명령. 차트·선택·history는 store에서 직접 읽는다. */
export interface EditorKeyboardContext {
  mode: EditorModeName;
  selectMode: SelectMode | null;
  playback: PlaybackController | null;
  bpmChanges: BpmChange[];
  offsetMs: number;
  /** 모달·이벤트 편집처럼 포커스를 가진 UI가 열려 전역 단축키를 막는다. */
  shortcutsBlocked: boolean;
  setMode: (mode: EditorModeName) => void;
  addToast: (message: string, type?: ToastType) => void;
}

/** 에디터 전역 keydown 한 번을 처리한다. */
export function handleEditorKeyDown(e: EditorKeyEvent, context: EditorKeyboardContext): void {
  const { mode, selectMode, playback, bpmChanges, offsetMs, shortcutsBlocked, setMode, addToast } = context;
  // Disable shortcuts while focused editor UI is open.
  if (shortcutsBlocked) return;

  // 누른 채 들어온 독립 명령은 삭제를 먼저 확정한다. 뒤늦은 Esc는 그 명령을 취소하지 않는다.
  const key = e.key.toLowerCase();
  if (useEditorStore.getState().editTransaction?.kind === 'erase'
    && (((e.ctrlKey || e.metaKey) && ['z', 'y', 'a', 'c', 'x', 'v'].includes(key))
      || ['c', 's', 'd', 'g', 'delete', 'backspace', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key))) {
    useEditorStore.getState().commitEditTransaction();
  }

  // undo·redo는 열린 transaction을 먼저 확정하므로 그 안의 첫 편집도 되돌릴 수 있다.
  if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
    e.preventDefault();
    const state = useEditorStore.getState();
    if (e.shiftKey) {
      if (selectCanRedo(state)) {
        state.redo();
        addToast('Redo', 'info');
      }
    } else if (selectCanUndo(state)) {
      state.undo();
      addToast('Undo', 'info');
    }
    return;
  }

  if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
    e.preventDefault();
    const state = useEditorStore.getState();
    if (selectCanRedo(state)) {
      state.redo();
      addToast('Redo', 'info');
    }
    return;
  }

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && mode === 'select') {
    e.preventDefault();
    selectMode?.selectAll();
    return;
  }

  // Select mode: Ctrl+C / Ctrl+X / Ctrl+V
  if (mode === 'select' && selectMode && (e.ctrlKey || e.metaKey)) {
    if (e.key === 'c' || e.key === 'C') {
      e.preventDefault();
      const count = selectMode.copy();
      if (count > 0) addToast(`${count}개 항목 복사됨`, 'info');
      else addToast('복사할 항목을 선택하세요', 'warn');
      return;
    }
    if (e.key === 'x' || e.key === 'X') {
      e.preventDefault();
      const count = selectMode.cut();
      if (count > 0) addToast(`${count}개 항목 잘라냄`, 'info');
      else addToast('잘라낼 수 있는 항목이 없습니다', 'warn');
      return;
    }
    if (e.key === 'v' || e.key === 'V') {
      e.preventDefault();
      if (!selectMode.hasClipboard) return;
      const cursorTimeMs = useEditorStore.getState().currentTimeMs;
      const beatFloat = msToBeat(cursorTimeMs, bpmChanges, offsetMs);
      const sd = useEditorStore.getState().snapDivision;
      const grid = 4 / sd;
      const k = Math.round(beatFloat / grid);
      const targetBeat = { n: k * 4, d: sd };
      const count = selectMode.paste(targetBeat);
      if (count > 0) addToast(`${count}개 항목 붙여넣기 — Enter로 확정, Esc로 취소`, 'info');
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
    playback?.togglePlay();
    return;
  }

  // G: 정밀도 면제 토글 — 포인트 노트는 grace, 싱글 롱노트는 hold-only
  if ((e.key === 'g' || e.key === 'G') && !e.ctrlKey && !e.metaKey) {
    const state = useEditorStore.getState();
    const selected = state.selection.notes;
    const currentChart = state.chart;
    if (selected.size > 0 && currentChart) {
      e.preventDefault();
      const newNotes = [...currentChart.notes];
      let toggled = 0;
      for (const idx of selected) {
        const note = newNotes[idx];
        const updated = note && toggleNoteGrace(note);
        if (updated) {
          newNotes[idx] = updated;
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
  if ((e.key === 'Delete' || e.key === 'Backspace') && selectMode) {
    e.preventDefault();
    if (selectMode.isPendingPaste) {
      selectMode.cancelPaste();
    } else {
      selectMode.deleteSelected();
    }
    return;
  }

  // Select 모드 전용 단축키
  if (mode === 'select' && selectMode) {
    const isPaste = selectMode.isPendingPaste;

    if (e.key === 'Escape' && isPaste) {
      e.preventDefault();
      selectMode.cancelPaste();
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      selectMode.cancel();
      useEditorStore.getState().clearSelection();
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (isPaste) selectMode.movePasteBySnap('up');
      else if (e.shiftKey) selectMode.resizeEndBySnap('up');
      else selectMode.moveBySnap('up');
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (isPaste) selectMode.movePasteBySnap('down');
      else if (e.shiftKey) selectMode.resizeEndBySnap('down');
      else selectMode.moveBySnap('down');
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (isPaste) selectMode.movePasteByLane('left');
      else selectMode.moveByLane('left');
      return;
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (isPaste) selectMode.movePasteByLane('right');
      else selectMode.moveByLane('right');
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      selectMode.confirmPlacement();
      return;
    }
  }
}

export function useEditorKeyboard(
  playbackRef: RefObject<PlaybackController | null>,
  selectModeRef: RefObject<SelectMode | null>,
  bpmChanges: BpmChange[],
  // Focused editor UI state (disables global shortcuts)
  editingEvent: unknown,
  showMetaModal: boolean,
  showCustomSnapModal: boolean,
  showDeleteConfirm: boolean,
  showLeaveConfirm: boolean,
  showSaveAsModal: boolean,
  showOffsetToolbar: boolean,
  validationErrorsCount: number,
  showLegacyConversionModal: boolean,
) {
  const mode = useEditorStore((s) => s.mode);
  const setMode = useEditorStore((s) => s.setMode);
  const addToast = useEditorStore((s) => s.addToast);
  const chart = useEditorStore((s) => s.chart);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => handleEditorKeyDown(e, {
      mode,
      selectMode: selectModeRef.current,
      playback: playbackRef.current,
      bpmChanges,
      offsetMs: chart.meta.offsetMs,
      shortcutsBlocked: Boolean(editingEvent) || showMetaModal || showCustomSnapModal || showDeleteConfirm
        || showLeaveConfirm || showSaveAsModal || showOffsetToolbar || validationErrorsCount > 0 || showLegacyConversionModal,
      setMode,
      addToast,
    });

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    mode, setMode,
    editingEvent, showMetaModal, showCustomSnapModal, showDeleteConfirm, showLeaveConfirm, showSaveAsModal, showOffsetToolbar, validationErrorsCount,
    showLegacyConversionModal,
    addToast, bpmChanges, chart.meta.offsetMs,
    playbackRef, selectModeRef,
  ]);
}
