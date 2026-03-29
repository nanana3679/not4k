import { useState } from 'react';
import type { Chart, ChartEvent } from '../../shared';
import type { EditingMarker } from '../stores';
import { modalStyles } from './modalStyles';

// ---------------------------------------------------------------------------
// Type-specific field renderers
// ---------------------------------------------------------------------------

function getEventTypeLabel(evt: ChartEvent): string {
  switch (evt.type) {
    case 'bpm': return 'BPM';
    case 'timeSignature': return 'Time Signature';
    case 'text': return 'Text';
    case 'auto': return 'Auto Section';
    case 'stop': return 'Stop Zone';
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
  }
}

// ---------------------------------------------------------------------------
// Marker Edit Modal
// ---------------------------------------------------------------------------

export interface MarkerEditModalProps {
  editingMarker: NonNullable<EditingMarker>;
  chart: Chart;
  isBeatZero: boolean;
  onSave: (values: Record<string, string>) => void;
  onDelete: () => void;
  onClose: () => void;
}

export function MarkerEditModal({ editingMarker, chart, isBeatZero, onSave, onDelete, onClose }: MarkerEditModalProps) {
  const evt = chart.events[editingMarker.index];

  const [values, setValues] = useState<Record<string, string>>(() => getInitialValues(evt));

  const title = `Edit ${getEventTypeLabel(evt)} Event`;

  return (
    <div style={modalStyles.overlay} onMouseDown={onClose}>
      <div style={modalStyles.modal} onMouseDown={(e) => e.stopPropagation()}>
        <h3 style={modalStyles.title}>{title}</h3>

        <EventFields evt={evt} values={values} setValues={setValues} />

        <div style={modalStyles.buttons}>
          <button style={modalStyles.saveBtn} onClick={() => onSave(values)}>Save</button>
          <button
            style={{ ...modalStyles.deleteBtn, opacity: isBeatZero ? 0.4 : 1 }}
            onClick={onDelete}
            disabled={isBeatZero}
            title={isBeatZero ? 'Cannot delete first marker' : 'Delete marker'}
          >
            Delete
          </button>
          <button style={modalStyles.cancelBtn} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
