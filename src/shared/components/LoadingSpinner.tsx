import type { CSSProperties } from 'react';

type LoadingSpinnerProps = {
  /** 표시할 메시지 (기본: 'Loading...') */
  message?: string;
  /** 메시지 아래 보조 텍스트 */
  sub?: string;
  /** fullscreen: 전체 화면 / overlay: 반투명 오버레이 / inline: 작은 인라인 */
  mode?: 'fullscreen' | 'overlay' | 'inline';
};

export function LoadingSpinner({ message = 'Loading...', sub, mode = 'fullscreen' }: LoadingSpinnerProps) {
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

const styles: Record<string, CSSProperties> = {
  fullscreen: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    width: '100%',
    minHeight: '100dvh',
    backgroundColor: '#1a1a1a',
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
