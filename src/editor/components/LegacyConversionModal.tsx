/**
 * LegacyConversionModal — 구형 노트가 있는 차트를 새로 열 때 1차 기계 변환을 묻고, 변환 뒤 결과를 같은 모달에서 보인다
 * (RFD 0037 §8-1). 변환 전 개수는 같은 순수 함수의 dry-run이다. 변환·저장 자체는 호출한 쪽이 한다.
 *
 * 열린 동안 키보드 포커스는 모달 안에서만 돈다(Tab·Shift+Tab). 뒤 화면은 호출한 쪽이 `inert`로 막아 포커스·클릭을 받지 않게 하고,
 * 이 모달은 그 `inert` 영역 밖(형제)에 그린다. 닫히면 열리기 전에 포커스가 있던 요소로 돌려준다.
 */

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { color, edge, font, primitives, radius, surface } from '../../shared/theme';
import { formatLegacyConversionCounts, type LegacyConversionDialog } from '../legacyConversionReview';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** 모달 안 포커스 순환. 포커스가 모달 밖(본문 등)이면 Tab은 처음, Shift+Tab은 마지막 요소로 간다. */
function nextFocusIndex(current: number, count: number, backwards: boolean): number {
  if (backwards) return current <= 0 ? count - 1 : current - 1;
  return current === -1 || current === count - 1 ? 0 : current + 1;
}

interface LegacyConversionModalProps {
  dialog: LegacyConversionDialog;
  onConvert: () => void;
  onDecline: () => void;
  onOpenReview: () => void;
  onClose: () => void;
}

const TITLE_ID = 'legacy-conversion-title';

export function LegacyConversionModal({ dialog, onConvert, onDecline, onOpenReview, onClose }: LegacyConversionModalProps) {
  const { report } = dialog;
  const itemCount = report.items.length;
  const blocked = dialog.phase === 'offer' && dialog.structuralErrorCount > 0;
  const extraCounts = [
    report.counts.mergedConnections > 0 ? `holdOnly 연결 합침 ${report.counts.mergedConnections}` : null,
    report.counts.terminalHoldOnlyItemsDropped > 0 ? `사슬 끝 holdOnly로 뺀 구형 점수 항목 ${report.counts.terminalHoldOnlyItemsDropped}` : null,
  ].filter((text): text is string => text !== null);

  const frameRef = useRef<HTMLElement>(null);
  // 렌더 중에 읽어야 autoFocus가 포커스를 옮기기 전의 요소를 잡는다.
  const [returnFocusTo] = useState(() => document.activeElement);

  // 포커스 가두기: Tab·Shift+Tab을 문서 전체에서 받아 모달 안 요소로만 옮긴다.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    // autoFocus할 버튼이 없으면(변환을 막은 화면) 첫 버튼에 포커스를 둔다.
    if (!frame.contains(document.activeElement)) {
      (frame.querySelector<HTMLElement>(FOCUSABLE) ?? frame).focus();
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      event.preventDefault();
      const items = [...frame.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) { frame.focus(); return; }
      const current = items.indexOf(document.activeElement as HTMLElement);
      items[nextFocusIndex(current, items.length, event.shiftKey)].focus();
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, []);

  // 닫히면 열리기 전 포커스로 돌려준다. passive cleanup은 뒤 화면의 inert가 풀린 뒤에 돈다.
  useEffect(() => () => {
    if (returnFocusTo instanceof HTMLElement && returnFocusTo !== document.body && returnFocusTo.isConnected) {
      returnFocusTo.focus({ preventScroll: true });
    }
  }, [returnFocusTo]);

  return (
    <div style={styles.overlay}>
      <section ref={frameRef} role="dialog" aria-modal="true" aria-labelledby={TITLE_ID} tabIndex={-1} style={styles.frame}>
        <h2 id={TITLE_ID} style={styles.title}>
          <span style={primitives.titleAccent} aria-hidden="true" />
          {dialog.phase === 'offer' ? '구형 차트 변환' : '변환 완료'}
        </h2>

        {dialog.phase === 'offer' ? (
          <p style={styles.text}>이 차트에 구형 노트가 있습니다. 탭·바디·릴리즈·틱 노트로 변환할까요?</p>
        ) : (
          <p style={styles.text}>구형 노트를 변환했습니다. 아직 저장하지 않았습니다.</p>
        )}

        <div style={styles.counts} aria-label={dialog.phase === 'offer' ? '변환하면 만들 노트 수' : '변환으로 만든 노트 수'}>
          <span style={styles.countsLabel}>{dialog.phase === 'offer' ? '변환하면' : '변환 결과'}</span>
          <span style={styles.countsValue}>{formatLegacyConversionCounts(report)}</span>
          {dialog.phase === 'result' && extraCounts.length > 0 && (
            <span style={styles.countsExtra}>{extraCounts.join(' · ')}</span>
          )}
        </div>

        {dialog.phase === 'offer' ? (
          <p style={styles.hint}>
            변환은 Undo 한 번으로 되돌릴 수 있고, 저장은 직접 합니다. 구형 그대로 열면 다음에 열 때 다시 묻습니다.
          </p>
        ) : (
          <p style={styles.hint}>
            {itemCount > 0
              ? `검토할 항목 ${itemCount}건은 '변환 검토' 목록에서 위치로 이동해 고칩니다. `
              : '검토할 항목이 없습니다. '}
            확인한 뒤 직접 저장하세요. Undo 한 번이면 구형 차트로 돌아갑니다.
          </p>
        )}

        {blocked && (
          <p role="alert" style={styles.blocked}>
            구조 위반 {dialog.structuralErrorCount}건이 있어 변환할 수 없습니다. 구형 그대로 열어 위반을 고치고 저장한 뒤
            에디터를 다시 열면 변환을 묻습니다.
          </p>
        )}

        {/* 다른 에디터 모달처럼 주 동작을 왼쪽, 물러나는 동작을 오른쪽 끝에 둔다. */}
        <div style={styles.buttons}>
          {dialog.phase === 'offer' ? (
            <>
              <button
                type="button"
                style={{ ...styles.primaryButton, ...(blocked ? styles.disabledButton : {}) }}
                onClick={onConvert}
                disabled={blocked}
                autoFocus={!blocked}
              >
                변환
              </button>
              <button type="button" style={styles.secondaryButton} onClick={onDecline}>구형 그대로 열기</button>
            </>
          ) : (
            <>
              {itemCount > 0 && (
                <button type="button" style={styles.primaryButton} onClick={onOpenReview} autoFocus>
                  검토 목록 열기
                </button>
              )}
              <button
                type="button"
                style={itemCount > 0 ? styles.secondaryButton : { ...styles.primaryButton, marginLeft: 'auto' }}
                onClick={onClose}
                autoFocus={itemCount === 0}
              >
                닫기
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

const styles = {
  // 다른 에디터 모달(modalStyles.overlay)과 같은 층. 바깥을 눌러도 닫지 않는다 — 변환 여부는 버튼으로만 정한다.
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 2000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px',
    backgroundColor: 'rgba(6, 8, 10, 0.68)',
  },
  frame: {
    width: 'min(440px, 100%)',
    maxHeight: 'calc(100dvh - 32px)',
    overflowY: 'auto',
    boxSizing: 'border-box',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    background: surface.panel,
    border: `1px solid ${color.line}`,
    borderRadius: radius.md,
    boxShadow: `${edge.metal}, 0 18px 40px -16px rgba(0, 0, 0, 0.85)`,
    color: color.ink,
    fontFamily: font.body,
    // 한국어 문구가 '1개'·'검토할'처럼 낱말 가운데서 줄바꿈되지 않게 한다.
    wordBreak: 'keep-all',
    overflowWrap: 'anywhere',
  },
  title: {
    margin: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontSize: '18px',
    fontWeight: 700,
    color: color.inkStrong,
  },
  text: {
    margin: 0,
    fontSize: '14px',
    lineHeight: 1.5,
  },
  counts: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: '10px 12px',
    background: surface.card,
    border: `1px solid ${color.line}`,
    borderRadius: radius.sm,
  },
  countsLabel: {
    fontSize: '12px',
    color: color.inkDim,
  },
  countsValue: {
    fontSize: '15px',
    fontWeight: 700,
    color: color.inkStrong,
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 1.45,
  },
  countsExtra: {
    fontSize: '12px',
    color: color.inkDim,
    lineHeight: 1.45,
  },
  hint: {
    margin: 0,
    fontSize: '13px',
    lineHeight: 1.5,
    color: color.inkDim,
  },
  blocked: {
    margin: 0,
    fontSize: '13px',
    lineHeight: 1.5,
    color: color.danger,
  },
  buttons: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    marginTop: '4px',
  },
  primaryButton: {
    ...primitives.neonButton,
    fontFamily: font.body,
  },
  secondaryButton: {
    ...primitives.metalButton,
    fontFamily: font.body,
    marginLeft: 'auto',
  },
  disabledButton: {
    opacity: 0.45,
    cursor: 'not-allowed',
  },
} satisfies Record<string, CSSProperties>;
