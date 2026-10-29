/**
 * LegacyConversionReviewPanel — 승인한 구형 차트 변환이 남긴 "변환 검토" 목록(RFD 0037 §8-1).
 *
 * 캔버스를 가리지 않도록 데스크톱은 캔버스 오른쪽 열, 좁은 화면·터치는 캔버스 아래 칸으로 붙는다.
 * 행을 누르면 그 위치로 이동해 노트를 고르고(호출한 쪽이 처리), 목록은 닫아도 세션 동안 툴바 버튼으로 다시 연다.
 */

import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { LegacyConversionItem } from '../../shared';
import { color, font, primitives, radius, surface } from '../../shared/theme';
import type { LegacyConversionReviewRow } from '../legacyConversionReview';

interface LegacyConversionReviewPanelProps {
  compact: boolean;
  rows: readonly LegacyConversionReviewRow[];
  /** "텍스트로 복사"가 클립보드에 넣을 글. */
  copyText: string;
  onSelect: (item: LegacyConversionItem) => void;
  onCopyResult: (copied: boolean) => void;
  onClose: () => void;
}

/** 보안 컨텍스트가 아니어서 Clipboard API가 없으면 선택 영역 복사로 대신한다. */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 권한 거부 등은 아래 대체 경로로 다시 시도한다.
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}

export function LegacyConversionReviewPanel({ compact, rows, copyText, onSelect, onCopyResult, onClose }: LegacyConversionReviewPanelProps) {
  const [activeKey, setActiveKey] = useState<string | null>(null);

  return (
    <aside aria-label="변환 검토" style={{ ...styles.panel, ...(compact ? styles.panelCompact : styles.panelSide) }}>
      <div style={styles.header}>
        <h2 style={styles.title}>변환 검토 {rows.length}건</h2>
        <button
          type="button"
          style={styles.copyButton}
          onClick={() => { void copyToClipboard(copyText).then(onCopyResult); }}
        >
          텍스트로 복사
        </button>
        <button type="button" style={styles.closeButton} onClick={onClose} aria-label="변환 검토 닫기" title="닫기">
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <p style={styles.hint}>행을 누르면 그 박으로 이동해 같은 레인의 노트를 선택합니다.</p>
      <ol style={styles.list}>
        {rows.map((row) => {
          const active = row.key === activeKey;
          return (
            <li key={row.key} style={styles.listItem}>
              <button
                type="button"
                style={{ ...styles.row, ...(active ? styles.rowActive : {}) }}
                aria-current={active ? 'true' : undefined}
                onClick={() => { setActiveKey(row.key); onSelect(row.item); }}
              >
                <span style={styles.rowPosition}>{row.lane} · {row.position}</span>
                <span style={styles.rowDescription}>{row.description}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}

const styles = {
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    minHeight: 0,
    boxSizing: 'border-box',
    padding: '10px',
    background: surface.panel,
    color: color.ink,
    fontFamily: font.body,
    // 한국어 문구가 '1개'처럼 낱말 가운데서 줄바꿈되지 않게 한다.
    wordBreak: 'keep-all',
    overflowWrap: 'anywhere',
  },
  // 데스크톱: 캔버스 오른쪽 열. 캔버스가 이 폭만큼 줄어 미니맵을 가리지 않는다.
  panelSide: {
    width: '300px',
    flexShrink: 0,
    borderLeft: `1px solid ${color.line}`,
  },
  // 좁은 화면·터치: 캔버스 아래 칸. 캔버스가 이 높이만큼 줄어 툴바·레인을 가리지 않는다.
  panelCompact: {
    width: '100%',
    maxHeight: '38dvh',
    flexShrink: 0,
    borderTop: `1px solid ${color.line}`,
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
  copyButton: {
    ...primitives.metalButton,
    minHeight: '36px',
    padding: '0 10px',
    fontFamily: font.body,
    fontSize: '12px',
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
  list: {
    flex: 1,
    minHeight: 0,
    margin: 0,
    padding: 0,
    listStyle: 'none',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  listItem: {
    margin: 0,
  },
  row: {
    width: '100%',
    minHeight: '44px',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '2px',
    padding: '7px 10px',
    background: surface.card,
    color: color.ink,
    border: `1px solid ${color.line}`,
    borderRadius: radius.sm,
    cursor: 'pointer',
    fontFamily: font.body,
    textAlign: 'left',
    touchAction: 'manipulation',
  },
  rowActive: {
    background: surface.cardFocused,
    borderColor: color.neon,
  },
  rowPosition: {
    fontSize: '13px',
    fontWeight: 700,
    color: color.inkStrong,
    fontVariantNumeric: 'tabular-nums',
  },
  rowDescription: {
    fontSize: '12px',
    lineHeight: 1.4,
    color: color.inkDim,
  },
} satisfies Record<string, CSSProperties>;
