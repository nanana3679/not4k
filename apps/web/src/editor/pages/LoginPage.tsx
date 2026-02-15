import { useState } from 'react';

export function LoginPage({ onSignIn }: {
  onSignIn: () => Promise<void>;
}) {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setError('');
    setLoading(true);
    try {
      await onSignIn();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>not4k Editor</h1>

        {error && <div style={styles.error}>{error}</div>}

        <button
          style={{ ...styles.button, opacity: loading ? 0.5 : 1 }}
          onClick={handleClick}
          disabled={loading}
        >
          {loading ? 'Redirecting...' : 'Sign in with Google'}
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    backgroundColor: '#1a1a1a',
    color: '#e0e0e0',
    fontFamily: 'system-ui, sans-serif',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    padding: '32px',
    backgroundColor: '#2a2a2a',
    border: '1px solid #555',
    borderRadius: '8px',
    minWidth: '320px',
    alignItems: 'center',
  },
  title: {
    margin: '0 0 8px',
    fontSize: '20px',
    fontWeight: 600,
  },
  error: {
    padding: '8px',
    backgroundColor: 'rgba(200, 50, 50, 0.2)',
    border: '1px solid #a33',
    borderRadius: '4px',
    color: '#f88',
    fontSize: '13px',
    width: '100%',
    boxSizing: 'border-box',
  },
  button: {
    padding: '10px 24px',
    backgroundColor: '#4488ff',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 500,
    width: '100%',
  },
};
