import { useGameStore } from '../stores';

export function ResultScreen() {
  const { lastResult, setScreen } = useGameStore();

  if (!lastResult) {
    return (
      <div style={styles.container}>
        <div style={styles.error}>No result data</div>
        <button style={styles.button} onClick={() => setScreen('songSelect')}>
          Back to Song Select
        </button>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Result</h1>

      <div style={styles.mainStats}>
        <div style={styles.achievement}>
          {lastResult.achievementRate.toFixed(2)}%
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
          {Object.entries(lastResult.judgmentCounts).map(([grade, count]) => (
            <div key={grade} style={styles.judgmentRow}>
              <span style={styles.judgmentLabel}>{grade.toUpperCase()}:</span>
              <span style={styles.judgmentCount}>{count}</span>
            </div>
          ))}
          <div style={styles.judgmentRow}>
            <span style={styles.judgmentLabel}>Good◇:</span>
            <span style={styles.judgmentCount}>{lastResult.goodTrillCount}</span>
          </div>
        </div>
      </div>

      <button style={styles.button} onClick={() => setScreen('songSelect')}>
        Back to Song Select
      </button>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    padding: '32px',
    minHeight: '100vh',
    backgroundColor: '#1a1a1a',
    color: '#ffffff',
  },
  title: {
    fontSize: '48px',
    marginBottom: '32px',
  },
  mainStats: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '16px',
    marginBottom: '32px',
  },
  achievement: {
    fontSize: '64px',
    fontWeight: 'bold',
    color: '#00ffff',
  },
  rank: {
    fontSize: '48px',
    fontWeight: 'bold',
    color: '#ffff00',
  },
  statsGrid: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
    marginBottom: '32px',
    width: '400px',
  },
  statRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '20px',
    padding: '8px',
    backgroundColor: '#2a2a2a',
    borderRadius: '4px',
  },
  judgmentSection: {
    marginBottom: '32px',
  },
  subtitle: {
    fontSize: '32px',
    marginBottom: '16px',
    textAlign: 'center' as const,
  },
  judgmentGrid: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
    width: '400px',
  },
  judgmentRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '18px',
    padding: '8px',
    backgroundColor: '#2a2a2a',
    borderRadius: '4px',
  },
  judgmentLabel: {
    fontWeight: 'bold',
  },
  judgmentCount: {
    color: '#00ffff',
  },
  button: {
    fontSize: '18px',
    padding: '12px 24px',
    backgroundColor: '#00ffff',
    color: '#1a1a1a',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
  error: {
    fontSize: '24px',
    color: '#ff4444',
    marginBottom: '24px',
  },
};
