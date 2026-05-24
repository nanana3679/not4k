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
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 12px',
    backgroundColor: '#2a2a2a',
    borderBottom: '1px solid #333',
    minHeight: '48px',
    overflowX: 'auto' as const,
    overflowY: 'hidden' as const,
    WebkitOverflowScrolling: 'touch' as const,
    flexShrink: 0,
  },
  button: {
    minHeight: '44px',
    padding: '6px 12px',
    backgroundColor: '#3a3a3a',
    color: '#e0e0e0',
    border: '1px solid #555',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '13px',
    whiteSpace: 'nowrap' as const,
    touchAction: 'manipulation' as const,
  },
  buttonActive: {
    backgroundColor: '#4488ff',
    borderColor: '#4488ff',
  },
  select: {
    minHeight: '44px',
    padding: '6px 8px',
    backgroundColor: '#3a3a3a',
    color: '#e0e0e0',
    border: '1px solid #555',
    borderRadius: '4px',
    fontSize: '13px',
    touchAction: 'manipulation' as const,
  },
  label: {
    fontSize: '13px',
    marginLeft: '8px',
    whiteSpace: 'nowrap' as const,
  },
  separator: {
    width: '1px',
    height: '24px',
    backgroundColor: '#555',
    margin: '0 8px',
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
    padding: '3px',
    backgroundColor: '#242424',
    borderBottom: '1px solid #333',
    flexShrink: 0,
  },
  compactTopRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    minHeight: '36px',
    flexWrap: 'nowrap' as const,
    overflow: 'visible' as const,
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
    width: '34px',
    minWidth: '34px',
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
    position: 'absolute' as const,
    top: '46px',
    right: 0,
    minWidth: '210px',
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

type ToolbarIconName = 'back' | 'map' | 'play' | 'pause' | 'save' | 'more' | 'mode' | 'entity' | 'snap' | 'extra' | 'close';
type CompactPicker = 'mode' | 'entity' | 'snap' | 'extra';

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

  if (name === 'map') {
    return (
      <svg {...common}>
        <path d="M9 18l-6 3V6l6-3 6 3 6-3v15l-6 3Z" />
        <path d="M9 3v15" />
        <path d="M15 6v15" />
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

  if (name === 'mode') {
    return (
      <svg {...common}>
        <path d="M5 5h5v5H5Z" />
        <path d="M14 5h5v5h-5Z" />
        <path d="M5 14h5v5H5Z" />
        <path d="M14 14h5v5h-5Z" />
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
  compact?: boolean;
  playbackRef: RefObject<PlaybackController | null>;
  autoScroll: boolean;
  setAutoScroll: (v: boolean) => void;
  showOffsetPanel: boolean;
  setShowOffsetPanel: (v: boolean | ((prev: boolean) => boolean)) => void;
  showPlayTestMenu: boolean;
  setShowPlayTestMenu: (v: boolean | ((prev: boolean) => boolean)) => void;
  minimapVisible: boolean;
  onToggleMinimap: () => void;
  saving: boolean;
  deleting: boolean;
  savedChartSnapshot: string;
  savedExtraSnapshot: string;
  pendingPreviewRange: { startTime: number; endTime: number } | null;
  onPlayTest: (fromCursor: boolean) => void;
  onSaveChart: () => void;
  onSaveAs: () => void;
  onDeleteChart: () => void;
  onOpenMeta: () => void;
  onOpenCustomSnap: () => void;
}

const noteTypeOptions: EntityType[] = ['single', 'double', 'long', 'doubleLong', 'trillZone'];
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
  compact = false,
  playbackRef,
  autoScroll,
  setAutoScroll,
  showOffsetPanel,
  setShowOffsetPanel,
  showPlayTestMenu,
  setShowPlayTestMenu,
  minimapVisible,
  onToggleMinimap,
  saving,
  deleting,
  savedChartSnapshot,
  savedExtraSnapshot,
  pendingPreviewRange,
  onPlayTest,
  onSaveChart,
  onSaveAs,
  onDeleteChart,
  onOpenMeta,
  onOpenCustomSnap,
}: EditorToolbarProps) {
  const masterVolume = useGameStore((s) => s.settings.masterVolume ?? 1);
  const updateSettings = useGameStore((s) => s.updateSettings);
  const [showSettingsPopover, setShowSettingsPopover] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [compactPicker, setCompactPicker] = useState<CompactPicker | null>(null);

  const mode = useEditorStore((s) => s.mode);
  const setMode = useEditorStore((s) => s.setMode);
  const entityType = useEditorStore((s) => s.entityType);
  const setEntityType = useEditorStore((s) => s.setEntityType);
  const zoom = useEditorStore((s) => s.zoom);
  const snapDivision = useEditorStore((s) => s.snapDivision);
  const setSnapDivision = useEditorStore((s) => s.setSnapDivision);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const chart = useEditorStore((s) => s.chart);
  const extraNotes = useEditorStore((s) => s.extraNotes);
  const extraLaneCount = useEditorStore((s) => s.extraLaneCount);
  const setExtraLaneCount = useEditorStore((s) => s.setExtraLaneCount);
  const setSelectedExtraNotes = useEditorStore((s) => s.setSelectedExtraNotes);
  const activeSongId = useEditorStore((s) => s.activeSongId);

  const isDirty = !!(savedChartSnapshot && (
    serializeChart(chart) !== savedChartSnapshot ||
    serializeExtraNotes(extraNotes, extraLaneCount) !== savedExtraSnapshot
  )) || pendingPreviewRange != null;

  const compactIconStyle = {
    ...styles.compactButton,
    ...styles.compactIconButton,
  };

  const compactActiveIconStyle = {
    ...compactIconStyle,
    ...styles.buttonActive,
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
      mode: 'Mode',
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

          {compactPicker === 'mode' && (
            <div style={styles.compactPickerGrid}>
              {renderCompactOption('create', 'Create', mode === 'create', () => {
                setMode('create');
                closePicker();
              })}
              {renderCompactOption('select', 'Select', mode === 'select', () => {
                setMode('select');
                closePicker();
              })}
              {renderCompactOption('delete', 'Delete', mode === 'delete', () => {
                setMode('delete');
                closePicker();
              })}
            </div>
          )}

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

  if (compact) {
    return (
      <div style={styles.compactToolbar}>
        <div style={styles.compactTopRow}>
          <button
            style={{ ...styles.compactButton, ...styles.compactIconButton }}
            onClick={() => {
              if (isDirty) {
                window.dispatchEvent(new CustomEvent('editor:requestLeave'));
              } else {
                window.location.href = '/game';
              }
            }}
            title="Back to song list"
            aria-label="Back to song list"
          >
            <ToolbarIcon name="back" />
          </button>
          <button
            style={compactActiveIconStyle}
            onClick={() => setCompactPicker('mode')}
            title={`Mode: ${mode}`}
            aria-label={`Mode: ${mode}`}
          >
            <ToolbarIcon name="mode" />
          </button>
          {mode === 'create' && (
            <button
              style={compactIconStyle}
              onClick={() => setCompactPicker('entity')}
              title={`Entity: ${entityLabels[entityType]}`}
              aria-label={`Entity: ${entityLabels[entityType]}`}
            >
              <ToolbarIcon name="entity" />
            </button>
          )}
          <button
            style={compactIconStyle}
            onClick={() => setCompactPicker('snap')}
            title={`Snap: 1/${snapDivision}`}
            aria-label={`Snap: 1/${snapDivision}`}
          >
            <ToolbarIcon name="snap" />
          </button>
          <button
            style={{ ...styles.compactButton, ...styles.compactIconButton, ...(minimapVisible ? styles.buttonActive : {}) }}
            onClick={onToggleMinimap}
            title="Toggle minimap"
            aria-label="Toggle minimap"
          >
            <ToolbarIcon name="map" />
          </button>
          <button
            style={{ ...styles.compactButton, ...styles.compactIconButton, ...styles.compactPlayButton, ...(isPlaying ? styles.buttonActive : {}) }}
            onClick={() => playbackRef.current?.togglePlay()}
            title={isPlaying ? 'Pause' : 'Play'}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            <ToolbarIcon name={isPlaying ? 'pause' : 'play'} />
          </button>
          <button
            style={{
              ...styles.compactButton,
              ...styles.compactIconButton,
              ...styles.compactPrimaryButton,
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
              style={{ ...styles.compactButton, ...styles.compactIconButton, ...(showMoreMenu ? styles.buttonActive : {}) }}
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
                  <button style={styles.compactMenuButton} onClick={() => { setShowMoreMenu(false); onOpenMeta(); }}>
                    Meta
                  </button>
                  <button
                    style={styles.compactMenuButton}
                    onClick={() => { setShowMoreMenu(false); setShowOffsetPanel((v) => !v); }}
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
                    style={{ ...styles.compactMenuButton, color: '#ffb4a8' }}
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

        {renderCompactPicker()}

      </div>
    );
  }

  return (
    <div style={styles.toolbar}>
      {/* 곡 목록으로 돌아가기 */}
      <button
        style={styles.button}
        onClick={() => {
          if (isDirty) {
            // App.tsx에서 setShowLeaveConfirm(true)를 처리
            // onLeave prop 대신 커스텀 이벤트로 위임
            window.dispatchEvent(new CustomEvent('editor:requestLeave'));
          } else {
            window.location.href = '/game';
          }
        }}
        title="Back to song list"
      >
        &larr; Songs
      </button>

      <div style={styles.separator} />

      {/* 모드 버튼 */}
      <button
        style={{ ...styles.button, ...(mode === 'create' ? styles.buttonActive : {}) }}
        onClick={() => setMode('create')}
      >
        Create
      </button>
      <button
        style={{ ...styles.button, ...(mode === 'select' ? styles.buttonActive : {}) }}
        onClick={() => setMode('select')}
      >
        Select
      </button>
      <button
        style={{ ...styles.button, ...(mode === 'delete' ? styles.buttonActive : {}) }}
        onClick={() => setMode('delete')}
      >
        Delete
      </button>

      {/* Entity type 드롭다운 (create 모드에서만) */}
      {mode === 'create' && (
        <select
          style={styles.select}
          value={entityType}
          onChange={(e) => setEntityType(e.target.value as EntityType)}
        >
          <optgroup label="Notes">
            {noteTypeOptions.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </optgroup>
          <optgroup label="Events">
            {eventTypeOptions.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </optgroup>
        </select>
      )}

      <div style={styles.separator} />

      {/* 스냅 선택 */}
      <span style={styles.label}>Snap:</span>
      <select
        style={styles.select}
        value={[4, 8, 16, 32, 3, 6, 12, 24, 48].includes(snapDivision) ? String(snapDivision) : 'custom'}
        onChange={(e) => {
          const val = e.target.value;
          if (val === 'custom') {
            onOpenCustomSnap();
          } else {
            setSnapDivision(parseInt(val));
          }
        }}
      >
        <optgroup label="2-beat">
          <option value="4">1/4</option>
          <option value="8">1/8</option>
          <option value="16">1/16</option>
          <option value="32">1/32</option>
        </optgroup>
        <optgroup label="3-beat">
          <option value="3">1/3</option>
          <option value="6">1/6</option>
          <option value="12">1/12</option>
          <option value="24">1/24</option>
          <option value="48">1/48</option>
        </optgroup>
        <option value="custom">Custom ({[4,8,16,32,3,6,12,24,48].includes(snapDivision) ? '...' : `1/${snapDivision}`})</option>
      </select>

      {/* Extra Lane 선택 */}
      <span style={styles.label}>Extra:</span>
      <select
        style={styles.select}
        value={extraLaneCount}
        onChange={(e) => {
          const newCount = parseInt(e.target.value);
          setExtraLaneCount(newCount);
          if (newCount < extraLaneCount) {
            setSelectedExtraNotes(new Set());
          }
        }}
      >
        {[2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>{n}</option>)}
      </select>

      {/* 줌 표시 */}
      <span style={styles.label}>Zoom: {zoom.toFixed(0)}px/s</span>

      {/* 오프셋 패널 */}
      <div style={{ position: 'relative' }}>
        <button
          style={{ ...styles.button, ...(showOffsetPanel ? styles.buttonActive : {}), marginLeft: '8px' }}
          onClick={() => setShowOffsetPanel((v) => !v)}
          title="Adjust audio offset while viewing waveform"
        >
          Offset
        </button>
      </div>

      <div style={styles.separator} />

      {/* 미니맵 토글 */}
      <button
        style={{ ...styles.button, ...(minimapVisible ? styles.buttonActive : {}) }}
        onClick={onToggleMinimap}
        title="Toggle minimap"
      >
        Map
      </button>

      <div style={styles.separator} />

      {/* 재생/정지 */}
      <button style={styles.button} onClick={() => playbackRef.current?.togglePlay()}>
        {isPlaying ? 'Pause' : 'Play'}
      </button>

      {/* 세팅 팝오버 (마스터 볼륨) */}
      <div style={{ position: 'relative' }}>
        <button
          style={{ ...styles.button, ...(showSettingsPopover ? styles.buttonActive : {}) }}
          onClick={() => setShowSettingsPopover((v) => !v)}
          title={`Master Volume: ${Math.round(masterVolume * 100)}%`}
        >
          Settings
        </button>
        {showSettingsPopover && (
          <>
            <div
              style={{ position: 'fixed', inset: 0, zIndex: 999 }}
              onClick={() => setShowSettingsPopover(false)}
            />
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: '4px',
              backgroundColor: '#2a2a2a',
              border: '1px solid #555',
              borderRadius: '6px',
              zIndex: 1000,
              padding: '8px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              whiteSpace: 'nowrap',
            }}>
              <span style={{ fontSize: '12px', color: '#999' }}>Volume</span>
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
                style={styles.volumeSlider}
              />
              <span style={{ fontSize: '12px', color: '#e0e0e0', minWidth: '32px', textAlign: 'right' }}>
                {Math.round(masterVolume * 100)}%
              </span>
            </div>
          </>
        )}
      </div>

      {/* 자동 스크롤 토글 */}
      <button
        style={{ ...styles.button, ...(autoScroll ? styles.buttonActive : {}) }}
        onClick={() => setAutoScroll(!autoScroll)}
        title="Auto-scroll: follow playback cursor"
      >
        Scroll
      </button>

      <div style={styles.separator} />

      {/* 테스트 플레이 */}
      <div style={{ position: 'relative' }}>
        <button
          style={{ ...styles.button, backgroundColor: '#2d6b3a', borderColor: '#3a8f4e' }}
          onClick={() => setShowPlayTestMenu((v) => !v)}
          title="Test play this chart"
        >
          Test Play
        </button>
        {showPlayTestMenu && (
          <>
            <div
              style={{ position: 'fixed', inset: 0, zIndex: 999 }}
              onClick={() => setShowPlayTestMenu(false)}
            />
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: '4px',
              backgroundColor: '#2a2a2a',
              border: '1px solid #555',
              borderRadius: '4px',
              zIndex: 1000,
              minWidth: '160px',
              overflow: 'hidden',
            }}>
              <button
                style={{ display: 'block', width: '100%', padding: '8px 12px', backgroundColor: 'transparent', color: '#e0e0e0', border: 'none', cursor: 'pointer', fontSize: '13px', textAlign: 'left' }}
                onMouseEnter={(e) => { (e.target as HTMLElement).style.backgroundColor = '#3a3a3a'; }}
                onMouseLeave={(e) => { (e.target as HTMLElement).style.backgroundColor = 'transparent'; }}
                onClick={() => onPlayTest(false)}
              >
                처음부터 시작
              </button>
              <button
                style={{ display: 'block', width: '100%', padding: '8px 12px', backgroundColor: 'transparent', color: '#e0e0e0', border: 'none', cursor: 'pointer', fontSize: '13px', textAlign: 'left', borderTop: '1px solid #444' }}
                onMouseEnter={(e) => { (e.target as HTMLElement).style.backgroundColor = '#3a3a3a'; }}
                onMouseLeave={(e) => { (e.target as HTMLElement).style.backgroundColor = 'transparent'; }}
                onClick={() => onPlayTest(true)}
              >
                커서부터 시작
              </button>
            </div>
          </>
        )}
      </div>

      <div style={{ flex: 1 }} />

      {/* 파일 오퍼레이션 */}
      <button style={styles.button} onClick={onOpenMeta}>
        Meta
      </button>

      <button style={styles.button} onClick={onSaveChart} disabled={saving || deleting}>
        {saving ? 'Saving...' : 'Save Chart'}
      </button>

      <button
        style={{ ...styles.button, backgroundColor: 'transparent', borderColor: '#888' }}
        onClick={onSaveAs}
        disabled={saving || deleting || !activeSongId}
      >
        Save As
      </button>

      <button
        style={{ ...styles.button, backgroundColor: '#7b2d26', borderColor: '#a33b32' }}
        onClick={onDeleteChart}
        disabled={saving || deleting || !activeSongId}
      >
        {deleting ? 'Deleting...' : 'Delete Chart'}
      </button>
    </div>
  );
}
