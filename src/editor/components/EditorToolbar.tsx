/**
 * EditorToolbar — 에디터 상단 툴바 컴포넌트
 */

import { useState } from 'react';
import type { RefObject } from 'react';
import type { PlaybackController } from '../playback/PlaybackController';
import type { EntityType } from '../modes';
import { serializeChart, serializeExtraNotes } from '../../shared';
import { useEditorStore } from '../stores';
import { useGameStore } from '../../game/stores';

const styles = {
  buttonActive: {
    backgroundColor: '#4488ff',
    borderColor: '#4488ff',
  },
  label: {
    fontSize: '13px',
    marginLeft: '8px',
    whiteSpace: 'nowrap' as const,
  },
  offsetCompactToolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '3px',
    backgroundColor: '#242424',
    borderBottom: '1px solid #3d4b66',
    minHeight: '42px',
    overflowX: 'auto' as const,
    overflowY: 'hidden' as const,
    WebkitOverflowScrolling: 'touch' as const,
    flexShrink: 0,
  },
  offsetCompactInput: {
    width: '78px',
    minWidth: '78px',
    minHeight: '36px',
    padding: '4px 6px',
    backgroundColor: '#303030',
    color: '#ededed',
    border: '1px solid #626262',
    borderRadius: '6px',
    fontSize: '13px',
    textAlign: 'center' as const,
  },
  volumeSlider: {
    width: '60px',
    height: '4px',
    cursor: 'pointer',
    accentColor: '#4488ff',
  },
  compactToolbar: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
    padding: '5px 6px',
    backgroundColor: '#242424',
    borderBottom: '1px solid #333',
    flexShrink: 0,
  },
  compactTopRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    minHeight: '36px',
    flexWrap: 'nowrap' as const,
    overflowX: 'auto' as const,
    overflowY: 'visible' as const,
    WebkitOverflowScrolling: 'touch' as const,
    scrollbarWidth: 'none' as const,
  },
  compactGroup: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '2px',
    backgroundColor: '#2b2b2b',
    border: '1px solid #414141',
    borderRadius: '8px',
    flexShrink: 0,
  },
  compactButton: {
    minHeight: '36px',
    padding: '6px 10px',
    backgroundColor: '#343434',
    color: '#ededed',
    border: '1px solid #505050',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 600,
    whiteSpace: 'nowrap' as const,
    touchAction: 'manipulation' as const,
  },
  compactIconButton: {
    width: '36px',
    minWidth: '36px',
    height: '36px',
    padding: 0,
    boxSizing: 'border-box' as const,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  compactPrimaryButton: {
    backgroundColor: '#2f67d8',
    borderColor: '#4b7df0',
    color: '#fff',
  },
  compactPlayButton: {
    backgroundColor: '#2d6b3a',
    borderColor: '#3a8f4e',
    color: '#fff',
  },
  compactDangerButton: {
    color: '#ffb4a8',
  },
  compactButtonDisabled: {
    opacity: 0.42,
    cursor: 'not-allowed',
  },
  compactDirtyBadge: {
    position: 'absolute' as const,
    top: '5px',
    right: '5px',
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    backgroundColor: '#ffcc66',
    boxShadow: '0 0 0 2px #2f67d8',
    pointerEvents: 'none' as const,
  },
  compactMoreMenu: {
    position: 'fixed' as const,
    top: '48px',
    right: '8px',
    minWidth: '210px',
    maxWidth: 'calc(100vw - 16px)',
    padding: '8px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
    backgroundColor: '#262626',
    border: '1px solid #555',
    borderRadius: '8px',
    zIndex: 1000,
    boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
  },
  compactMenuButton: {
    minHeight: '40px',
    padding: '8px 10px',
    backgroundColor: '#343434',
    color: '#ededed',
    border: '1px solid #505050',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
    textAlign: 'left' as const,
  },
  compactMenuLabel: {
    fontSize: '12px',
    color: '#999',
  },
  compactVolumeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 4px',
  },
  compactPickerOverlay: {
    position: 'fixed' as const,
    inset: 0,
    zIndex: 1200,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '8px',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  compactPickerPanel: {
    width: '100%',
    maxWidth: '420px',
    maxHeight: '76vh',
    padding: '10px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
    backgroundColor: '#242424',
    border: '1px solid #555',
    borderRadius: '10px',
    boxShadow: '0 12px 28px rgba(0,0,0,0.45)',
    overflowY: 'auto' as const,
  },
  compactPickerHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  compactPickerTitle: {
    flex: 1,
    color: '#ededed',
    fontSize: '13px',
    fontWeight: 700,
  },
  compactPickerSection: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
  },
  compactPickerGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: '6px',
  },
  compactPickerOption: {
    minHeight: '44px',
    padding: '8px 6px',
    backgroundColor: '#343434',
    color: '#ededed',
    border: '1px solid #505050',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 650,
    textAlign: 'center' as const,
    touchAction: 'manipulation' as const,
  },
};

type ToolbarIconName = 'back' | 'play' | 'pause' | 'save' | 'more' | 'create' | 'select' | 'delete' | 'undo' | 'redo' | 'entity' | 'snap' | 'extra' | 'close';
type CompactPicker = 'entity' | 'snap' | 'extra';

function ToolbarIcon({ name }: { name: ToolbarIconName }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: false,
  };

  if (name === 'back') {
    return (
      <svg {...common}>
        <path d="M19 12H5" />
        <path d="M12 19l-7-7 7-7" />
      </svg>
    );
  }

  if (name === 'undo') {
    return (
      <svg {...common}>
        <path d="M9 14 4 9l5-5" />
        <path d="M4 9h10a6 6 0 0 1 0 12h-2" />
      </svg>
    );
  }

  if (name === 'redo') {
    return (
      <svg {...common}>
        <path d="m15 14 5-5-5-5" />
        <path d="M20 9H10a6 6 0 0 0 0 12h2" />
      </svg>
    );
  }

  if (name === 'play') {
    return (
      <svg {...common}>
        <path d="M8 5v14l11-7Z" />
      </svg>
    );
  }

  if (name === 'pause') {
    return (
      <svg {...common}>
        <path d="M8 5v14" />
        <path d="M16 5v14" />
      </svg>
    );
  }

  if (name === 'save') {
    return (
      <svg {...common}>
        <path d="M5 3h12l2 2v16H5Z" />
        <path d="M8 3v6h8V3" />
        <path d="M8 21v-7h8v7" />
      </svg>
    );
  }

  if (name === 'create') {
    return (
      <svg {...common}>
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </svg>
    );
  }

  if (name === 'select') {
    return (
      <svg {...common}>
        <path d="m5 3 7 17 2-7 7-2Z" />
        <path d="m13 13 5 5" />
      </svg>
    );
  }

  if (name === 'delete') {
    return (
      <svg {...common}>
        <path d="M3 6h18" />
        <path d="M8 6V4h8v2" />
        <path d="M6 6l1 15h10l1-15" />
        <path d="M10 11v6" />
        <path d="M14 11v6" />
      </svg>
    );
  }

  if (name === 'entity') {
    return (
      <svg {...common}>
        <path d="M7 17a5 5 0 0 1 10 0" />
        <path d="M7 7h10" />
        <path d="M7 7v10" />
        <path d="M17 7v10" />
        <path d="M12 7v10" />
      </svg>
    );
  }

  if (name === 'snap') {
    return (
      <svg {...common}>
        <path d="M4 6h16" />
        <path d="M4 12h16" />
        <path d="M4 18h16" />
        <path d="M8 4v16" />
        <path d="M16 4v16" />
      </svg>
    );
  }

  if (name === 'extra') {
    return (
      <svg {...common}>
        <path d="M5 4v16" />
        <path d="M10 4v16" />
        <path d="M15 4v16" />
        <path d="M20 4v16" />
      </svg>
    );
  }

  if (name === 'close') {
    return (
      <svg {...common}>
        <path d="M18 6 6 18" />
        <path d="m6 6 12 12" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="M12 12h.01" />
      <path d="M19 12h.01" />
      <path d="M5 12h.01" />
    </svg>
  );
}

interface EditorToolbarProps {
  playbackRef: RefObject<PlaybackController | null>;
  autoScroll: boolean;
  setAutoScroll: (v: boolean) => void;
  showOffsetToolbar: boolean;
  setShowOffsetToolbar: (v: boolean | ((prev: boolean) => boolean)) => void;
  saving: boolean;
  deleting: boolean;
  savedChartSnapshot: string;
  savedExtraSnapshot: string;
  pendingPreviewRange: { startTime: number; endTime: number } | null;
  onSaveChart: () => void;
  onSaveAs: () => void;
  onDeleteChart: () => void;
  onDeleteSelected: () => void;
  onOpenMeta: () => void;
  onOpenCustomSnap: () => void;
}

const compactNoteTypeOptions: EntityType[] = ['single', 'double', 'trillZone'];
const eventTypeOptions: EntityType[] = ['bpm', 'timeSignature', 'text', 'auto', 'stop'];
const standardSnapOptions = [4, 8, 16, 32, 3, 6, 12, 24, 48];
const extraLaneOptions = [2, 3, 4, 5, 6, 7, 8, 9, 10];

const entityLabels: Record<EntityType, string> = {
  single: 'Single',
  double: 'Double',
  long: 'Long',
  doubleLong: 'D.Long',
  trillZone: 'Trill',
  bpm: 'BPM',
  timeSignature: 'Time',
  text: 'Text',
  auto: 'Auto',
  stop: 'Stop',
};

export function EditorToolbar({
  playbackRef,
  autoScroll,
  setAutoScroll,
  showOffsetToolbar,
  setShowOffsetToolbar,
  saving,
  deleting,
  savedChartSnapshot,
  savedExtraSnapshot,
  pendingPreviewRange,
  onSaveChart,
  onSaveAs,
  onDeleteChart,
  onDeleteSelected,
  onOpenMeta,
  onOpenCustomSnap,
}: EditorToolbarProps) {
  const masterVolume = useGameStore((s) => s.settings.masterVolume ?? 1);
  const updateSettings = useGameStore((s) => s.updateSettings);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [compactPicker, setCompactPicker] = useState<CompactPicker | null>(null);

  const mode = useEditorStore((s) => s.mode);
  const setMode = useEditorStore((s) => s.setMode);
  const entityType = useEditorStore((s) => s.entityType);
  const setEntityType = useEditorStore((s) => s.setEntityType);
  const snapDivision = useEditorStore((s) => s.snapDivision);
  const setSnapDivision = useEditorStore((s) => s.setSnapDivision);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const chart = useEditorStore((s) => s.chart);
  const setChart = useEditorStore((s) => s.setChart);
  const extraNotes = useEditorStore((s) => s.extraNotes);
  const extraLaneCount = useEditorStore((s) => s.extraLaneCount);
  const setExtraLaneCount = useEditorStore((s) => s.setExtraLaneCount);
  const setSelectedExtraNotes = useEditorStore((s) => s.setSelectedExtraNotes);
  const activeSongId = useEditorStore((s) => s.activeSongId);
  const selectedNotes = useEditorStore((s) => s.selectedNotes);
  const selectedExtraNotes = useEditorStore((s) => s.selectedExtraNotes);
  const historyPastCount = useEditorStore((s) => s.historyPast.length);
  const historyFutureCount = useEditorStore((s) => s.historyFuture.length);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const addToast = useEditorStore((s) => s.addToast);
  const selectedCount = selectedNotes.size + selectedExtraNotes.size;
  const [offsetDraft, setOffsetDraft] = useState(String(chart.meta.offsetMs));

  const isDirty = !!(savedChartSnapshot && (
    serializeChart(chart) !== savedChartSnapshot ||
    serializeExtraNotes(extraNotes, extraLaneCount) !== savedExtraSnapshot
  )) || pendingPreviewRange != null;

  const compactIconStyle = {
    ...styles.compactButton,
    ...styles.compactIconButton,
  };

  const getIconButtonStyle = (active = false, disabled = false) => ({
    ...compactIconStyle,
    ...(active ? styles.buttonActive : {}),
    ...(disabled ? styles.compactButtonDisabled : {}),
  });

  const runUndo = () => {
    if (historyPastCount === 0) return;
    undo();
    addToast('Undo', 'info');
  };

  const runRedo = () => {
    if (historyFutureCount === 0) return;
    redo();
    addToast('Redo', 'info');
  };

  const requestBackToSongs = () => {
    if (isDirty) {
      window.dispatchEvent(new CustomEvent('editor:requestLeave'));
    } else {
      window.location.href = '/game';
    }
  };

  const applyOffset = (offsetMs: number) => {
    const currentChart = useEditorStore.getState().chart;
    setOffsetDraft(String(offsetMs));
    if (currentChart.meta.offsetMs === offsetMs) return;
    setChart({ ...currentChart, meta: { ...currentChart.meta, offsetMs } });
  };

  const commitOffsetDraft = () => {
    const parsed = parseFloat(offsetDraft);
    if (Number.isNaN(parsed)) {
      setOffsetDraft(String(chart.meta.offsetMs));
      return;
    }
    applyOffset(parsed);
  };

  const closeOffsetToolbar = () => {
    commitOffsetDraft();
    setShowOffsetToolbar(false);
  };

  const openOffsetToolbar = () => {
    setOffsetDraft(String(useEditorStore.getState().chart.meta.offsetMs));
    setShowOffsetToolbar(true);
  };

  const renderOffsetToolbar = () => {
    const toolbarStyle = styles.offsetCompactToolbar;
    const buttonStyle = styles.compactButton;
    const primaryButtonStyle = { ...styles.compactButton, ...styles.compactPrimaryButton };
    const inputStyle = styles.offsetCompactInput;
    const stepDelta = (delta: number) => applyOffset(chart.meta.offsetMs + delta);

    return (
      <div style={toolbarStyle}>
        <button style={primaryButtonStyle} onClick={closeOffsetToolbar}>
          Done
        </button>
        <span style={styles.label}>Offset</span>
        <input
          type="number"
          value={offsetDraft}
          onChange={(e) => setOffsetDraft(e.target.value)}
          onBlur={commitOffsetDraft}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              commitOffsetDraft();
              e.currentTarget.blur();
            }
          }}
          style={inputStyle}
          aria-label="Audio offset milliseconds"
        />
        <span style={{ ...styles.label, marginLeft: 0 }}>ms</span>
        <button style={buttonStyle} onClick={() => stepDelta(-10)}>-10</button>
        <button style={buttonStyle} onClick={() => stepDelta(-1)}>-1</button>
        <button style={buttonStyle} onClick={() => stepDelta(1)}>+1</button>
        <button style={buttonStyle} onClick={() => stepDelta(10)}>+10</button>
      </div>
    );
  };

  const renderCompactOption = (
    key: string | number,
    label: string,
    active: boolean,
    onClick: () => void,
  ) => (
    <button
      key={key}
      style={{ ...styles.compactPickerOption, ...(active ? styles.buttonActive : {}) }}
      onClick={onClick}
    >
      {label}
    </button>
  );

  const renderCompactPicker = () => {
    if (!compactPicker) return null;

    const closePicker = () => setCompactPicker(null);
    const titleByPicker: Record<CompactPicker, string> = {
      entity: 'Entity',
      snap: 'Snap',
      extra: 'Extra lanes',
    };

    return (
      <div style={styles.compactPickerOverlay} onClick={closePicker}>
        <div style={styles.compactPickerPanel} onClick={(e) => e.stopPropagation()}>
          <div style={styles.compactPickerHeader}>
            <div style={styles.compactPickerTitle}>{titleByPicker[compactPicker]}</div>
            <button
              style={compactIconStyle}
              onClick={closePicker}
              title="Close"
              aria-label="Close"
            >
              <ToolbarIcon name="close" />
            </button>
          </div>

          {compactPicker === 'entity' && (
            <>
              <div style={styles.compactPickerSection}>
                <label style={styles.compactMenuLabel}>Notes</label>
                <div style={styles.compactPickerGrid}>
                  {compactNoteTypeOptions.map((type) => renderCompactOption(type, entityLabels[type], entityType === type, () => {
                    setEntityType(type);
                    setMode('create');
                    closePicker();
                  }))}
                </div>
              </div>
              <div style={styles.compactPickerSection}>
                <label style={styles.compactMenuLabel}>Events</label>
                <div style={styles.compactPickerGrid}>
                  {eventTypeOptions.map((type) => renderCompactOption(type, entityLabels[type], entityType === type, () => {
                    setEntityType(type);
                    setMode('create');
                    closePicker();
                  }))}
                </div>
              </div>
            </>
          )}

          {compactPicker === 'snap' && (
            <div style={styles.compactPickerGrid}>
              {standardSnapOptions.map((value) => renderCompactOption(value, `1/${value}`, snapDivision === value, () => {
                setSnapDivision(value);
                closePicker();
              }))}
              {renderCompactOption('custom', standardSnapOptions.includes(snapDivision) ? 'Custom' : `1/${snapDivision}`, !standardSnapOptions.includes(snapDivision), () => {
                closePicker();
                onOpenCustomSnap();
              })}
            </div>
          )}

          {compactPicker === 'extra' && (
            <div style={styles.compactPickerGrid}>
              {extraLaneOptions.map((value) => renderCompactOption(value, String(value), extraLaneCount === value, () => {
                setExtraLaneCount(value);
                if (value < extraLaneCount) {
                  setSelectedExtraNotes(new Set());
                }
                closePicker();
              }))}
            </div>
          )}
        </div>
      </div>
    );
  };

  if (showOffsetToolbar) {
    return renderOffsetToolbar();
  }

  return (
      <div style={styles.compactToolbar}>
        <div style={styles.compactTopRow}>
          <div style={styles.compactGroup}>
            <button
              style={getIconButtonStyle(false, historyPastCount === 0)}
              onClick={runUndo}
              disabled={historyPastCount === 0}
              title="Undo (Ctrl+Z)"
              aria-label="Undo"
            >
              <ToolbarIcon name="undo" />
            </button>
            <button
              style={getIconButtonStyle(false, historyFutureCount === 0)}
              onClick={runRedo}
              disabled={historyFutureCount === 0}
              title="Redo (Ctrl+Shift+Z)"
              aria-label="Redo"
            >
              <ToolbarIcon name="redo" />
            </button>
          </div>

          <div style={styles.compactGroup}>
            <button
              style={getIconButtonStyle(mode === 'create')}
              onClick={() => setMode('create')}
              title="Create mode"
              aria-label="Create"
            >
              <ToolbarIcon name="create" />
            </button>
            <button
              style={getIconButtonStyle(mode === 'select')}
              onClick={() => setMode('select')}
              title="Select mode"
              aria-label="Select"
            >
              <ToolbarIcon name="select" />
            </button>
            <button
              style={getIconButtonStyle(mode === 'delete')}
              onClick={() => setMode('delete')}
              title="Delete mode"
              aria-label="Delete"
            >
              <ToolbarIcon name="delete" />
            </button>
          </div>

          {mode === 'create' && (
            <div style={styles.compactGroup}>
              <button
                style={compactIconStyle}
                onClick={() => setCompactPicker('entity')}
                title={`Entity: ${entityLabels[entityType]}`}
                aria-label={`Entity: ${entityLabels[entityType]}`}
              >
                <ToolbarIcon name="entity" />
              </button>
            </div>
          )}

          <div style={styles.compactGroup}>
            <button
              style={compactIconStyle}
              onClick={() => setCompactPicker('snap')}
              title={`Snap: 1/${snapDivision}`}
              aria-label={`Snap: 1/${snapDivision}`}
            >
              <ToolbarIcon name="snap" />
            </button>
          </div>

          <div style={styles.compactGroup}>
            <button
              style={{ ...compactIconStyle, ...styles.compactPlayButton, ...(isPlaying ? styles.buttonActive : {}) }}
              onClick={() => playbackRef.current?.togglePlay()}
              title={isPlaying ? 'Pause' : 'Play'}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              <ToolbarIcon name={isPlaying ? 'pause' : 'play'} />
            </button>
            <button
              style={{
                ...compactIconStyle,
                ...styles.compactPrimaryButton,
                ...(saving || deleting ? styles.compactButtonDisabled : {}),
                position: 'relative',
              }}
              onClick={onSaveChart}
              disabled={saving || deleting}
              title={saving ? 'Saving chart' : isDirty ? 'Save chart (unsaved changes)' : 'Save chart'}
              aria-label={saving ? 'Saving chart' : isDirty ? 'Save chart, unsaved changes' : 'Save chart'}
            >
              <ToolbarIcon name="save" />
              {isDirty && <span style={styles.compactDirtyBadge} />}
            </button>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <button
                style={getIconButtonStyle(showMoreMenu)}
                onClick={() => setShowMoreMenu((v) => !v)}
                title="More editor actions"
                aria-label="More editor actions"
              >
                <ToolbarIcon name="more" />
              </button>
              {showMoreMenu && (
                <>
                  <div
                    style={{ position: 'fixed', inset: 0, zIndex: 999 }}
                    onClick={() => setShowMoreMenu(false)}
                  />
                  <div style={styles.compactMoreMenu}>
                    <button
                      style={styles.compactMenuButton}
                      onClick={() => {
                        setShowMoreMenu(false);
                        requestBackToSongs();
                      }}
                    >
                      Back to Songs
                    </button>
                    <button style={styles.compactMenuButton} onClick={() => { setShowMoreMenu(false); onOpenMeta(); }}>
                      Meta
                    </button>
                    <button
                      style={styles.compactMenuButton}
                      onClick={() => { setShowMoreMenu(false); onDeleteSelected(); }}
                      disabled={selectedCount === 0}
                    >
                      Delete selected{selectedCount > 0 ? ` (${selectedCount})` : ''}
                    </button>
                    <button
                      style={styles.compactMenuButton}
                      onClick={() => { setShowMoreMenu(false); openOffsetToolbar(); }}
                    >
                      Offset
                    </button>
                    <button
                      style={styles.compactMenuButton}
                      onClick={() => { setShowMoreMenu(false); onSaveAs(); }}
                      disabled={saving || deleting || !activeSongId}
                    >
                      Save As
                    </button>
                    <button
                      style={{ ...styles.compactMenuButton, ...styles.compactDangerButton }}
                      onClick={() => { setShowMoreMenu(false); onDeleteChart(); }}
                      disabled={saving || deleting || !activeSongId}
                    >
                      {deleting ? 'Deleting' : 'Delete Chart'}
                    </button>
                    <button
                      style={styles.compactMenuButton}
                      onClick={() => {
                        setShowMoreMenu(false);
                        setCompactPicker('extra');
                      }}
                    >
                      Extra lanes: {extraLaneCount}
                    </button>
                    <label style={styles.compactMenuLabel}>Volume</label>
                    <div style={styles.compactVolumeRow}>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={masterVolume}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          updateSettings({ masterVolume: v });
                          if (playbackRef.current) playbackRef.current.volume = v;
                        }}
                        style={{ ...styles.volumeSlider, width: '130px' }}
                      />
                      <span style={{ fontSize: '12px', color: '#e0e0e0', minWidth: '34px', textAlign: 'right' }}>
                        {Math.round(masterVolume * 100)}%
                      </span>
                    </div>
                    <button
                      style={{ ...styles.compactMenuButton, ...(autoScroll ? styles.buttonActive : {}) }}
                      onClick={() => setAutoScroll(!autoScroll)}
                    >
                      Auto Scroll
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {renderCompactPicker()}

      </div>
  );
}
