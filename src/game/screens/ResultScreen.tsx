import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../stores';
import css from './ResultScreen.module.css';
import arcCss from '../styles/arcade.module.css';

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
      <div className={css.container}>
        <div className={css.header}>
          <h1 className={css.headerTitle}>Result</h1>
          <button className={arcCss.btnGhost} onClick={handleBack}>
            {editorReturnUrl ? 'Back to Editor' : 'Back'}
          </button>
        </div>
        <div className={css.content}>
          <div className={css.error}>No result data</div>
        </div>
      </div>
    );
  }

  return (
    <div className={css.container}>
      <div className={css.header}>
        <h1 className={css.headerTitle}>Result</h1>
        <button className={arcCss.btnGhost} onClick={handleBack}>
          {editorReturnUrl ? 'Back to Editor' : 'Back'}
        </button>
      </div>

      <div className={css.content}>
        {/* Main Score Frame */}
        <div className={css.scoreFrame}>
          <span className={css.achievementLabel}>Achievement</span>
          <div className={css.achievement}>
            {(lastResult.achievementRate ?? 0).toFixed(2)}%
          </div>
          <div className={css.scoreDivider} />
          <div className={css.rank}>{lastResult.rank}</div>
        </div>

        {/* Combo Stats */}
        <div className={css.statsGrid}>
          <div className={css.statRow}>
            <span className={css.statLabel}>Max Combo</span>
            <span className={css.statValue}>{lastResult.maxCombo}</span>
          </div>
          <div className={css.statRow}>
            <span className={css.statLabel}>Full Combo</span>
            <span className={lastResult.isFullCombo ? css.statValueYes : css.statValueNo}>
              {lastResult.isFullCombo ? 'YES!' : 'NO'}
            </span>
          </div>
        </div>

        {/* Judgments */}
        <div className={css.judgmentSection}>
          <h2 className={arcCss.sectionTitle}>Judgments</h2>
          <div className={css.judgmentGrid}>
            {Object.entries(lastResult.judgmentCounts)
              .filter(([grade]) => grade !== 'goodTrill')
              .map(([grade, count]) => (
              <div key={grade} className={css.judgmentRow}>
                <span className={css.judgmentLabel}>{grade.toUpperCase()}</span>
                <span className={css.judgmentCount}>{count}</span>
              </div>
            ))}
            <div className={css.judgmentRow}>
              <span className={css.judgmentLabel}>GOOD◇</span>
              <span className={css.judgmentCount}>{lastResult.goodTrillCount}</span>
            </div>
          </div>
        </div>

        {/* Timing */}
        <div className={css.judgmentSection}>
          <h2 className={arcCss.sectionTitle}>Timing</h2>
          <div className={css.judgmentGrid}>
            <div className={css.judgmentRow}>
              <span className={css.fastLabel}>FAST</span>
              <span className={css.judgmentCount}>{lastResult.fastCount}</span>
            </div>
            <div className={css.judgmentRow}>
              <span className={css.slowLabel}>SLOW</span>
              <span className={css.judgmentCount}>{lastResult.slowCount}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
