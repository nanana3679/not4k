import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../stores';
import { font, color, surface, edge, radius, primitives } from '../../shared/theme';

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
          <h1 style={styles.title}>
          <span style={styles.titleAccent} aria-hidden="true" />
          Result
        </h1>
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
        <h1 style={styles.title}>
          <span style={styles.titleAccent} aria-hidden="true" />
          Result
        </h1>
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
              <span style={{ ...styles.judgmentLabel, color: '#4a95e6' }}>FAST:</span>
              <span style={styles.judgmentCount}>{lastResult.fastCount}</span>
            </div>
            <div style={styles.judgmentRow}>
              <span style={{ ...styles.judgmentLabel, color: color.danger }}>SLOW:</span>
              <span style={styles.judgmentCount}>{lastResult.slowCount}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: primitives.screen,
  header: primitives.header,
  title: primitives.title,
  titleAccent: primitives.titleAccent,
  backBtn: primitives.ghostButton,
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
    gap: '4px',
    marginBottom: '28px',
  },
  achievement: {
    fontFamily: font.numeric,
    fontSize: '56px',
    fontWeight: 700,
    lineHeight: 1,
    letterSpacing: '0.01em',
    color: color.neon,
    textShadow: `0 0 24px ${color.neonGlow}`,
  },
  rank: {
    fontFamily: font.display,
    fontSize: '34px',
    fontWeight: 800,
    letterSpacing: '0.04em',
    color: color.gold,
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
    fontSize: '15px',
    padding: '10px 14px',
    background: surface.card,
    border: `1px solid ${color.line}`,
    borderRadius: radius.sm,
    boxShadow: edge.metal,
  },
  judgmentSection: {
    marginBottom: '24px',
    maxWidth: '400px',
    width: '100%',
  },
  subtitle: {
    fontFamily: font.display,
    fontSize: '13px',
    fontWeight: 700,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: color.inkDim,
    textAlign: 'center',
    margin: '0 0 10px',
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
    padding: '10px 14px',
    background: surface.card,
    border: `1px solid ${color.line}`,
    borderRadius: radius.sm,
    boxShadow: edge.metal,
  },
  judgmentLabel: {
    fontFamily: font.display,
    fontWeight: 700,
    letterSpacing: '0.02em',
  },
  judgmentCount: {
    fontFamily: font.numeric,
    fontSize: '17px',
    fontWeight: 700,
    color: color.neon,
  },
  error: {
    fontSize: '16px',
    color: color.danger,
    marginTop: '40px',
  },
};
