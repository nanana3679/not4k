import type { CSSProperties } from 'react';
import { color, font, primitives, radius } from '../../../shared/theme';
import { getTutorialConditionStatus, getTutorialPracticeNextTarget, type TutorialSuccessCondition } from './tutorialPractice';
import type { UnmetTutorialPracticeKeyRequirement } from './tutorialKeyboardLayout';
import type { useTutorialPractice } from './useTutorialPractice';

export function TutorialPracticePanel({ practice, onNextItem, unmetKeyRequirements, onOpenSettings }: {
  practice: ReturnType<typeof useTutorialPractice>;
  onNextItem: () => void;
  unmetKeyRequirements: readonly UnmetTutorialPracticeKeyRequirement[];
  onOpenSettings: () => void;
}) {
  const { state, progress } = practice;
  if (!state || !progress) return null;
  return (
    <div style={styles.panel} data-tutorial-pattern-id={state.highestPatternStartId ?? 0}>
      <div role="group" aria-label="실습 모드" style={styles.modes}>
        {(['directInput', 'demonstration'] as const).map(mode => (
          <button disabled={mode === 'directInput' && unmetKeyRequirements.length > 0}
            aria-describedby={mode === 'directInput' && unmetKeyRequirements.length ? 'tutorial-key-shortage' : undefined}
            key={mode} type="button" aria-pressed={state.mode === mode}
            style={{ ...styles.toggle, ...(state.mode === mode ? styles.selected : {}),
              ...(mode === 'directInput' && unmetKeyRequirements.length ? styles.disabled : {}) }}
            onClick={() => practice.dispatch({ type: 'modeSelected', mode })}>
            {mode === 'directInput' ? '직접 입력' : '시연'}
          </button>
        ))}
      </div>
      {unmetKeyRequirements.length > 0 && (
        <div id="tutorial-key-shortage" style={styles.shortage}>
          {unmetKeyRequirements.map(({ lane, requiredKeyCount, boundKeyCount }) => (
            <p key={lane} style={{ margin: '8px 0' }}>{`${lane}번 레인에 키가 ${requiredKeyCount}개 필요하지만 ${boundKeyCount}개만 설정되어 있습니다`}</p>
          ))}
          <button type="button" style={styles.toggle} onClick={onOpenSettings}>키 설정</button>
        </div>
      )}
      {state.mode === 'directInput' && (
        <div style={styles.feedback} aria-label="실습 조건">
          <div style={styles.combo}>{`콤보 ${practice.combo}`}</div>
          {state.spec.conditions.map(condition => {
            const status = practice.score ? getTutorialConditionStatus(condition, practice.score) : 'neutral';
            const label = getConditionLabel(condition);
            return (
              <div key={condition.kind} data-tutorial-condition={condition.kind} data-tutorial-condition-status={status}
                style={{ color: status === 'met' ? '#8ee6a8' : status === 'failed' ? '#ff8b8b' : '#ffffff' }}>
                <span aria-label={status === 'met' ? '충족' : status === 'failed' ? '실패' : '진행 중'} style={styles.icon}>
                  {status === 'met' ? '✓' : status === 'failed' ? '✕' : '·'}
                </span>{label}
              </div>
            );
          })}
        </div>
      )}
      <div data-tutorial-progress={`${progress.current}/${progress.required}`} style={styles.progress} aria-live="polite">
        {progress.current}/{progress.required}
      </div>
      {getTutorialPracticeNextTarget(state) && (
        <button type="button" style={styles.next} onClick={() => {
          if (getTutorialPracticeNextTarget(state) === 'nextItem') onNextItem();
          else practice.dispatch({ type: 'nextPressed' });
        }}>다음</button>
      )}
    </div>
  );
}

function getConditionLabel(condition: TutorialSuccessCondition): string {
  switch (condition.kind) {
    case 'maxGreatOrWorseCount':
      return `Great 이하 ${condition.count}개 이하`;
    case 'maxMissCount':
      return condition.count === 0 ? 'Miss 0회' : `Miss ${condition.count}회 이하`;
    case 'maxGoodTrillCount':
      return condition.count === 0 ? 'goodTrill 0회' : `goodTrill ${condition.count}회 이하`;
  }
}

const styles: Record<string, CSSProperties> = {
  disabled: { color: color.inkDim, borderColor: color.line, background: 'transparent', cursor: 'not-allowed' },
  shortage: { color: color.ink, fontSize: 13, lineHeight: 1.5, textAlign: 'center' },
  next: { ...primitives.neonButton, display: 'block', minHeight: 44, margin: '12px auto 0', padding: '8px 24px' },
  panel: { width: '100%', maxWidth: 520, marginBottom: 12 },
  modes: { display: 'flex', justifyContent: 'center', gap: 8 },
  toggle: { ...primitives.ghostButton, minHeight: 44, padding: '8px 18px', borderRadius: radius.sm, fontFamily: font.body },
  selected: { color: color.ink, borderColor: color.neon, background: 'rgba(126, 224, 233, 0.12)' },
  feedback: { marginTop: 12, textAlign: 'center', fontFamily: font.body, fontSize: 13, lineHeight: 1.6 },
  combo: { color: color.ink, fontFamily: font.numeric, fontSize: 20, fontWeight: 700, marginBottom: 4 },
  icon: { display: 'inline-block', width: 20, fontWeight: 700 },
  progress: { color: color.ink, fontFamily: font.numeric, fontSize: 18, marginTop: 4, textAlign: 'center' },
};
