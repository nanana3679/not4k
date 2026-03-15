import { useState } from 'react';
import type { Chart } from '../../shared';
import type { EditingMarker } from '../stores';
import { modalStyles } from './modalStyles';

// ---------------------------------------------------------------------------
// Event Tab Fields (BPM / TimeSig / Message tabs)
// ---------------------------------------------------------------------------

type EventTab = 'message' | 'bpm' | 'timeSig' | 'stop';

export function EventTabFields({ values, setValues }: {
  values: Record<string, string>;
  setValues: (v: Record<string, string>) => void;
}) {
  const [activeTab, setActiveTab] = useState<EventTab>('message');

  const hasMessage = !!values.text;
  const hasBpm = !!values.eventBpm;
  const hasTimeSig = !!values.tsNumerator || !!values.tsDenominator;
  const hasStop = values.stop === 'true';

  const tabs: { key: EventTab; label: string; hasValue: boolean }[] = [
    { key: 'message', label: 'Message', hasValue: hasMessage },
    { key: 'bpm', label: 'BPM', hasValue: hasBpm },
    { key: 'timeSig', label: 'TimeSig', hasValue: hasTimeSig },
    { key: 'stop', label: 'Stop', hasValue: hasStop },
  ];

  return (
    <>
      <div style={eventTabStyles.tabBar}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            style={{
              ...eventTabStyles.tab,
              ...(activeTab === tab.key ? eventTabStyles.tabActive : {}),
              ...(tab.hasValue && activeTab !== tab.key ? eventTabStyles.tabFilled : {}),
            }}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.hasValue && <span style={eventTabStyles.dot} />}
            {tab.label}
          </button>
        ))}
      </div>

      <div style={eventTabStyles.tabContent}>
        {activeTab === 'message' && (
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
        )}

        {activeTab === 'bpm' && (
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
        )}

        {activeTab === 'timeSig' && (
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
        )}

        {activeTab === 'stop' && (
          <label style={{ ...modalStyles.field, flexDirection: 'row', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={values.stop === 'true'}
              onChange={(e) => setValues({ ...values, stop: e.target.checked ? 'true' : 'false' })}
              style={{ width: '16px', height: '16px', accentColor: '#4488ff' }}
            />
            <span>Stop (구간 내 싱글/더블/롱노트 배치 금지)</span>
          </label>
        )}
      </div>
    </>
  );
}

export const eventTabStyles = {
  tabBar: {
    display: 'flex',
    gap: '4px',
    marginBottom: '12px',
    borderBottom: '1px solid #444',
    paddingBottom: '8px',
  },
  tab: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    padding: '5px 12px',
    backgroundColor: '#333',
    color: '#888',
    border: '1px solid #444',
    borderRadius: '4px 4px 0 0',
    cursor: 'pointer',
    fontSize: '12px',
    transition: 'background-color 0.15s',
  } as React.CSSProperties,
  tabActive: {
    backgroundColor: '#4488ff',
    color: '#fff',
    borderColor: '#4488ff',
  },
  tabFilled: {
    color: '#ccc',
    borderColor: '#668',
    backgroundColor: '#3a3a4a',
  },
  dot: {
    display: 'inline-block',
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: '#6cf',
    flexShrink: 0,
  } as React.CSSProperties,
  tabContent: {
    minHeight: '60px',
  },
};

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
  const getInitialValues = (): Record<string, string> => {
    const evt = chart.events[editingMarker.index];
    return {
      text: evt?.text ?? '',
      eventBpm: evt?.bpm !== undefined ? String(evt.bpm) : '',
      tsNumerator: evt?.beatPerMeasure !== undefined ? String(evt.beatPerMeasure.n) : '',
      tsDenominator: evt?.beatPerMeasure !== undefined ? String(evt.beatPerMeasure.d) : '',
      stop: evt?.stop ? 'true' : 'false',
    };
  };

  const [values, setValues] = useState<Record<string, string>>(getInitialValues);

  const title = 'Edit Event';

  return (
    <div style={modalStyles.overlay} onMouseDown={onClose}>
      <div style={modalStyles.modal} onMouseDown={(e) => e.stopPropagation()}>
        <h3 style={modalStyles.title}>{title}</h3>

        <EventTabFields values={values} setValues={setValues} />

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
