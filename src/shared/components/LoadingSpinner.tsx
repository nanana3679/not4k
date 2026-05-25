import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';

type LoadingSpinnerProps = {
  /** 표시할 메시지 (기본: 'Loading...') */
  message?: string;
  /** 메시지 아래 보조 텍스트 */
  sub?: string;
};

type LoadingSpinnerMode = 'fullscreen' | 'overlay' | 'inline';

type InternalLoadingSpinnerProps = LoadingSpinnerProps & {
  mode: LoadingSpinnerMode;
};

function LoadingSpinner({ message = 'Loading...', sub, mode }: InternalLoadingSpinnerProps) {
  const containerStyle: CSSProperties =
    mode === 'overlay'
      ? styles.overlay
      : mode === 'inline'
        ? styles.inline
        : styles.fullscreen;

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
export function PageLoading(props: LoadingSpinnerProps) {
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
    gap: '12px',
    width: '100%',
    minHeight: '100dvh',
    backgroundColor: '#1a1a1a',
    zIndex: 3000,
    color: '#ccc',
    fontFamily: 'system-ui, sans-serif',
    textAlign: 'center',
  },
  overlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    backgroundColor: 'rgba(0,0,0,0.7)',
    zIndex: 1500,
    color: '#ccc',
    textAlign: 'center',
  },
  inline: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    width: '100%',
    minHeight: '144px',
    padding: '24px',
    color: '#ccc',
    textAlign: 'center',
  },
  spinner: {
    width: '32px',
    height: '32px',
    flexShrink: 0,
    border: '3px solid #555',
    borderTop: '3px solid #4488ff',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  message: {
    color: '#ccc',
    fontSize: '14px',
    lineHeight: 1.4,
  },
  sub: {
    color: '#888',
    fontSize: '13px',
    lineHeight: 1.4,
  },
};
