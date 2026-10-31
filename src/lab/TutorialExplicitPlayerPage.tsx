import { useState } from 'react';
import { Link } from 'react-router-dom';
import { TutorialPreviewPlayer } from '../game/screens/songSelect/TutorialPreviewPlayer';
import type { ExplicitTutorialPatternResult, TutorialInputMode } from '../game/screens/songSelect/explicitTutorialPreviewPlayback';
import { tutorialExplicitPlayerPreviews } from './tutorialExplicitPlayerPreviews';
import './TutorialExplicitPlayerPage.css';

interface PatternStats {
  readonly previewId: string;
  readonly finished: number;
  readonly started: number;
  readonly last: ExplicitTutorialPatternResult | null;
}

/** 곡 선택 튜토리얼 재생기(`TutorialPreviewPlayer`)가 명시 정의를 명시 판정 엔진으로 반복 재생하는지 확인하는 Lab. */
export default function TutorialExplicitPlayerPage() {
  const [inputMode, setInputMode] = useState<TutorialInputMode>('demonstration');
  const [selectedId, setSelectedId] = useState(tutorialExplicitPlayerPreviews[0].preview.id);
  const [stats, setStats] = useState<PatternStats>({ previewId: selectedId, started: 0, finished: 0, last: null });
  const selected = tutorialExplicitPlayerPreviews.find(({ preview }) => preview.id === selectedId)
    ?? tutorialExplicitPlayerPreviews[0];
  const selectedPreviewId = selected.preview.id;
  // 시연을 바꾸는 사이 이전 시연의 반복이 끝나도 새 시연의 기록에 섞이지 않게 시연 id로 거른다.
  // 재생기는 콜백을 ref로 들고 있어 함수 identity가 바뀌어도 다시 걸지 않는다.
  const handlePatternFinished = (pattern: ExplicitTutorialPatternResult) => {
    setStats((current) => current.previewId === selectedPreviewId
      ? { ...current, finished: current.finished + 1, last: pattern }
      : current);
  };
  const handlePatternStarted = () => {
    setStats(current => current.previewId === selectedPreviewId
      ? { ...current, started: current.started + 1 } : current);
  };
  const select = (previewId: string) => {
    if (previewId === selectedPreviewId) return;
    setSelectedId(previewId);
    setStats({ previewId, started: 0, finished: 0, last: null });
  };
  const score = stats.last?.result.score;

  return (
    <main className="tutorial-explicit-player-lab" data-lab-page="tutorial-explicit-player" data-selected-preview={selectedPreviewId}>
      <header className="tutorial-explicit-player-lab__header">
        <Link to="/lab">← Lab 목록</Link>
        <h1>명시 튜토리얼 재생기</h1>
        <p>
          곡 선택 튜토리얼의 축소 재생기에 명시 노트 정의를 걸어 명시 판정 엔진으로 반복합니다.
          직접 입력으로 바꾸면 현재 키 설정으로 연주할 수 있습니다. 판정 창은 고정 기본값입니다.
          아래 시연은 이 Lab에서만 쓰는 예시이며 곡 선택 튜토리얼 목록은 바꾸지 않습니다.
        </p>
      </header>

      <div className="tutorial-explicit-player-lab__layout">
        <section className="tutorial-explicit-player-lab__stage" aria-label="명시 튜토리얼 재생기">
          <TutorialPreviewPlayer
            preview={selected.preview}
            inputMode={inputMode}
            onPatternStarted={handlePatternStarted}
            onPatternFinished={handlePatternFinished}
          />
        </section>

        <section className="tutorial-explicit-player-lab__panel" aria-label="시연 선택과 반복 결과">
          <label>
            <input
              type="checkbox"
              role="switch"
              aria-label="직접 입력 / 시연"
              checked={inputMode === 'directInput'}
              onChange={() => setInputMode(mode => mode === 'demonstration' ? 'directInput' : 'demonstration')}
            />
            {' 직접 입력 / 시연 — '}{inputMode === 'directInput' ? '직접 입력' : '시연'}
          </label>
          <p>전환은 즉시 적용합니다. 성공 횟수·통과 조건은 집계하지 않습니다.</p>
          <div className="tutorial-explicit-player-lab__choices" role="group" aria-label="시연 선택">
            {tutorialExplicitPlayerPreviews.map(({ preview }) => (
              <button
                key={preview.id}
                type="button"
                aria-pressed={preview.id === selectedPreviewId}
                onClick={() => select(preview.id)}
              >
                {preview.title}
              </button>
            ))}
          </div>
          {selected.preview.bodyLines.map((line) => <p key={line}>{line}</p>)}
          <dl
            className="tutorial-explicit-player-lab__result"
            data-started-patterns={stats.started}
            data-input-mode={inputMode}
            data-finished-patterns={stats.finished}
            data-expected-perfect={selected.expectedPerfectCount}
            data-last-iteration={stats.last?.iteration ?? ''}
            data-last-perfect={score?.judgmentCounts.perfect ?? ''}
            data-last-miss={score?.judgmentCounts.miss ?? ''}
          >
            <div><dt>시작한 패턴</dt><dd>{stats.started}회</dd></div>
            <div><dt>끝난 패턴</dt><dd>{stats.finished}회</dd></div>
            <div><dt>시연 기대 결과</dt><dd>반복마다 Perfect {selected.expectedPerfectCount}</dd></div>
            <div>
              <dt>마지막 패턴</dt>
              <dd>
                {score
                  ? `반복 ${stats.last!.iteration} · Perfect ${score.judgmentCounts.perfect} · Great ${score.judgmentCounts.great}`
                    + ` · Good ${score.judgmentCounts.good} · Miss ${score.judgmentCounts.miss}`
                    + ` · 점수 ${score.earnedScore} / ${score.maxPossibleScore}`
                  : '첫 반복이 끝나면 표시합니다'}
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </main>
  );
}
