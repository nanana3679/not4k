import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { font, color, surface } from '../theme';

type LoadingSpinnerProps = {
  /** 표시할 메시지 (기본: 'Loading...') */
  message?: string;
  /** 메시지 아래 보조 텍스트 */
  sub?: string;
};

type LoadingSpinnerMode = 'fullscreen' | 'overlay' | 'inline';
type PageLoadingBackground = 'solid' | 'transparent';

type InternalLoadingSpinnerProps = LoadingSpinnerProps & {
  mode: LoadingSpinnerMode;
  background?: PageLoadingBackground;
};

type PageLoadingProps = LoadingSpinnerProps & {
  background?: PageLoadingBackground;
};

function LoadingSpinner({ message = 'Loading...', sub, mode, background = 'solid' }: InternalLoadingSpinnerProps) {
  const containerStyle: CSSProperties =
    mode === 'overlay'
      ? styles.overlay
      : mode === 'inline'
        ? styles.inline
        : {
            ...styles.fullscreen,
            ...(background === 'transparent' ? styles.fullscreenTransparent : {}),
          };

  return (
    <div style={containerStyle} role="status" aria-live="polite">
      <div style={styles.spinner} />
      <span style={styles.message}>{message}</span>
      {sub && <span style={styles.sub}>{sub}</span>}
    </div>
  );
}

/**
 * Use PageLoading before the page chrome exists.
 * It owns the full viewport and should not be nested inside page layouts.
 */
export function PageLoading(props: PageLoadingProps) {
  const element = <LoadingSpinner {...props} mode="fullscreen" />;
  if (typeof document === 'undefined') return element;
  return createPortal(element, document.body);
}

/**
 * Use OverlayLoading when an existing surface stays visible but is temporarily blocked.
 * The parent must establish the positioning context.
 */
export function OverlayLoading(props: LoadingSpinnerProps) {
  return <LoadingSpinner {...props} mode="overlay" />;
}

/**
 * Use InlineLoading for local, non-blocking slots within an existing layout.
 */
export function InlineLoading(props: LoadingSpinnerProps) {
  return <LoadingSpinner {...props} mode="inline" />;
}

const styles: Record<string, CSSProperties> = {
  fullscreen: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '14px',
    width: '100%',
    minHeight: '100dvh',
    background: surface.screen,
    zIndex: 3000,
    color: color.ink,
    fontFamily: font.body,
    textAlign: 'center',
  },
  fullscreenTransparent: {
    background: 'transparent',
  },
  overlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '14px',
    backgroundColor: 'rgba(6, 8, 10, 0.72)',
    zIndex: 1500,
    color: color.ink,
    fontFamily: font.body,
    textAlign: 'center',
  },
  inline: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '14px',
    width: '100%',
    minHeight: '144px',
    padding: '24px',
    color: color.ink,
    fontFamily: font.body,
    textAlign: 'center',
  },
  spinner: {
    width: '34px',
    height: '34px',
    flexShrink: 0,
    border: `3px solid ${color.line}`,
    // 회전 링 상단에 네온 액센트 — 로딩 순간의 절제된 네온
    borderTop: `3px solid ${color.neon}`,
    borderRadius: '50%',
    boxShadow: `0 0 16px -6px ${color.neonGlow}`,
    animation: 'spin 0.8s linear infinite',
  },
  message: {
    fontFamily: font.display,
    fontSize: '15px',
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: color.ink,
    lineHeight: 1.4,
  },
  sub: {
    fontFamily: font.numeric,
    color: color.inkDim,
    fontSize: '13px',
    letterSpacing: '0.02em',
    lineHeight: 1.4,
  },
};
