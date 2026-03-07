import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../stores';

export function ResultScreen() {
  const { lastResult, setScreen, editorReturnUrl, setEditorReturnUrl, setStartTimeMs } = useGameStore();
  const navigate = useNavigate();

  const handleBack = () => {
    if (editorReturnUrl) {
      const url = editorReturnUrl;
      setStartTimeMs(0);
      setEditorReturnUrl(null);
      navigate(url);
    } else {
      setScreen('songSelect');
    }
  };

  if (!lastResult) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <h1 style={styles.title}>Result</h1>
          <button style={styles.backBtn} onClick={handleBack}>
            {editorReturnUrl ? 'Back to Editor' : 'Back'}
          </button>
        </div>
        <div style={styles.content}>
          <div style={styles.error}>No result data</div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Result</h1>
        <button style={styles.backBtn} onClick={handleBack}>
          {editorReturnUrl ? 'Back to Editor' : 'Back'}
        </button>
      </div>

      <div style={styles.content}>
        <div style={styles.mainStats}>
          <div style={styles.achievement}>
            {(lastResult.achievementRate ?? 0).toFixed(2)}%
          </div>
          <div style={styles.rank}>{lastResult.rank}</div>
        </div>

        <div style={styles.statsGrid}>
          <div style={styles.statRow}>
            <span>Max Combo:</span>
            <span>{lastResult.maxCombo}</span>
          </div>
          <div style={styles.statRow}>
            <span>Full Combo:</span>
            <span>{lastResult.isFullCombo ? 'YES' : 'NO'}</span>
          </div>
        </div>

        <div style={styles.judgmentSection}>
          <h2 style={styles.subtitle}>Judgments</h2>
          <div style={styles.judgmentGrid}>
            {Object.entries(lastResult.judgmentCounts)
              .filter(([grade]) => grade !== 'goodTrill')
              .map(([grade, count]) => (
              <div key={grade} style={styles.judgmentRow}>
                <span style={styles.judgmentLabel}>{grade.toUpperCase()}:</span>
                <span style={styles.judgmentCount}>{count}</span>
              </div>
            ))}
            <div style={styles.judgmentRow}>
              <span style={styles.judgmentLabel}>GOOD◇:</span>
              <span style={styles.judgmentCount}>{lastResult.goodTrillCount}</span>
            </div>
          </div>
        </div>

        <div style={styles.judgmentSection}>
          <h2 style={styles.subtitle}>Timing</h2>
          <div style={styles.judgmentGrid}>
            <div style={styles.judgmentRow}>
              <span style={{ ...styles.judgmentLabel, color: '#44aaff' }}>FAST:</span>
              <span style={styles.judgmentCount}>{lastResult.fastCount}</span>
            </div>
            <div style={styles.judgmentRow}>
              <span style={{ ...styles.judgmentLabel, color: '#ff6644' }}>SLOW:</span>
              <span style={styles.judgmentCount}>{lastResult.slowCount}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
    color: '#e0e0e0',
    fontFamily: 'system-ui, sans-serif',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 24px',
    backgroundColor: '#2a2a2a',
    borderBottom: '1px solid #333',
  },
  title: {
    margin: 0,
    fontSize: '20px',
    fontWeight: 600,
  },
  backBtn: {
    padding: '6px 16px',
    backgroundColor: 'transparent',
    color: '#888',
    border: '1px solid #444',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '13px',
  },
  content: {
    flex: 1,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '24px',
  },
  mainStats: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '24px',
  },
  achievement: {
    fontSize: '40px',
    fontWeight: 'bold',
    color: '#00ffff',
  },
  rank: {
    fontSize: '32px',
    fontWeight: 'bold',
    color: '#ffff00',
  },
  statsGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginBottom: '24px',
    maxWidth: '400px',
    width: '100%',
  },
  statRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '16px',
    padding: '8px',
    backgroundColor: '#2a2a2a',
    border: '1px solid #333',
    borderRadius: '6px',
  },
  judgmentSection: {
    marginBottom: '24px',
    maxWidth: '400px',
    width: '100%',
  },
  subtitle: {
    fontSize: '16px',
    fontWeight: 600,
    marginBottom: '8px',
    textAlign: 'center',
    margin: '0 0 8px',
  },
  judgmentGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  judgmentRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '15px',
    padding: '8px',
    backgroundColor: '#2a2a2a',
    border: '1px solid #333',
    borderRadius: '6px',
  },
  judgmentLabel: {
    fontWeight: 'bold',
  },
  judgmentCount: {
    color: '#00ffff',
  },
  error: {
    fontSize: '18px',
    color: '#ff4444',
    marginTop: '40px',
  },
};
