import { useEffect, useState } from 'react';
import type { ChartDocument, ChartEvent } from '../../shared';
import type { EditingEvent } from '../stores';
import { PAUSE_TO_EDIT_COPY } from '../editorCopy';
import { modalStyles } from './modalStyles';

// ---------------------------------------------------------------------------
// Type-specific field renderers
// ---------------------------------------------------------------------------

function getEventTypeLabel(evt: ChartEvent): string {
  switch (evt.type) {
    case 'bpm': return 'BPM Change';
    case 'timeSignature': return 'Time Signature Change';
    case 'text': return 'Text';
    case 'auto': return 'Auto Section';
    case 'stop': return 'Stop Zone';
    case 'tutorialInput': return 'Tutorial Input';
    case 'tutorialDiagram': return 'Tutorial Diagram';
  }
}

function getInitialValues(evt: ChartEvent): Record<string, string> {
  switch (evt.type) {
    case 'bpm':
      return { eventBpm: String(evt.bpm) };
    case 'timeSignature':
      return { tsNumerator: String(evt.beatPerMeasure.n), tsDenominator: String(evt.beatPerMeasure.d) };
    case 'text':
      return { text: evt.text };
    case 'tutorialInput':
      return {
        inputLane: String(evt.lane),
        keyCode: evt.keyCode,
        keyLabel: evt.keyLabel ?? '',
      };
    case 'tutorialDiagram':
      return { diagramId: evt.diagramId };
    case 'auto':
    case 'stop':
      return {};
  }
}

function EventFields({ evt, values, setValues }: {
  evt: ChartEvent;
  values: Record<string, string>;
  setValues: (v: Record<string, string>) => void;
}) {
  switch (evt.type) {
    case 'bpm':
      return (
        <label style={modalStyles.field}>
          <span>BPM</span>
          <input
            style={modalStyles.input}
            type="number"
            value={values.eventBpm}
            onChange={(e) => setValues({ ...values, eventBpm: e.target.value })}
            autoFocus
          />
        </label>
      );
    case 'timeSignature':
      return (
        <div style={{ display: 'flex', gap: '8px' }}>
          <label style={modalStyles.field}>
            <span>Numerator</span>
            <input
              style={modalStyles.input}
              type="number"
              min="1"
              step="1"
              value={values.tsNumerator}
              onChange={(e) => setValues({ ...values, tsNumerator: e.target.value })}
              autoFocus
            />
          </label>
          <label style={modalStyles.field}>
            <span>Denominator</span>
            <input
              style={modalStyles.input}
              type="number"
              min="1"
              step="1"
              value={values.tsDenominator}
              onChange={(e) => setValues({ ...values, tsDenominator: e.target.value })}
            />
          </label>
        </div>
      );
    case 'text':
      return (
        <label style={modalStyles.field}>
          <span>Text</span>
          <input
            style={modalStyles.input}
            type="text"
            value={values.text}
            onChange={(e) => setValues({ ...values, text: e.target.value })}
            autoFocus
          />
        </label>
      );
    case 'auto':
      return (
        <div style={{ padding: '8px 0', color: '#aaa', fontSize: '13px' }}>
          Auto Section (no editable fields)
        </div>
      );
    case 'stop':
      return (
        <div style={{ padding: '8px 0', color: '#aaa', fontSize: '13px' }}>
          Stop Zone (no editable fields)
        </div>
      );
    case 'tutorialInput':
      return (
        <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 1fr', gap: '8px' }}>
          <label style={modalStyles.field}>
            <span>Lane</span>
            <select
              style={modalStyles.input}
              value={values.inputLane}
              onChange={(e) => setValues({ ...values, inputLane: e.target.value })}
              autoFocus
            >
              <option value="1">L1</option>
              <option value="2">L2</option>
              <option value="3">L3</option>
              <option value="4">L4</option>
            </select>
          </label>
          <label style={modalStyles.field}>
            <span>Key Code</span>
            <input
              style={modalStyles.input}
              type="text"
              value={values.keyCode}
              onChange={(e) => setValues({ ...values, keyCode: e.target.value })}
              placeholder="KeyD"
            />
          </label>
          <label style={modalStyles.field}>
            <span>Label</span>
            <input
              style={modalStyles.input}
              type="text"
              value={values.keyLabel}
              onChange={(e) => setValues({ ...values, keyLabel: e.target.value })}
              placeholder="D"
            />
          </label>
        </div>
      );
    case 'tutorialDiagram':
      return (
        <label style={modalStyles.field}>
          <span>Diagram</span>
          <select
            style={modalStyles.input}
            value={values.diagramId}
            onChange={(e) => setValues({ ...values, diagramId: e.target.value })}
            autoFocus
          >
            <option value="connected-switch">Connected switch</option>
            <option value="connected-overlap">Connected overlap</option>
          </select>
        </label>
      );
  }
}

// ---------------------------------------------------------------------------
// Event Edit Modal
// ---------------------------------------------------------------------------

export interface EventEditModalProps {
  editingEvent: NonNullable<EditingEvent>;
  chart: ChartDocument;
  /** 0박 초기 BPM·박자다. 값만 편집하고 삭제는 막는다. 보조 레인은 BPM 1·박자 2로 고정이라 고를 수 없다(RFD 0082). */
  isBeatZero: boolean;
  /** 에디터가 재생 중이다. 값 입력·Save·Delete를 비활성으로 두고 Cancel만 쓴다(RFD 0099). */
  editLocked?: boolean;
  onSave: (values: Record<string, string>) => void;
  onDelete: () => void;
  onClose: () => void;
}

/** 값 입력 묶음. 잠기면 안의 입력을 한꺼번에 비활성으로 두며 모양은 바꾸지 않는다. */
const fieldsetStyle = { border: 0, padding: 0, margin: 0, minWidth: 0 } as const;

export function EventEditModal({ editingEvent, chart, isBeatZero, editLocked = false, onSave, onDelete, onClose }: EventEditModalProps) {
  const evt = chart.events[editingEvent.index];
  const [values, setValues] = useState<Record<string, string>>(() => (evt ? getInitialValues(evt) : {}));

  useEffect(() => {
    if (!evt) onClose();
  }, [evt, onClose]);

  if (!evt) return null;

  const title = `Edit ${getEventTypeLabel(evt)} Event`;

  return (
    <div style={modalStyles.overlay} onMouseDown={onClose}>
      <div style={modalStyles.modal} onMouseDown={(e) => e.stopPropagation()}>
        <h3 style={modalStyles.title}>{title}</h3>

        <fieldset style={fieldsetStyle} disabled={editLocked} title={editLocked ? PAUSE_TO_EDIT_COPY : undefined}>
          <EventFields evt={evt} values={values} setValues={setValues} />
        </fieldset>

        <div style={modalStyles.buttons}>
          <button
            style={{ ...modalStyles.saveBtn, opacity: editLocked ? 0.4 : 1 }}
            onClick={() => onSave(values)}
            disabled={editLocked}
            title={editLocked ? PAUSE_TO_EDIT_COPY : undefined}
          >
            Save
          </button>
          <button
            style={{ ...modalStyles.deleteBtn, opacity: isBeatZero || editLocked ? 0.4 : 1 }}
            onClick={onDelete}
            disabled={isBeatZero || editLocked}
            title={editLocked ? PAUSE_TO_EDIT_COPY : isBeatZero ? 'Cannot delete initial event' : 'Delete event'}
          >
            Delete
          </button>
          <button style={modalStyles.cancelBtn} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
