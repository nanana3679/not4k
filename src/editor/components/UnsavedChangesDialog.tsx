/**
 * 미저장 변경 확인 창(RFD 0098). 곡 정보 드로어 닫기·다른 차트 전환의 곡 정보 확인(저장·변경 취소·취소)과
 * 에디터 이탈·이동 확인(저장 후 이동·버리고 이동·취소)을 같은 모양으로 그린다. 선택에 따른 동작은 unsavedChangesFlow가 정한다.
 */
import { LEAVE_CONFIRM_COPY, PAUSE_TO_EDIT_COPY, SONG_INFO_UNSAVED_COPY } from '../editorCopy';
import type { LeaveDecision, SongInfoDecision } from '../unsavedChangesFlow';
import { modalStyles } from './modalStyles';

export type UnsavedChangesDialogRequest =
  | { kind: 'songInfo'; purpose: 'close' | 'switch' }
  | { kind: 'leave'; purpose: 'leave' | 'switch' };

interface UnsavedChangesDialogProps {
  request: UnsavedChangesDialogRequest;
  /** 재생 중이라 곡 정보 변경 취소가 오프셋·BPM·박자표를 되돌릴 수 없다(RFD 0099). 변경 취소 버튼만 비활성이다. */
  discardLocked?: boolean;
  onChoose: (decision: SongInfoDecision & LeaveDecision) => void;
}

const TITLE_ID = 'unsaved-changes-dialog-title';

function copyOf(request: UnsavedChangesDialogRequest) {
  if (request.kind === 'leave') {
    return { title: LEAVE_CONFIRM_COPY.title, body: LEAVE_CONFIRM_COPY.body, note: null,
      save: LEAVE_CONFIRM_COPY.save, discard: LEAVE_CONFIRM_COPY.discard, cancel: LEAVE_CONFIRM_COPY.cancel };
  }
  const closing = request.purpose === 'close';
  return {
    title: SONG_INFO_UNSAVED_COPY.title,
    body: closing ? SONG_INFO_UNSAVED_COPY.closeBody : SONG_INFO_UNSAVED_COPY.switchBody,
    note: SONG_INFO_UNSAVED_COPY.discardNote,
    save: closing ? SONG_INFO_UNSAVED_COPY.saveClose : SONG_INFO_UNSAVED_COPY.saveSwitch,
    discard: closing ? SONG_INFO_UNSAVED_COPY.discardClose : SONG_INFO_UNSAVED_COPY.discardSwitch,
    cancel: SONG_INFO_UNSAVED_COPY.cancel,
  };
}

export function UnsavedChangesDialog({ request, discardLocked = false, onChoose }: UnsavedChangesDialogProps) {
  const copy = copyOf(request);
  return (
    <div style={modalStyles.overlay} onMouseDown={() => onChoose('cancel')}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        style={{ ...modalStyles.modal, maxWidth: '440px' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3 id={TITLE_ID} style={modalStyles.title}>{copy.title}</h3>
        <p style={{ fontSize: '14px', margin: '0 0 8px', color: '#ccc', lineHeight: 1.5, wordBreak: 'keep-all' }}>{copy.body}</p>
        {copy.note && (
          <p style={{ fontSize: '12px', margin: '0 0 8px', color: '#999', lineHeight: 1.5, wordBreak: 'keep-all' }}>{copy.note}</p>
        )}
        <div style={{ ...modalStyles.buttons, flexWrap: 'wrap' }}>
          <button type="button" style={modalStyles.saveBtn} onClick={() => onChoose('save')}>{copy.save}</button>
          <button
            type="button"
            style={discardLocked ? { ...modalStyles.deleteBtn, opacity: 0.5, cursor: 'not-allowed' } : modalStyles.deleteBtn}
            onClick={() => onChoose('discard')}
            disabled={discardLocked}
            title={discardLocked ? PAUSE_TO_EDIT_COPY : undefined}
          >
            {copy.discard}
          </button>
          <button type="button" style={modalStyles.cancelBtn} onClick={() => onChoose('cancel')}>{copy.cancel}</button>
        </div>
      </div>
    </div>
  );
}
