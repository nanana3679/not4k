/**
 * SongInfoDrawer — 곡 행이 있는 차트의 곡 정보 드로어(RFD 0098·0107).
 *
 * 타임라인 왼쪽(좁은 화면·터치는 위)의 비모달 패널이다. 열려 있어도 타임라인 편집과 재생·일시정지를 그대로 쓴다.
 * 곡이 소유한 값(제목·아티스트·자켓·음원 정렬 오프셋·음원·프리뷰 구간·인게임 구간)을 편집하며, 값은 바로 에디터 store의 지금 값에
 * 적용되고 Save 하나가 곡 저장으로 확정한다. BPM·박자표는 타임라인의 이벤트로 편집한다(공통 레인은 PR5b).
 *
 * - 입력칸은 포커스를 옮기거나 Enter를 누를 때 적용한다. Undo·변경 취소처럼 바깥에서 값이 바뀌면 입력칸을 새 값으로 다시 그린다.
 * - 오프셋은 타이밍 값이라 재생 중 입력·증감 버튼이 비활성이고, 다른 경로의 시도도 값을 바꾸지 않는다(RFD 0099).
 * - 구간 선택기는 끌기를 마치고 손을 떼거나 페이드 입력에서 선택기 밖으로 포커스를 옮길 때 적용한다. 선택기가 마운트하며 알리는
 *   처음 구간은 편집이 아니다. 자기가 적용한 값으로는 다시 그리지 않고 바깥 변경(변경 취소)과 음원 교체 때만 다시 그린다.
 *   음원 교체가 구간을 적용하는 일은 호출한 쪽(editSongAudio)이 맡는다.
 * - 닫기와 차트 전환은 미저장 곡 정보 확인을 거치도록 호출한 쪽에 요청만 한다.
 * - 포커스가 드로어 안에 있으면 키는 드로어의 것이다. 버튼·체크박스는 Space·Enter로 눌리고 Delete·S·Ctrl+Z 같은 에디터 단축키는
 *   실행하지 않는다. 숫자 입력칸의 Space만 값을 적용한 뒤 재생·정지한다(useEditorKeyboard).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, FocusEvent, KeyboardEvent, RefObject } from 'react';
import type { PlaybackRange } from '../../shared';
import { formatDifficultyLabel } from '../../shared/chartDifficulty';
import { color, font, primitives, radius, surface } from '../../shared/theme';
import type { StoredChartRow } from '../../supabase/chartRows';
import { PAUSE_TO_EDIT_COPY, SONG_INFO_DRAWER_COPY } from '../editorCopy';
import { OWN_KEYS_REGION_ATTRIBUTE } from '../hooks/useEditorKeyboard';
import type { MetaAudioPick } from '../metaAudioSession';
import {
  editAudioOffset,
  editGameplayRange,
  editPreviewRange,
  editSongArtist,
  editSongJacket,
  editSongTitle,
} from '../songInfoEditing';
import { useEditorStore } from '../stores';
import { PreviewRangeSelector, type PreviewRangeSelectorProps } from './PreviewRangeSelector';
import { followRangeInput, notifiedRange, type PreviewRangeState, type RangeFieldMount, type RangeInput } from './previewRangeState';

/** 드로어가 보이는 같은 곡의 차트 목록. 드로어를 열 때 불러온다. */
export type SongChartList =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'loaded'; rows: readonly Pick<StoredChartRow, 'id' | 'difficultyLabel'>[] };

export interface SongInfoDrawerProps {
  compact: boolean;
  /** 재생기의 현재 음원. 없거나 불러오는 중이면 구간 선택기를 그리지 않는다. */
  audioBuffer: AudioBuffer | null;
  /** 드로어에서 고른 음원과 로드 결과. 불러오는 동안 음원 선택을 막는다. */
  audioPick: MetaAudioPick | null;
  onPickAudio: (file: File) => void;
  charts: SongChartList;
  /** 같은 곡의 다른 차트로 전환을 요청한다. 미저장 곡 정보 확인은 호출한 쪽이 한다. */
  onSwitchChart: (difficultyLabel: string) => void;
  /** 닫기를 요청한다. 미저장 곡 정보가 있으면 호출한 쪽이 저장·변경 취소를 묻는다. */
  onRequestClose: () => void;
  /** Storage 경로를 미리보기용 공개 URL로 바꾼다. */
  toPublicUrl: (path: string) => string;
}

const bufferKeys = new WeakMap<AudioBuffer, number>();
let nextBufferKey = 1;
/** 음원이 바뀌면 구간 선택기를 새 길이로 다시 그리도록 버퍼마다 번호를 붙인다. */
function audioBufferKey(buffer: AudioBuffer): number {
  let key = bufferKeys.get(buffer);
  if (key === undefined) {
    key = nextBufferKey++;
    bufferKeys.set(buffer, key);
  }
  return key;
}

/** 대기 자켓의 미리보기 URL. 파일이 바뀌거나 드로어가 닫히면 해제한다(에디터는 StrictMode를 쓰지 않는다, src/main.tsx). */
function useObjectUrl(file: File | null): string | null {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  return url;
}

function sameRangeState(a: PreviewRangeState, b: PreviewRangeState): boolean {
  return a.startTime === b.startTime && a.endTime === b.endTime && a.enabled === b.enabled
    && a.fadeInTime === b.fadeInTime && a.fadeOutTime === b.fadeOutTime;
}

/**
 * 구간 선택기 하나. 선택기가 적용한 값이 store에 들어와도 선택기는 이미 그 값을 보이므로 다시 그리지 않는다(포커스·끌기·미리듣기가
 * 끊기지 않게). 변경 취소처럼 바깥에서 값이 바뀌면 선택기를 새 값으로 다시 그린다(followRangeInput). 음원이 바뀌면 드로어가
 * key로 이 칸 전체를 다시 그린다.
 */
export function RangeField({ selector, onCommit }: {
  selector: Omit<PreviewRangeSelectorProps, 'onChange' | 'onDragEnd'>;
  onCommit: (range: PlaybackRange) => void;
}) {
  const input: RangeInput = { initialStart: selector.initialStart, initialEnd: selector.initialEnd,
    initialFadeInTime: selector.initialFadeInTime, initialFadeOutTime: selector.initialFadeOutTime };
  const [mount, setMount] = useState<RangeFieldMount>({ shown: input, generation: 0 });
  const next = followRangeInput(mount, input);
  if (next !== mount) setMount(next);
  const commit = (range: PlaybackRange) => {
    // 적용한 값을 선택기가 보이는 값으로 둔다. store가 그 값을 받으면 위 비교가 같아 다시 그리지 않는다.
    setMount(current => ({ ...current, shown: { initialStart: range.startTime, initialEnd: range.endTime,
      initialFadeInTime: range.fadeInTime, initialFadeOutTime: range.fadeOutTime } }));
    onCommit(range);
  };
  return <RangeSelectorField key={next.generation} selector={selector} onCommit={commit} />;
}

/**
 * 구간 선택기와 그 적용. 선택기는 마운트할 때만 처음 구간을 읽고 바뀔 때마다 알린다. 첫 알림은 처음 구간이라 적용하지 않는다.
 * 파형에서 손을 떼면 선택기가 놓은 위치로 계산해 바로 넘기는 구간(onDragEnd)을, 페이드 입력·체크박스에서 선택기 밖으로 포커스를
 * 옮기면(blur) 마지막 알림을 적용한 값과 비교해 다르면 적용한다. 같은 선택기 안에서 포커스를 옮기면(Fade In → Fade Out) 아직
 * 적용하지 않는다. 손을 떼는 순간에는 마지막 끌기의 알림이 아직 오지 않았을 수 있어 알림을 쓰지 않는다.
 * 선택기를 끈(null) 알림은 구간을 지우지 않는다(기존 Meta 창과 같다).
 */
function RangeSelectorField({ selector, onCommit }: {
  selector: Omit<PreviewRangeSelectorProps, 'onChange' | 'onDragEnd'>;
  onCommit: (range: PlaybackRange) => void;
}) {
  // store에 있는 구간. 처음엔 선택기의 첫 알림(처음 구간)이고 적용할 때마다 그 값이 된다.
  const appliedRef = useRef<PreviewRangeState | null | undefined>(undefined);
  const latestRef = useRef<PreviewRangeState | null>(null);
  const handleChange = useCallback((range: PreviewRangeState | null) => {
    if (appliedRef.current === undefined) appliedRef.current = range;
    latestRef.current = range;
  }, []);
  const commit = (range: PreviewRangeState | null) => {
    const applied = appliedRef.current;
    if (!range || (applied && sameRangeState(range, applied))) return;
    appliedRef.current = range;
    onCommit(notifiedRange(range));
  };
  const handleDragEnd = (range: PreviewRangeState | null) => {
    latestRef.current = range;
    commit(range);
  };
  const handleBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget)) return;
    commit(latestRef.current);
  };
  return (
    <div onBlur={handleBlur}>
      <PreviewRangeSelector {...selector} onChange={handleChange} onDragEnd={handleDragEnd} />
    </div>
  );
}

/**
 * 숨은 파일 입력과 그 입력을 여는 버튼. 파일 입력은 화면에 보이지 않고 탭 순서에서 빠지며, 키보드·화면 읽기 프로그램은 이 버튼으로
 * 연다. 입력 ref는 드로어가 갖는다(요소 트리로 검사하는 단위 테스트가 버튼·입력을 바로 보게 컴포넌트가 아닌 함수로 그린다).
 */
function renderFilePick({ label, accept, disabled = false, inputRef, onPick }: {
  label: string;
  accept: string;
  disabled?: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  onPick: (file: File) => void;
}) {
  return (
    <>
      <button
        type="button"
        style={disabled ? { ...styles.pickButton, ...styles.disabled } : styles.pickButton}
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        {label}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        hidden
        tabIndex={-1}
        disabled={disabled}
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          // 같은 파일을 다시 골라도 onChange가 오도록 비운다.
          e.currentTarget.value = '';
          if (file) onPick(file);
        }}
      />
    </>
  );
}

const blurOnEnter = (e: KeyboardEvent<HTMLInputElement>) => {
  if (e.key === 'Enter') e.currentTarget.blur();
};

const OFFSET_STEPS = [-10, -1, 1, 10];

export function SongInfoDrawer({
  compact,
  audioBuffer,
  audioPick,
  onPickAudio,
  charts,
  onSwitchChart,
  onRequestClose,
  toPublicUrl,
}: SongInfoDrawerProps) {
  const meta = useEditorStore((s) => s.chart.meta);
  const song = useEditorStore((s) => s.song);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const chartRow = useEditorStore((s) => s.chartRow);
  const activeDifficulty = useEditorStore((s) => s.activeDifficulty);
  const jacketPreviewUrl = useObjectUrl(song?.pendingJacketFile ?? null);
  const jacketInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  // 불러오지 못한 자켓 URL. 다른 URL로 바뀌면 다시 시도한다.
  const [brokenJacketUrl, setBrokenJacketUrl] = useState<string | null>(null);

  const jacketUrl = jacketPreviewUrl ?? (meta.imageFile ? toPublicUrl(meta.imageFile) : null);
  const showJacket = jacketUrl !== null && jacketUrl !== brokenJacketUrl;
  const audioPickLoading = audioPick?.status === 'loading';
  const lockTitle = isPlaying ? PAUSE_TO_EDIT_COPY : undefined;

  const commitOffset = (e: FocusEvent<HTMLInputElement>) => {
    const field = e.currentTarget;
    const parsed = parseFloat(field.value);
    // 숫자가 아니거나 재생 중이라 막히면 입력칸을 지금 오프셋으로 되돌린다.
    if (Number.isNaN(parsed) || !editAudioOffset(parsed)) {
      field.value = String(useEditorStore.getState().chart.meta.offsetMs);
    }
  };

  const isCurrentChart = (row: Pick<StoredChartRow, 'id' | 'difficultyLabel'>) => chartRow
    ? row.id === chartRow.id
    : row.difficultyLabel.toLowerCase() === (activeDifficulty ?? meta.difficultyLabel).toLowerCase();

  const preview = song?.pendingPreviewRange ?? null;
  const gameplay = song?.gameplayRange ?? null;
  const bufferKey = audioBuffer ? audioBufferKey(audioBuffer) : 0;

  return (
    // 포커스가 드로어 안에 있으면 키는 드로어의 것이다(에디터 단축키가 버튼·체크박스의 Space·Enter와 Delete를 가로채지 않는다).
    <aside {...{ [OWN_KEYS_REGION_ATTRIBUTE]: '' }} aria-label={SONG_INFO_DRAWER_COPY.title} style={{ ...styles.panel, ...(compact ? styles.panelCompact : styles.panelSide) }}>
      <div style={styles.header}>
        <h2 style={styles.title}>{SONG_INFO_DRAWER_COPY.title}</h2>
        <button
          type="button"
          style={styles.closeButton}
          onClick={onRequestClose}
          aria-label={SONG_INFO_DRAWER_COPY.close}
          title={SONG_INFO_DRAWER_COPY.close}
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <p style={styles.hint}>{SONG_INFO_DRAWER_COPY.scope}</p>

      <label style={styles.field}>
        <span>Title</span>
        <input
          key={`title:${meta.title}`}
          type="text"
          style={styles.input}
          defaultValue={meta.title}
          onBlur={(e) => editSongTitle(e.currentTarget.value)}
          onKeyDown={blurOnEnter}
        />
      </label>
      <label style={styles.field}>
        <span>Artist</span>
        <input
          key={`artist:${meta.artist}`}
          type="text"
          style={styles.input}
          defaultValue={meta.artist}
          onBlur={(e) => editSongArtist(e.currentTarget.value)}
          onKeyDown={blurOnEnter}
        />
      </label>

      <div style={styles.section}>
        <label style={styles.field}>
          <span>Offset (ms)</span>
          <input
            key={`offset:${meta.offsetMs}`}
            type="number"
            style={isPlaying ? { ...styles.input, ...styles.disabled } : styles.input}
            defaultValue={String(meta.offsetMs)}
            disabled={isPlaying}
            title={lockTitle}
            onBlur={commitOffset}
            onKeyDown={blurOnEnter}
          />
        </label>
        <div style={styles.stepRow}>
          {OFFSET_STEPS.map((delta) => (
            <button
              key={delta}
              type="button"
              style={isPlaying ? { ...styles.stepButton, ...styles.disabled } : styles.stepButton}
              disabled={isPlaying}
              title={lockTitle}
              onClick={() => { editAudioOffset(useEditorStore.getState().chart.meta.offsetMs + delta); }}
            >
              {delta > 0 ? `+${delta}` : String(delta)}
            </button>
          ))}
        </div>
      </div>

      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <span style={styles.sectionTitle}>Jacket</span>
          {renderFilePick({ label: showJacket ? 'Replace Jacket' : 'Upload Jacket', accept: 'image/*',
            inputRef: jacketInputRef, onPick: editSongJacket })}
        </div>
        <div style={styles.mediaBox}>
          {showJacket ? (
            <img src={jacketUrl} alt="Jacket" style={styles.jacket} onError={() => setBrokenJacketUrl(jacketUrl)} />
          ) : (
            <div style={styles.empty}>Select a jacket image</div>
          )}
        </div>
      </div>

      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <span style={styles.sectionTitle}>Audio</span>
          {renderFilePick({ label: audioBuffer ? 'Replace Audio' : 'Upload Audio', accept: 'audio/*',
            disabled: audioPickLoading, inputRef: audioInputRef, onPick: onPickAudio })}
        </div>
        <div style={styles.mediaBox}>
          {audioPickLoading ? (
            <div style={styles.empty}>Loading audio…</div>
          ) : audioBuffer ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <RangeField
                key={`preview:${bufferKey}`}
                selector={{
                  audioBuffer,
                  label: '프리뷰 구간',
                  enabledLabel: '프리뷰 사용',
                  initialStart: meta.previewStart,
                  initialEnd: meta.previewEnd,
                  initialFadeInTime: preview?.fadeInTime,
                  initialFadeOutTime: preview?.fadeOutTime,
                }}
                onCommit={editPreviewRange}
              />
              <RangeField
                key={`gameplay:${bufferKey}`}
                selector={{
                  audioBuffer,
                  label: '인게임 구간',
                  canDisable: false,
                  defaultStart: 0,
                  defaultEnd: audioBuffer.duration,
                  defaultDuration: audioBuffer.duration,
                  minDuration: 1,
                  showFadeControls: true,
                  initialStart: gameplay?.startTime,
                  initialEnd: gameplay?.endTime,
                  initialFadeInTime: gameplay?.fadeInTime,
                  initialFadeOutTime: gameplay?.fadeOutTime,
                }}
                onCommit={editGameplayRange}
              />
            </div>
          ) : (
            <div style={styles.empty}>Select an audio file</div>
          )}
        </div>
      </div>

      <div style={styles.section}>
        <span style={styles.sectionTitle}>{SONG_INFO_DRAWER_COPY.charts}</span>
        {charts.status === 'loading' && <p style={styles.hint}>{SONG_INFO_DRAWER_COPY.chartsLoading}</p>}
        {charts.status === 'failed' && <p style={styles.hint}>{SONG_INFO_DRAWER_COPY.chartsFailed}</p>}
        {charts.status === 'loaded' && (
          <ul style={styles.chartList}>
            {charts.rows.map((row) => {
              const current = isCurrentChart(row);
              return (
                <li key={row.id} style={{ margin: 0 }}>
                  <button
                    type="button"
                    style={{ ...styles.chartButton, ...(current ? styles.chartButtonCurrent : {}) }}
                    disabled={current}
                    aria-current={current ? 'true' : undefined}
                    title={row.difficultyLabel}
                    onClick={() => onSwitchChart(row.difficultyLabel)}
                  >
                    {formatDifficultyLabel(row.difficultyLabel)}
                    {current && <span style={styles.currentMark}>{SONG_INFO_DRAWER_COPY.currentChart}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}

const styles = {
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    minHeight: 0,
    boxSizing: 'border-box',
    padding: '10px 12px 16px',
    background: surface.panel,
    color: color.ink,
    fontFamily: font.body,
    overflowY: 'auto',
    wordBreak: 'keep-all',
    overflowWrap: 'anywhere',
  },
  // 데스크톱: 타임라인 왼쪽 열. 캔버스가 이 폭만큼 줄어 레인을 가리지 않는다.
  panelSide: {
    width: '320px',
    flexShrink: 0,
    borderRight: `1px solid ${color.line}`,
  },
  // 좁은 화면·터치: 타임라인 위 칸. 캔버스가 이 높이만큼 줄어 타임라인을 계속 보고 쓸 수 있다.
  panelCompact: {
    width: '100%',
    maxHeight: '42dvh',
    flexShrink: 0,
    borderBottom: `1px solid ${color.line}`,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  title: {
    flex: 1,
    margin: 0,
    fontSize: '14px',
    fontWeight: 700,
    color: color.inkStrong,
  },
  closeButton: {
    ...primitives.ghostButton,
    minHeight: '36px',
    width: '36px',
    padding: 0,
    fontSize: '18px',
    lineHeight: 1,
  },
  hint: {
    margin: 0,
    fontSize: '12px',
    lineHeight: 1.4,
    color: color.inkDim,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    fontSize: '13px',
  },
  input: {
    minHeight: '36px',
    boxSizing: 'border-box',
    padding: '6px 8px',
    backgroundColor: '#1a1a1a',
    color: color.ink,
    border: '1px solid #555',
    borderRadius: '4px',
    fontSize: '14px',
  },
  disabled: {
    opacity: 0.45,
    cursor: 'not-allowed',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: '13px',
    fontWeight: 700,
    color: color.inkStrong,
  },
  stepRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
    gap: '6px',
  },
  stepButton: {
    minHeight: '36px',
    padding: '4px 6px',
    backgroundColor: '#3a3a3a',
    color: '#e0e0e0',
    border: '1px solid #555',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '13px',
    touchAction: 'manipulation',
  },
  pickButton: {
    padding: '4px 12px',
    backgroundColor: '#3a3a3a',
    color: color.ink,
    border: '1px solid #555',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px',
    touchAction: 'manipulation',
  },
  mediaBox: {
    padding: '10px',
    backgroundColor: '#222',
    borderRadius: '6px',
    border: '1px solid #3a3a3a',
  },
  jacket: {
    width: '100%',
    maxHeight: '120px',
    objectFit: 'contain',
    borderRadius: '4px',
  },
  empty: {
    padding: '16px 0',
    textAlign: 'center',
    color: '#666',
    fontSize: '12px',
  },
  chartList: {
    margin: 0,
    padding: 0,
    listStyle: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  chartButton: {
    width: '100%',
    minHeight: '40px',
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    padding: '6px 10px',
    background: surface.card,
    color: color.ink,
    border: `1px solid ${color.line}`,
    borderRadius: radius.sm,
    cursor: 'pointer',
    fontFamily: font.display,
    fontSize: '13px',
    fontWeight: 600,
    textAlign: 'left',
    touchAction: 'manipulation',
  },
  chartButtonCurrent: {
    background: surface.cardFocused,
    borderColor: color.neon,
    cursor: 'default',
  },
  currentMark: {
    fontFamily: font.body,
    fontSize: '11px',
    fontWeight: 400,
    color: color.inkDim,
  },
} satisfies Record<string, CSSProperties>;
