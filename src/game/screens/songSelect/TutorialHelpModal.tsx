import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useGameStore } from '../../stores';
import { TutorialPreviewPlayer } from './TutorialPreviewPlayer';
import {
  TUTORIAL_OPPOSITE_HAND_BODY_LINE,
  TUTORIAL_PREVIEWS,
  type TutorialPreviewDefinition,
} from './tutorialPreviewChart';
import { getTutorialKeyboardLabel, type TutorialKeyBindings } from './tutorialKeyboardLayout';
import {
  canShowTutorialCacheInvalidationButton,
  clearTutorialViewedIds,
  persistTutorialViewedIds,
  readTutorialViewedIdsFromStorage,
} from './tutorialViewedCache';

interface TutorialHelpModalProps {
  onClose: () => void;
  isAdmin?: boolean;
}

const TUTORIAL_PAGE_TRANSITION_MS = 260;
const TUTORIAL_MODAL_CLOSE_MS = 120;

type TutorialPageTransitionDirection = 'forward' | 'backward';
type TutorialPageTransitionPhase = 'preparing' | 'animating';
type TutorialPreviewSlotId = 0 | 1;
type TutorialPreviewSlotState = 'active' | 'standby' | 'exiting' | 'entering';

interface TutorialPlayerTransition {
  fromIndex: number;
  toIndex: number;
  fromSlot: TutorialPreviewSlotId;
  toSlot: TutorialPreviewSlotId;
  fromSlotInstanceId: number;
  toSlotInstanceId: number;
  direction: TutorialPageTransitionDirection;
  phase: TutorialPageTransitionPhase;
}

function getTutorialViewedStorage(): Storage | null {
  if (typeof window === 'undefined') return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function TutorialHelpModal({ onClose, isAdmin = false }: TutorialHelpModalProps) {
  const [tutorialIndex, setTutorialIndex] = useState(0);
  const [visiblePlayerIndex, setVisiblePlayerIndex] = useState(0);
  const [activePlayerSlot, setActivePlayerSlot] = useState<TutorialPreviewSlotId>(0);
  const [previewSlotIndexes, setPreviewSlotIndexes] = useState<readonly [number, number]>(() => [0, 0]);
  const [previewSlotInstanceIds, setPreviewSlotInstanceIds] = useState<readonly [number, number]>(() => [0, 0]);
  const [playerTransition, setPlayerTransition] = useState<TutorialPlayerTransition | null>(null);
  const [playerTransitionProgress, setPlayerTransitionProgress] = useState(0);
  const [readyPreviewSlotKeys, setReadyPreviewSlotKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [isClosing, setIsClosing] = useState(false);
  const transitionFrameIdsRef = useRef<number[]>([]);
  const closeTimeoutRef = useRef<number | null>(null);
  const nextPreviewSlotInstanceIdRef = useRef(1);
  const [textTransitionDirection, setTextTransitionDirection] =
    useState<TutorialPageTransitionDirection>('forward');
  const [viewedTutorialIds, setViewedTutorialIds] = useState<ReadonlySet<string>>(
    () => readTutorialViewedIdsFromStorage(getTutorialViewedStorage()),
  );
  const settings = useGameStore((state) => state.settings);
  const currentTutorial = TUTORIAL_PREVIEWS[tutorialIndex] ?? TUTORIAL_PREVIEWS[0];
  const bodyLines = currentTutorial.bodyLines.map((line) =>
    line === TUTORIAL_OPPOSITE_HAND_BODY_LINE
      ? getOppositeHandPlacementLine(settings.preset, settings.keyBindings)
      : line,
  );
  const activePreviewInstanceId = previewSlotInstanceIds[activePlayerSlot] ?? 0;
  const activePreviewReady = readyPreviewSlotKeys.has(
    getTutorialPreviewSlotReadyKey(activePlayerSlot, visiblePlayerIndex, activePreviewInstanceId),
  );
  const isPlayerDriverVisible = activePreviewReady && !isClosing;
  const canInvalidateViewedCache = canShowTutorialCacheInvalidationButton({
    isAdmin,
    isDev: import.meta.env.DEV,
  });

  const cancelScheduledTransitionStart = useCallback(() => {
    for (const frameId of transitionFrameIdsRef.current) {
      window.cancelAnimationFrame(frameId);
    }
    transitionFrameIdsRef.current = [];
  }, []);

  const goToTutorialIndex = useCallback((nextIndex: number, directionOverride?: TutorialPageTransitionDirection) => {
    const normalizedIndex = normalizeTutorialIndex(nextIndex);
    const nextTutorial = TUTORIAL_PREVIEWS[normalizedIndex] ?? TUTORIAL_PREVIEWS[0];
    const sourcePlayerIndex = playerTransition?.toIndex ?? visiblePlayerIndex;
    const sourcePlayerSlot = playerTransition?.toSlot ?? activePlayerSlot;
    const sourcePlayerInstanceId =
      playerTransition?.toSlotInstanceId ?? previewSlotInstanceIds[sourcePlayerSlot] ?? 0;
    const direction = directionOverride ?? getTutorialTransitionDirection(tutorialIndex, normalizedIndex);
    const nextSlot = getStandbyTutorialPreviewSlot(sourcePlayerSlot);

    cancelScheduledTransitionStart();
    setTutorialIndex(normalizedIndex);
    setTextTransitionDirection(direction);
    if (normalizedIndex === sourcePlayerIndex) {
      setPlayerTransitionProgress(0);
      if (!playerTransition) {
        setPlayerTransition(null);
      }
    } else {
      const nextSlotInstanceId = nextPreviewSlotInstanceIdRef.current++;
      setPlayerTransitionProgress(0);
      setPreviewSlotIndexes((previous) => {
        const next: [number, number] = [previous[0], previous[1]];
        next[nextSlot] = normalizedIndex;
        return next;
      });
      setPreviewSlotInstanceIds((previous) => {
        const next: [number, number] = [previous[0], previous[1]];
        next[nextSlot] = nextSlotInstanceId;
        return next;
      });
      setPlayerTransition({
        fromIndex: sourcePlayerIndex,
        toIndex: normalizedIndex,
        fromSlot: sourcePlayerSlot,
        toSlot: nextSlot,
        fromSlotInstanceId: sourcePlayerInstanceId,
        toSlotInstanceId: nextSlotInstanceId,
        direction,
        phase: 'preparing',
      });
    }
    setViewedTutorialIds((previous) => {
      if (previous.has(nextTutorial.id)) return previous;
      const next = new Set(previous);
      next.add(nextTutorial.id);
      return next;
    });
  }, [
    activePlayerSlot,
    cancelScheduledTransitionStart,
    playerTransition,
    previewSlotInstanceIds,
    tutorialIndex,
    visiblePlayerIndex,
  ]);

  const goToPreviousTutorial = useCallback(() => {
    goToTutorialIndex(tutorialIndex - 1, 'backward');
  }, [goToTutorialIndex, tutorialIndex]);

  const goToNextTutorial = useCallback(() => {
    goToTutorialIndex(tutorialIndex + 1, 'forward');
  }, [goToTutorialIndex, tutorialIndex]);

  const requestClose = useCallback(() => {
    if (isClosing) return;

    setIsClosing(true);
    cancelScheduledTransitionStart();
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current);
    }
    closeTimeoutRef.current = window.setTimeout(() => {
      closeTimeoutRef.current = null;
      onClose();
    }, getTutorialModalCloseDurationMs());
  }, [cancelScheduledTransitionStart, isClosing, onClose]);

  const resetViewedTutorialCache = useCallback(() => {
    clearTutorialViewedIds(getTutorialViewedStorage());
    setViewedTutorialIds(new Set([TUTORIAL_PREVIEWS[0].id]));
  }, []);

  useEffect(() => {
    persistTutorialViewedIds(getTutorialViewedStorage(), viewedTutorialIds);
  }, [viewedTutorialIds]);

  const handlePreviewSlotReady = useCallback((
    readySlotId: TutorialPreviewSlotId,
    readyIndex: number,
    readyInstanceId: number,
  ) => {
    const readyKey = getTutorialPreviewSlotReadyKey(readySlotId, readyIndex, readyInstanceId);
    setReadyPreviewSlotKeys((previous) => {
      if (previous.has(readyKey)) return previous;
      const next = new Set(previous);
      next.add(readyKey);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!playerTransition || playerTransition.phase !== 'preparing') {
      return;
    }

    const readyKey = getTutorialPreviewSlotReadyKey(
      playerTransition.toSlot,
      playerTransition.toIndex,
      playerTransition.toSlotInstanceId,
    );
    if (!readyPreviewSlotKeys.has(readyKey)) {
      return;
    }

    cancelScheduledTransitionStart();
    const firstFrameId = window.requestAnimationFrame(() => {
      const secondFrameId = window.requestAnimationFrame(() => {
        transitionFrameIdsRef.current = [];
        setPlayerTransition((transition) => {
          if (
            !transition
            || transition.toSlot !== playerTransition.toSlot
            || transition.toIndex !== playerTransition.toIndex
            || transition.toSlotInstanceId !== playerTransition.toSlotInstanceId
            || transition.phase === 'animating'
          ) {
            return transition;
          }

          return {
            ...transition,
            phase: 'animating',
          };
        });
      });

      transitionFrameIdsRef.current = [secondFrameId];
    });

    transitionFrameIdsRef.current = [firstFrameId];

    return cancelScheduledTransitionStart;
  }, [cancelScheduledTransitionStart, playerTransition, readyPreviewSlotKeys]);

  useEffect(() => {
    if (!playerTransition || playerTransition.phase !== 'animating') return;

    const timeoutId = window.setTimeout(() => {
      setVisiblePlayerIndex(playerTransition.toIndex);
      setActivePlayerSlot(playerTransition.toSlot);
      setPlayerTransition((transition) => (
        transition
        && transition.fromIndex === playerTransition.fromIndex
        && transition.toIndex === playerTransition.toIndex
        && transition.toSlot === playerTransition.toSlot
        && transition.toSlotInstanceId === playerTransition.toSlotInstanceId
          ? null
          : transition
      ));
    }, getTutorialTransitionDurationMs());

    return () => window.clearTimeout(timeoutId);
  }, [playerTransition]);

  useEffect(() => {
    if (!playerTransition || playerTransition.phase !== 'animating') {
      setPlayerTransitionProgress(0);
      return;
    }

    let animationFrameId: number | null = null;
    const durationMs = getTutorialTransitionDurationMs();
    const startMs = performance.now();

    const step = (now: number) => {
      const elapsedRatio = durationMs <= 1 ? 1 : Math.min(1, (now - startMs) / durationMs);
      setPlayerTransitionProgress(getEaseOutQuintProgress(elapsedRatio));

      if (elapsedRatio < 1) {
        animationFrameId = window.requestAnimationFrame(step);
      }
    };

    animationFrameId = window.requestAnimationFrame(step);

    return () => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }
    };
  }, [playerTransition]);

  useEffect(() => {
    return () => {
      cancelScheduledTransitionStart();
      if (closeTimeoutRef.current !== null) {
        window.clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = null;
      }
    };
  }, [cancelScheduledTransitionStart]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        requestClose();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goToPreviousTutorial();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        goToNextTutorial();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToNextTutorial, goToPreviousTutorial, requestClose]);

  return (
    <div
      className="not4k-tutorial-overlay"
      style={tutorialHelpStyles.overlay}
      data-tutorial-modal-state={isClosing ? 'closing' : 'open'}
      onMouseDown={requestClose}
    >
      <style>{tutorialHelpCss}</style>
      <section
        className="not4k-tutorial-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tutorial-help-title"
        style={tutorialHelpStyles.modal}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header style={tutorialHelpStyles.header}>
          <div>
            <h2 id="tutorial-help-title" style={tutorialHelpStyles.title}>
              Tutorial
            </h2>
            <p style={tutorialHelpStyles.subtitle}>{currentTutorial.title}</p>
          </div>
          <div style={tutorialHelpStyles.headerControls}>
            <button
              type="button"
              style={tutorialHelpStyles.arrowButton}
              onClick={goToPreviousTutorial}
              aria-label="Previous tutorial"
              title="Previous"
            >
              <span aria-hidden="true">←</span>
            </button>
            <span style={tutorialHelpStyles.pageIndicator} aria-label={`Tutorial ${tutorialIndex + 1} of ${TUTORIAL_PREVIEWS.length}`}>
              {tutorialIndex + 1} / {TUTORIAL_PREVIEWS.length}
            </span>
            <button
              type="button"
              style={tutorialHelpStyles.arrowButton}
              onClick={goToNextTutorial}
              aria-label="Next tutorial"
              title="Next"
            >
              <span aria-hidden="true">→</span>
            </button>
            {canInvalidateViewedCache && (
              <button
                type="button"
                style={tutorialHelpStyles.resetCacheButton}
                onClick={resetViewedTutorialCache}
                data-tutorial-reset-viewed-cache="true"
                aria-label="Reset tutorial viewed cache"
                title="Reset tutorial viewed cache"
              >
                Reset Viewed
              </button>
            )}
            <button
              type="button"
              style={tutorialHelpStyles.closeButton}
              onClick={requestClose}
              aria-label="Close tutorial help"
            >
              Close
            </button>
          </div>
        </header>

        <div className="not4k-tutorial-content-layout" style={tutorialHelpStyles.contentLayout}>
          <nav
            className="not4k-tutorial-index"
            style={tutorialHelpStyles.indexNav}
            aria-label="Tutorial index"
          >
            {TUTORIAL_PREVIEWS.map((tutorial, index) => {
              const isCurrent = index === tutorialIndex;
              const isSeen = viewedTutorialIds.has(tutorial.id);
              return (
                <button
                  key={tutorial.id}
                  type="button"
                  className="not4k-tutorial-index-item"
                  style={{
                    ...tutorialHelpStyles.indexButton,
                    ...(isCurrent ? tutorialHelpStyles.indexButtonCurrent : {}),
                  }}
                  onClick={() => goToTutorialIndex(index)}
                  aria-current={isCurrent ? 'step' : undefined}
                  data-tutorial-index-item={tutorial.id}
                  data-tutorial-index-current={isCurrent ? 'true' : 'false'}
                  data-tutorial-index-seen={isSeen ? 'true' : 'false'}
                >
                  <span style={tutorialHelpStyles.indexNumber}>{index}</span>
                  <span style={tutorialHelpStyles.indexTitle}>{tutorial.title}</span>
                  {isSeen && (
                    <span
                      aria-label="Viewed tutorial"
                      data-tutorial-index-check="true"
                      style={tutorialHelpStyles.indexCheck}
                    >
                      ✓
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          <div className="not4k-tutorial-player-column" style={tutorialHelpStyles.playerColumn}>
            <div
              className="not4k-tutorial-carousel-card"
              style={tutorialHelpStyles.carouselCard}
              data-tutorial-driver-visible={isPlayerDriverVisible ? 'true' : 'false'}
            >
              <div
                className="not4k-tutorial-player-placeholder"
                data-tutorial-player-placeholder="true"
                aria-hidden="true"
                style={tutorialHelpStyles.playerPlaceholder}
              />
              <TutorialPreviewTransitionStage
                activePlayerSlot={activePlayerSlot}
                previewSlotIndexes={previewSlotIndexes}
                previewSlotInstanceIds={previewSlotInstanceIds}
                playerTransition={playerTransition}
                transitionProgress={playerTransitionProgress}
                handlePreviewSlotReady={handlePreviewSlotReady}
              />
            </div>
          </div>

          <aside
            className="not4k-tutorial-text-panel"
            style={tutorialHelpStyles.textPanel}
            aria-label="Tutorial text"
          >
            <div
              key={currentTutorial.id}
              className="not4k-tutorial-text-transition"
              data-tutorial-text-transition-direction={textTransitionDirection}
              style={tutorialHelpStyles.body}
            >
              {bodyLines.map((line, index) => (
                <p key={`${currentTutorial.id}-${index}`} style={tutorialHelpStyles.bodyLine}>
                  {line}
                </p>
              ))}
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}

function TutorialPreviewTransitionStage({
  activePlayerSlot,
  previewSlotIndexes,
  previewSlotInstanceIds,
  playerTransition: transition,
  transitionProgress,
  handlePreviewSlotReady,
}: {
  activePlayerSlot: TutorialPreviewSlotId;
  previewSlotIndexes: readonly [number, number];
  previewSlotInstanceIds: readonly [number, number];
  playerTransition: TutorialPlayerTransition | null;
  transitionProgress: number;
  handlePreviewSlotReady: (
    readySlotId: TutorialPreviewSlotId,
    readyIndex: number,
    readyInstanceId: number,
  ) => void;
}) {
  const transitionPhase = transition?.phase ?? 'idle';
  const orderedSlotIds = getTutorialPreviewSlotRenderOrder(activePlayerSlot, transition);
  const trackStyle = {
    ...tutorialHelpStyles.playerTrack,
    transform: getTutorialPreviewTrackTransform(transition, transitionProgress),
  };

  return (
    <div
      className="not4k-tutorial-player-stage"
      style={tutorialHelpStyles.playerStage}
      data-tutorial-transition-phase={transitionPhase}
    >
      <div
        className={getTutorialPreviewTrackClassName(transition)}
        style={trackStyle}
        data-tutorial-carousel-track="true"
        data-tutorial-transition-phase={transitionPhase}
        data-tutorial-transition-direction={transition?.direction ?? 'none'}
        data-tutorial-carousel-progress={transition ? transitionProgress.toFixed(3) : '0'}
      >
        {orderedSlotIds.map((slotId) => {
          const previewIndex = previewSlotIndexes[slotId] ?? 0;
          const previewInstanceId = previewSlotInstanceIds[slotId] ?? 0;
          const slotState = getTutorialPreviewSlotState(slotId, activePlayerSlot, transition);
          return (
            <TutorialPreviewSlot
              key={`preview-slot-${slotId}`}
              preview={TUTORIAL_PREVIEWS[previewIndex] ?? TUTORIAL_PREVIEWS[0]}
              previewInstanceId={previewInstanceId}
              slotState={slotState}
              transition={transition}
              onReady={() => handlePreviewSlotReady(slotId, previewIndex, previewInstanceId)}
            />
          );
        })}
      </div>
    </div>
  );
}

function getTutorialPreviewSlotRenderOrder(
  activePlayerSlot: TutorialPreviewSlotId,
  transition: TutorialPlayerTransition | null,
): readonly TutorialPreviewSlotId[] {
  if (!transition) {
    return [activePlayerSlot, getStandbyTutorialPreviewSlot(activePlayerSlot)];
  }

  return transition.direction === 'backward'
    ? [transition.toSlot, transition.fromSlot]
    : [transition.fromSlot, transition.toSlot];
}

function getTutorialPreviewTrackTransform(
  transition: TutorialPlayerTransition | null,
  transitionProgress: number,
): string {
  if (!transition) return 'translate3d(0%, 0, 0)';

  const clampedProgress = Math.max(0, Math.min(1, transition.phase === 'animating' ? transitionProgress : 0));
  const offsetPercent = transition.direction === 'forward'
    ? -100 * clampedProgress
    : -100 + (100 * clampedProgress);

  return `translate3d(${offsetPercent}%, 0, 0)`;
}

function getEaseOutQuintProgress(progress: number): number {
  const clampedProgress = Math.max(0, Math.min(1, progress));
  return 1 - ((1 - clampedProgress) ** 5);
}

function getTutorialPreviewSlotReadyKey(
  slotId: TutorialPreviewSlotId,
  previewIndex: number,
  previewInstanceId: number,
): string {
  return `${slotId}:${previewIndex}:${previewInstanceId}`;
}

function getTutorialPreviewSlotState(
  slotId: TutorialPreviewSlotId,
  activePlayerSlot: TutorialPreviewSlotId,
  transition: TutorialPlayerTransition | null,
): TutorialPreviewSlotState {
  if (!transition) {
    return slotId === activePlayerSlot ? 'active' : 'standby';
  }

  if (slotId === transition.fromSlot) return 'exiting';
  if (slotId === transition.toSlot) return 'entering';
  return 'standby';
}

function getStandbyTutorialPreviewSlot(activePlayerSlot: TutorialPreviewSlotId): TutorialPreviewSlotId {
  return activePlayerSlot === 0 ? 1 : 0;
}

function TutorialPreviewSlot({
  preview,
  previewInstanceId,
  slotState,
  transition,
  onReady,
}: {
  preview: TutorialPreviewDefinition;
  previewInstanceId: number;
  slotState: TutorialPreviewSlotState;
  transition: TutorialPlayerTransition | null;
  onReady?: () => void;
}) {
  const diagramModalEnabled = slotState === 'active' || slotState === 'entering';
  const diagramModalVisible = slotState === 'active' || slotState === 'entering';

  return (
    <div
      className={getTutorialPreviewSlotClassName(slotState, transition)}
      style={tutorialHelpStyles.playerSlot}
      data-tutorial-preview-slot={slotState}
      data-tutorial-preview-id={preview.id}
      data-tutorial-preview-instance={previewInstanceId}
      data-tutorial-transition-phase={transition?.phase ?? 'idle'}
      data-tutorial-transition-direction={transition?.direction ?? 'none'}
      aria-hidden={slotState === 'active' || slotState === 'entering' ? undefined : true}
    >
      <div className="not4k-tutorial-player-wrap" style={tutorialHelpStyles.playerWrap}>
        <TutorialPreviewPlayer
          key={`${preview.id}:${previewInstanceId}`}
          preview={preview}
          diagramModalEnabled={diagramModalEnabled}
          diagramModalVisible={diagramModalVisible}
          onReady={onReady}
        />
      </div>
    </div>
  );
}

function getTutorialPreviewSlotClassName(
  slotState: TutorialPreviewSlotState,
  transition: TutorialPlayerTransition | null,
): string {
  const classNames = [
    'not4k-tutorial-player-slot',
    `not4k-tutorial-player-slot-${slotState}`,
  ];

  if (transition) {
    classNames.push(`not4k-tutorial-player-slot-${transition.phase}`);
  }

  return classNames.join(' ');
}

function getTutorialPreviewTrackClassName(
  transition: TutorialPlayerTransition | null,
): string {
  const classNames = ['not4k-tutorial-carousel-track'];

  if (transition) {
    classNames.push(`not4k-tutorial-carousel-track-${transition.phase}`);
    classNames.push(`not4k-tutorial-carousel-track-${transition.direction}`);
  }

  return classNames.join(' ');
}

function normalizeTutorialIndex(index: number): number {
  return (index + TUTORIAL_PREVIEWS.length) % TUTORIAL_PREVIEWS.length;
}

function getTutorialTransitionDirection(
  currentIndex: number,
  nextIndex: number,
): TutorialPageTransitionDirection {
  return nextIndex >= currentIndex ? 'forward' : 'backward';
}

function getTutorialTransitionDurationMs(): number {
  if (typeof window === 'undefined') return TUTORIAL_PAGE_TRANSITION_MS;

  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ? 1
    : TUTORIAL_PAGE_TRANSITION_MS;
}

function getTutorialModalCloseDurationMs(): number {
  if (typeof window === 'undefined') return TUTORIAL_MODAL_CLOSE_MS;

  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ? 1
    : TUTORIAL_MODAL_CLOSE_MS;
}

function getOppositeHandPlacementLine(
  preset: 'numpad' | 'tkl',
  keyBindings: TutorialKeyBindings,
): string {
  const keyCodes = [
    keyBindings.lane3[0],
    keyBindings.lane4[0],
    keyBindings.lane4[1],
    keyBindings.lane3[2],
  ].filter((keyCode): keyCode is string => Boolean(keyCode));
  const keyLabels = keyCodes.map(getTutorialKeyboardLabel).join(' ');
  const presetLabel = preset === 'numpad' ? 'Numpad' : 'TKL';

  return `반대손은 현재 ${presetLabel} 배치 기준 ${keyLabels}에 올려두세요`;
}

const tutorialHelpCss = `
.not4k-tutorial-overlay {
  opacity: 1;
  transition: opacity ${TUTORIAL_MODAL_CLOSE_MS}ms ease;
}

.not4k-tutorial-overlay[data-tutorial-modal-state="closing"] {
  opacity: 0;
  pointer-events: none;
}

.not4k-tutorial-modal {
  transform: scale(1);
  transition: transform ${TUTORIAL_MODAL_CLOSE_MS}ms cubic-bezier(0.22, 1, 0.36, 1);
}

.not4k-tutorial-overlay[data-tutorial-modal-state="closing"] .not4k-tutorial-modal {
  transform: scale(0.992);
}

.not4k-tutorial-carousel-card {
  position: relative;
  transform: translateZ(0);
}

.not4k-tutorial-player-stage {
  contain: layout paint;
  isolation: isolate;
  opacity: 1;
  transition: opacity 120ms ease;
}

.not4k-tutorial-carousel-card[data-tutorial-driver-visible="false"] .not4k-tutorial-player-stage {
  opacity: 0;
}

.not4k-tutorial-player-placeholder {
  opacity: 0;
  transition: opacity 120ms ease;
}

.not4k-tutorial-carousel-card[data-tutorial-driver-visible="false"] .not4k-tutorial-player-placeholder {
  opacity: 1;
}

.not4k-tutorial-carousel-track {
  display: flex;
  width: 100%;
  transform-origin: center center;
  will-change: transform;
}

.not4k-tutorial-player-slot {
  flex: 0 0 100%;
  transform-origin: center center;
}

.not4k-tutorial-player-slot-preparing {
  transform: translate3d(0, 0, 0);
}

.not4k-tutorial-player-slot-active {
  position: relative;
  z-index: 2;
  opacity: 1;
  transform: translate3d(0, 0, 0);
}

.not4k-tutorial-player-slot-standby {
  position: relative;
  z-index: 0;
  opacity: 0;
  transform: translate3d(0, 0, 0);
  pointer-events: none;
}

.not4k-tutorial-player-slot-exiting {
  position: relative;
  z-index: 1;
  opacity: 1;
  transform: translate3d(0, 0, 0);
  pointer-events: none;
}

.not4k-tutorial-player-slot-entering {
  position: relative;
  z-index: 2;
  opacity: 1;
  transform: translate3d(0, 0, 0);
  pointer-events: none;
}

.not4k-tutorial-text-transition {
  animation: not4kTutorialTextFade 140ms ease both;
}

@keyframes not4kTutorialTextFade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .not4k-tutorial-player-slot,
  .not4k-tutorial-carousel-track,
  .not4k-tutorial-player-stage,
  .not4k-tutorial-player-placeholder,
  .not4k-tutorial-overlay,
  .not4k-tutorial-modal,
  .not4k-tutorial-text-transition {
    animation-duration: 1ms !important;
    transition-duration: 1ms !important;
  }
}

@media (max-width: 900px) {
  .not4k-tutorial-content-layout {
    flex-direction: column !important;
  }

  .not4k-tutorial-index {
    width: auto !important;
    max-height: 156px !important;
    padding-right: 0 !important;
    padding-bottom: 8px !important;
    border-right: 0 !important;
    border-bottom: 1px solid #3f3f3f !important;
  }

  .not4k-tutorial-index-item {
    min-height: 32px !important;
  }

  .not4k-tutorial-text-panel {
    width: auto !important;
    padding-left: 0 !important;
    padding-top: 12px !important;
    border-left: 0 !important;
    border-top: 1px solid #3f3f3f !important;
  }
}

@media (max-width: 560px) {
  .not4k-tutorial-player-wrap {
    min-width: 0 !important;
  }
}
`;

const tutorialHelpStyles: Record<string, CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 2200,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    backgroundColor: 'rgba(0, 0, 0, 0.68)',
    backdropFilter: 'blur(2px)',
  },
  modal: {
    width: 'min(96vw, 1120px)',
    maxHeight: 'min(88vh, 760px)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    gap: '18px',
    padding: '20px',
    color: '#e8e8e8',
    backgroundColor: '#262626',
    border: '1px solid #555',
    borderRadius: '8px',
    boxShadow: '0 22px 64px rgba(0, 0, 0, 0.48)',
    fontFamily: 'system-ui, sans-serif',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '16px',
    flexWrap: 'wrap',
    flexShrink: 0,
  },
  title: {
    margin: 0,
    fontSize: '18px',
    lineHeight: 1.2,
    fontWeight: 700,
  },
  subtitle: {
    margin: '6px 0 0',
    color: '#9c9c9c',
    fontSize: '12px',
    lineHeight: 1.35,
  },
  headerControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexShrink: 0,
  },
  arrowButton: {
    width: '32px',
    height: '32px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#e0e0e0',
    backgroundColor: '#363636',
    border: '1px solid #5a5a5a',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: 700,
    lineHeight: 1,
  },
  pageIndicator: {
    minWidth: '42px',
    color: '#b7b7b7',
    fontSize: '12px',
    fontWeight: 700,
    textAlign: 'center',
    lineHeight: 1,
  },
  closeButton: {
    minWidth: '72px',
    minHeight: '32px',
    padding: '0 14px',
    flexShrink: 0,
    color: '#e0e0e0',
    backgroundColor: '#363636',
    border: '1px solid #5a5a5a',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 600,
  },
  resetCacheButton: {
    minWidth: '104px',
    minHeight: '32px',
    padding: '0 12px',
    flexShrink: 0,
    color: '#b9f4f8',
    backgroundColor: '#24383b',
    border: '1px solid #4d8e96',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 700,
  },
  contentLayout: {
    minHeight: 0,
    display: 'flex',
    gap: '14px',
    alignItems: 'stretch',
  },
  indexNav: {
    width: '214px',
    maxHeight: '100%',
    paddingRight: '12px',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    overflowY: 'auto',
    borderRight: '1px solid #3f3f3f',
  },
  indexButton: {
    width: '100%',
    minHeight: '36px',
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
    padding: '7px 8px',
    color: '#cfcfcf',
    backgroundColor: '#303030',
    border: '1px solid #454545',
    borderRadius: '6px',
    cursor: 'pointer',
    boxSizing: 'border-box',
    fontSize: '12px',
    lineHeight: 1.2,
    textAlign: 'left',
  },
  indexButtonCurrent: {
    color: '#f2f7f7',
    backgroundColor: '#3a4345',
    border: '1px solid #6b8d92',
    boxShadow: 'inset 3px 0 0 #7bdff2',
  },
  indexNumber: {
    width: '18px',
    flexShrink: 0,
    color: '#8f989b',
    fontSize: '11px',
    fontWeight: 800,
    lineHeight: 1,
    textAlign: 'right',
  },
  indexTitle: {
    minWidth: 0,
    flex: 1,
    overflow: 'hidden',
    color: 'inherit',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  indexCheck: {
    flexShrink: 0,
    color: '#8ee6a8',
    fontSize: '13px',
    fontWeight: 900,
    lineHeight: 1,
  },
  playerColumn: {
    minWidth: 0,
    minHeight: 0,
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflowY: 'auto',
    alignItems: 'center',
  },
  carouselCard: {
    width: '100%',
    maxWidth: '520px',
    minWidth: 0,
    padding: '12px',
    overflow: 'hidden',
    boxSizing: 'border-box',
    backgroundColor: '#1f2324',
    border: '1px solid #444d50',
    borderRadius: '8px',
  },
  playerPlaceholder: {
    position: 'absolute',
    inset: '12px',
    borderRadius: '6px',
    backgroundColor: '#141616',
    backgroundImage: 'linear-gradient(90deg, rgba(255, 255, 255, 0.025), rgba(255, 255, 255, 0.055), rgba(255, 255, 255, 0.025))',
    pointerEvents: 'none',
  },
  playerStage: {
    position: 'relative',
    width: '100%',
    minHeight: '1px',
    overflow: 'hidden',
    borderRadius: '6px',
    backgroundColor: '#141616',
  },
  playerSlot: {
    width: '100%',
    display: 'flex',
    justifyContent: 'center',
  },
  playerTrack: {
    width: '100%',
  },
  textPanel: {
    width: '260px',
    minWidth: '220px',
    minHeight: 0,
    paddingLeft: '14px',
    flexShrink: 0,
    overflowY: 'auto',
    borderLeft: '1px solid #3f3f3f',
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '0',
  },
  bodyLine: {
    margin: 0,
    color: '#d4d4d4',
    fontSize: '14px',
    lineHeight: 1.45,
    wordBreak: 'keep-all',
  },
  playerWrap: {
    minWidth: '280px',
  },
};
