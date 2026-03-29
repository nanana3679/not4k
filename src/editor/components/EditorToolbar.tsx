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
    padding: '8px 16px',
    backgroundColor: '#2a2a2a',
    borderBottom: '1px solid #333',
    height: '40px',
  },
  button: {
    padding: '4px 12px',
    backgroundColor: '#3a3a3a',
    color: '#e0e0e0',
    border: '1px solid #555',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '13px',
  },
  buttonActive: {
    backgroundColor: '#4488ff',
    borderColor: '#4488ff',
  },
  select: {
    padding: '4px 8px',
    backgroundColor: '#3a3a3a',
    color: '#e0e0e0',
    border: '1px solid #555',
    borderRadius: '4px',
    fontSize: '13px',
  },
  label: {
    fontSize: '13px',
    marginLeft: '8px',
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
};

interface EditorToolbarProps {
  playbackRef: RefObject<PlaybackController | null>;
  autoScroll: boolean;
  setAutoScroll: (v: boolean) => void;
  showOffsetPanel: boolean;
  setShowOffsetPanel: (v: boolean | ((prev: boolean) => boolean)) => void;
  showPlayTestMenu: boolean;
  setShowPlayTestMenu: (v: boolean | ((prev: boolean) => boolean)) => void;
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
const eventTypeOptions: EntityType[] = ['bpm', 'timeSignature', 'text', 'auto', 'stop'];

export function EditorToolbar({
  playbackRef,
  autoScroll,
  setAutoScroll,
  showOffsetPanel,
  setShowOffsetPanel,
  showPlayTestMenu,
  setShowPlayTestMenu,
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

  const mode = useEditorStore((s) => s.mode);
  const setMode = useEditorStore((s) => s.setMode);
  const entityType = useEditorStore((s) => s.entityType);
  const setEntityType = useEditorStore((s) => s.setEntityType);
  const zoom = useEditorStore((s) => s.zoom);
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

  const isDirty = !!(savedChartSnapshot && (
    serializeChart(chart) !== savedChartSnapshot ||
    serializeExtraNotes(extraNotes, extraLaneCount) !== savedExtraSnapshot
  )) || pendingPreviewRange != null;

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
        {[0,1,2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>{n}</option>)}
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
        {showOffsetPanel && (
          <>
            <div
              style={{ position: 'fixed', inset: 0, zIndex: 999 }}
              onClick={() => setShowOffsetPanel(false)}
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
              padding: '8px 10px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              whiteSpace: 'nowrap',
            }}>
              <button
                style={{ ...styles.button, padding: '2px 6px', fontSize: '12px' }}
                onClick={() => setChart({ ...chart, meta: { ...chart.meta, offsetMs: chart.meta.offsetMs - 10 } })}
              >-10</button>
              <button
                style={{ ...styles.button, padding: '2px 6px', fontSize: '12px' }}
                onClick={() => setChart({ ...chart, meta: { ...chart.meta, offsetMs: chart.meta.offsetMs - 1 } })}
              >-1</button>
              <input
                type="number"
                value={chart.meta.offsetMs}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v)) setChart({ ...chart, meta: { ...chart.meta, offsetMs: v } });
                }}
                style={{
                  width: '72px',
                  padding: '2px 6px',
                  backgroundColor: '#1a1a1a',
                  color: '#e0e0e0',
                  border: '1px solid #555',
                  borderRadius: '4px',
                  fontSize: '13px',
                  textAlign: 'center',
                }}
              />
              <span style={{ fontSize: '12px', color: '#999' }}>ms</span>
              <button
                style={{ ...styles.button, padding: '2px 6px', fontSize: '12px' }}
                onClick={() => setChart({ ...chart, meta: { ...chart.meta, offsetMs: chart.meta.offsetMs + 1 } })}
              >+1</button>
              <button
                style={{ ...styles.button, padding: '2px 6px', fontSize: '12px' }}
                onClick={() => setChart({ ...chart, meta: { ...chart.meta, offsetMs: chart.meta.offsetMs + 10 } })}
              >+10</button>
            </div>
          </>
        )}
      </div>

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
