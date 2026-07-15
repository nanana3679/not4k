import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { TutorialHelpModal } from './TutorialHelpModal';
import {
  TUTORIAL_VIEWED_STORAGE_KEY,
  canShowTutorialCacheInvalidationButton,
  clearTutorialViewedIds,
  persistTutorialViewedIds,
  readTutorialViewedIdsFromStorage,
} from './tutorialViewedCache';
import { TUTORIAL_PREVIEWS } from './tutorialPreviewChart';
import tutorialHelpModalSource from './TutorialHelpModal.tsx?raw';
import tutorialViewedCacheSource from './tutorialViewedCache.ts?raw';

function countOccurrences(source: string, pattern: string): number {
  return source.split(pattern).length - 1;
}

describe('TutorialHelpModal', () => {
  it('튜토리얼 캐시 무효화 버튼은 개발환경이거나 admin이면 표시', () => {
    expect(canShowTutorialCacheInvalidationButton({ isAdmin: false, isDev: false })).toBe(false);
    expect(canShowTutorialCacheInvalidationButton({ isAdmin: true, isDev: false })).toBe(true);
    expect(canShowTutorialCacheInvalidationButton({ isAdmin: false, isDev: true })).toBe(true);
  });

  it('localStorage에 저장된 본 튜토리얼 id가 있으면 첫 페이지와 저장된 페이지를 본 상태로 복원', () => {
    const storage = {
      getItem: (key: string) =>
        key === TUTORIAL_VIEWED_STORAGE_KEY
          ? JSON.stringify(['single-note', 'double-note', 'unknown-tutorial'])
          : null,
    };

    expect([...readTutorialViewedIdsFromStorage(storage)]).toEqual([
      'hand-placement',
      'single-note',
      'double-note',
    ]);
  });

  it('localStorage 값이 깨져 있으면 첫 페이지 본 상태만 사용', () => {
    const storage = {
      getItem: () => '{broken',
    };

    expect([...readTutorialViewedIdsFromStorage(storage)]).toEqual(['hand-placement']);
  });

  it('본 튜토리얼 id를 localStorage에 튜토리얼 순서대로 저장', () => {
    const writes: Record<string, string> = {};
    const storage = {
      setItem: (key: string, value: string) => {
        writes[key] = value;
      },
    };

    persistTutorialViewedIds(storage, new Set(['double-note', 'hand-placement', 'unknown-tutorial']));

    expect(JSON.parse(writes[TUTORIAL_VIEWED_STORAGE_KEY])).toEqual([
      'hand-placement',
      'double-note',
    ]);
  });

  it('튜토리얼 캐시 무효화는 localStorage의 본 튜토리얼 id 저장값을 제거', () => {
    const removedKeys: string[] = [];
    const storage = {
      removeItem: (key: string) => {
        removedKeys.push(key);
      },
    };

    clearTutorialViewedIds(storage);

    expect(removedKeys).toEqual([TUTORIAL_VIEWED_STORAGE_KEY]);
  });

  it('곡 선택 도움말 팝업은 dialog role과 닫기 버튼을 렌더링', () => {
    const html = renderToStaticMarkup(
      React.createElement(TutorialHelpModal, { onClose: () => {} }),
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('Close');
  });

  it('튜토리얼 팝업은 실제 프리뷰 플레이어 캔버스 자리를 렌더링', () => {
    const html = renderToStaticMarkup(
      React.createElement(TutorialHelpModal, { onClose: () => {} }),
    );

    expect(countOccurrences(html, 'data-tutorial-preview-canvas="true"')).toBe(2);
    expect(html).toContain('aria-label="Tutorial chart preview"');
    expect(html).toContain('not4k-tutorial-carousel-card');
    expect(html).toContain('data-tutorial-driver-visible="false"');
    expect(html).toContain('data-tutorial-player-placeholder="true"');
    expect(html).toContain('not4k-tutorial-player-stage');
    expect(html).toContain('data-tutorial-carousel-track="true"');
    expect(html).toContain('data-tutorial-preview-slot="active"');
    expect(html).toContain('data-tutorial-preview-slot="standby"');
    expect(html).toContain('data-tutorial-transition-phase="idle"');
  });

  it('튜토리얼 팝업은 이전/다음 화살표 버튼과 현재 튜토리얼 번호를 렌더링', () => {
    const html = renderToStaticMarkup(
      React.createElement(TutorialHelpModal, { onClose: () => {} }),
    );

    expect(html).toContain('aria-label="Previous tutorial"');
    expect(html).toContain('aria-label="Next tutorial"');
    expect(html).toContain('1 / 16');
  });

  it('튜토리얼 팝업은 왼쪽 인덱스를 렌더링하고 이미 본 제목 옆에 체크 표시를 붙임', () => {
    const html = renderToStaticMarkup(
      React.createElement(TutorialHelpModal, { onClose: () => {} }),
    );

    expect(html).toContain('aria-label="Tutorial index"');
    expect(html).toContain('not4k-tutorial-index');
    expect(countOccurrences(html, 'data-tutorial-index-item=')).toBe(TUTORIAL_PREVIEWS.length);
    expect(countOccurrences(html, 'data-tutorial-index-current="true"')).toBe(1);
    expect(countOccurrences(html, 'data-tutorial-index-seen="true"')).toBe(1);
    expect(countOccurrences(html, 'data-tutorial-index-check="true"')).toBe(1);
    expect(html).toContain('data-tutorial-index-item="hand-placement"');
    expect(html).toContain('data-tutorial-index-item="vertical-movement"');
    expect(html).toContain('>0</span><span');
    expect(html).toContain('>14</span><span');
    expect(html).toContain('손배치');
    expect(html).toContain('수직 이동');
    expect(html).not.toContain('0 손배치');
    expect(html).not.toContain('14 수직 이동');
    expect(html).toContain('✓');
  });

  it('튜토리얼 팝업은 본 튜토리얼 id를 localStorage에서 읽고 변경될 때 다시 저장', () => {
    expect(tutorialViewedCacheSource).toContain('TUTORIAL_VIEWED_STORAGE_KEY');
    expect(tutorialHelpModalSource).toContain('readTutorialViewedIdsFromStorage(getTutorialViewedStorage())');
    expect(tutorialHelpModalSource).toContain('persistTutorialViewedIds(getTutorialViewedStorage(), viewedTutorialIds)');
    expect(tutorialHelpModalSource).toContain('[viewedTutorialIds]');
  });

  it('튜토리얼 팝업은 개발환경 또는 admin일 때 캐시 무효화 버튼을 렌더링하고 누르면 체크 상태를 초기화', () => {
    const html = renderToStaticMarkup(
      React.createElement(TutorialHelpModal, { onClose: () => {}, isAdmin: true }),
    );

    expect(html).toContain('data-tutorial-reset-viewed-cache="true"');
    expect(html).toContain('Reset Viewed');
    expect(tutorialHelpModalSource).toContain('canShowTutorialCacheInvalidationButton({');
    expect(tutorialHelpModalSource).toContain('isDev: import.meta.env.DEV');
    expect(tutorialHelpModalSource).toContain('clearTutorialViewedIds(getTutorialViewedStorage())');
    expect(tutorialHelpModalSource).toContain('setViewedTutorialIds(new Set([TUTORIAL_PREVIEWS[0].id]))');
  });

  it('튜토리얼 팝업은 가운데 플레이어와 오른쪽 텍스트 전용 영역을 분리해서 렌더링', () => {
    const html = renderToStaticMarkup(
      React.createElement(TutorialHelpModal, { onClose: () => {} }),
    );

    expect(html).toContain('not4k-tutorial-player-column');
    expect(html).toContain('not4k-tutorial-text-panel');
    expect(html).toContain('aria-label="Tutorial text"');
    expect(html.indexOf('class="not4k-tutorial-player-column"')).toBeLessThan(
      html.indexOf('class="not4k-tutorial-text-panel"'),
    );
    expect(html).toContain('border-left:1px solid #3f3f3f');
    expect(html).toContain('왼손은 Q W E C에 약지·중지·검지·엄지를 올려두세요');
  });

  it('튜토리얼 팝업은 0번 손배치 본문과 현재 TKL 반대손 배치를 함께 렌더링', () => {
    const html = renderToStaticMarkup(
      React.createElement(TutorialHelpModal, { onClose: () => {} }),
    );

    expect(html).toContain('손배치');
    expect(html).not.toContain('0 손배치');
    expect(html).toContain('왼손은 Q W E C에 약지·중지·검지·엄지를 올려두세요');
    expect(html).toContain('반대손은 현재 TKL 배치 기준');
    expect(html).toContain('P [ ] ,');
    expect(html).toContain('키 배치는 옵션에서 언제든 바꿀 수 있습니다');
  });

  it('튜토리얼 팝업은 tutorialInput 이벤트에서 나온 손배치 키 표시 8개를 렌더링', () => {
    const html = renderToStaticMarkup(
      React.createElement(TutorialHelpModal, { onClose: () => {} }),
    );

    expect(countOccurrences(html, 'data-tutorial-key=')).toBe(16);
    expect(html).toContain('data-tutorial-key="KeyQ"');
    expect(html).toContain('data-tutorial-key="KeyW"');
    expect(html).toContain('data-tutorial-key="KeyE"');
    expect(html).toContain('data-tutorial-key="KeyC"');
    expect(html).toContain('data-tutorial-key="KeyP"');
    expect(html).toContain('data-tutorial-key="BracketLeft"');
    expect(html).toContain('data-tutorial-key="BracketRight"');
    expect(html).toContain('data-tutorial-key="Comma"');
  });

  it('기본 TKL 프리셋이면 튜토리얼 팝업 키보드 레이아웃에서 Numpad 키를 렌더링하지 않음', () => {
    const html = renderToStaticMarkup(
      React.createElement(TutorialHelpModal, { onClose: () => {} }),
    );

    expect(html).toContain('data-keyboard-preset="tkl"');
    expect(html).not.toContain('data-keyboard-key="Numpad7"');
  });

  it('키 입력 표시는 초기 SSR 상태에서 모두 active=false', () => {
    const html = renderToStaticMarkup(
      React.createElement(TutorialHelpModal, { onClose: () => {} }),
    );

    expect(countOccurrences(html, 'data-active="false"')).toBe(16);
  });

  it('키 입력 표시는 매핑된 손배치 키 8개만 활성 상태로 두고 나머지 키는 aria-disabled=true로 렌더링', () => {
    const html = renderToStaticMarkup(
      React.createElement(TutorialHelpModal, { onClose: () => {} }),
    );

    expect(countOccurrences(html, 'data-mapped="true"')).toBe(16);
    expect(countOccurrences(html, 'data-mapped="false"')).toBeGreaterThan(0);
    expect(countOccurrences(html, 'aria-disabled="true"')).toBeGreaterThan(0);
  });

  it('키보드 키캡에는 L1 같은 레인 라벨을 넣지 않고 판정선 아래에는 레인당 하나의 큰 키만 표시', () => {
    const html = renderToStaticMarkup(
      React.createElement(TutorialHelpModal, { onClose: () => {} }),
    );

    expect(html).not.toContain('L1');
    expect(html).not.toContain('L2');
    expect(countOccurrences(html, 'data-tutorial-lane-key=')).toBe(8);
    expect(countOccurrences(html, 'data-tutorial-lane-keycode=')).toBe(8);
    expect(countOccurrences(html, 'data-tutorial-lane-key-active="false"')).toBe(8);
    expect(html).toContain('data-tutorial-lane-key="1"');
    expect(html).toContain('data-tutorial-lane-key="2"');
    expect(html).toContain('data-tutorial-lane-key="3"');
    expect(html).toContain('data-tutorial-lane-key="4"');
    expect(html).toContain('data-tutorial-lane-keycode="KeyQ KeyW"');
    expect(html).toContain('data-tutorial-lane-keycode="KeyE KeyC"');
    expect(html).toContain('data-tutorial-lane-keycode="KeyP Comma"');
    expect(html).toContain('data-tutorial-lane-keycode="BracketLeft BracketRight"');
    expect(html).toContain('Q');
    expect(html).toContain('W');
    expect(html).toContain('E');
    expect(html).toContain('C');
    expect(html).not.toContain('P, L');
    expect(html).toContain('[');
    expect(html).toContain(']');
    expect(html).toContain('min-height:42px');
    expect(html).toContain('box-shadow:0 4px 0 #101010');
  });

  it('390px 모바일 폭에서는 프리뷰 플레이어 래퍼가 폭을 줄일 수 있는 스타일을 포함', () => {
    const html = renderToStaticMarkup(
      React.createElement(TutorialHelpModal, { onClose: () => {} }),
    );

    expect(html).toContain('not4k-tutorial-player-wrap');
    expect(html).toContain('@media (max-width: 560px)');
    expect(html).toContain('min-width: 0 !important');
  });

  it('페이지 전환은 가운데 카드 안에서 두 프리뷰 슬롯을 캐러셀처럼 좌우 이동', () => {
    expect(tutorialHelpModalSource).toContain('const TUTORIAL_PAGE_TRANSITION_MS = 260');
    expect(tutorialHelpModalSource).toContain('const TUTORIAL_MODAL_CLOSE_MS = 120');
    expect(tutorialHelpModalSource).toContain('visiblePlayerIndex');
    expect(tutorialHelpModalSource).toContain('activePlayerSlot');
    expect(tutorialHelpModalSource).toContain('previewSlotIndexes');
    expect(tutorialHelpModalSource).toContain('playerTransition');
    expect(tutorialHelpModalSource).toContain('playerTransitionProgress');
    expect(tutorialHelpModalSource).toContain('readyPreviewSlotKeys');
    expect(tutorialHelpModalSource).toContain('activePreviewReady');
    expect(tutorialHelpModalSource).toContain('isPlayerDriverVisible');
    expect(tutorialHelpModalSource).toContain('isClosing');
    expect(tutorialHelpModalSource).toContain('requestClose');
    expect(tutorialHelpModalSource).toContain('not4k-tutorial-carousel-card');
    expect(tutorialHelpModalSource).toContain('not4k-tutorial-carousel-track');
    expect(tutorialHelpModalSource).toContain('data-tutorial-modal-state={isClosing ?');
    expect(tutorialHelpModalSource).toContain('data-tutorial-driver-visible={isPlayerDriverVisible ?');
    expect(tutorialHelpModalSource).toContain('data-tutorial-player-placeholder="true"');
    expect(tutorialHelpModalSource).toContain('data-tutorial-carousel-track="true"');
    expect(tutorialHelpModalSource).toContain('data-tutorial-carousel-progress={transition ? transitionProgress.toFixed(3) :');
    expect(tutorialHelpModalSource).toContain('carouselCard:');
    expect(tutorialHelpModalSource).toContain('playerPlaceholder:');
    expect(tutorialHelpModalSource).toContain('playerTrack:');
    expect(tutorialHelpModalSource).toContain("type TutorialPreviewSlotState = 'active' | 'standby' | 'exiting' | 'entering'");
    expect(tutorialHelpModalSource).toContain('getTutorialPreviewSlotRenderOrder(activePlayerSlot, transition)');
    expect(tutorialHelpModalSource).toContain('getTutorialPreviewTrackTransform(transition, transitionProgress)');
    expect(tutorialHelpModalSource).toContain('getEaseOutQuintProgress(elapsedRatio)');
    expect(tutorialHelpModalSource).toContain("transition.direction === 'backward'");
    expect(tutorialHelpModalSource).toContain('getStandbyTutorialPreviewSlot(activePlayerSlot)');
    expect(tutorialHelpModalSource).toContain("phase: 'preparing'");
    expect(tutorialHelpModalSource).toContain("phase: 'animating'");
    expect(tutorialHelpModalSource).toContain('data-tutorial-preview-slot={slotState}');
    expect(tutorialHelpModalSource).toContain('data-tutorial-transition-direction={transition?.direction ??');
    expect(tutorialHelpModalSource).toContain("const diagramModalEnabled = slotState === 'active' || slotState === 'entering'");
    expect(tutorialHelpModalSource).toContain('diagramModalEnabled={diagramModalEnabled}');
    expect(tutorialHelpModalSource).toContain('not4k-tutorial-player-slot-standby');
    expect(tutorialHelpModalSource).toContain('not4k-tutorial-player-slot-exiting');
    expect(tutorialHelpModalSource).toContain('not4k-tutorial-player-slot-entering');
    expect(tutorialHelpModalSource).toContain('not4k-tutorial-player-slot-preparing');
    expect(tutorialHelpModalSource).toContain('handlePreviewSlotReady(slotId, previewIndex, previewInstanceId)');
    expect(tutorialHelpModalSource).toContain('window.requestAnimationFrame(step)');
    expect(tutorialHelpModalSource).toContain('-100 * clampedProgress');
    expect(tutorialHelpModalSource).toContain('-100 + (100 * clampedProgress)');
    expect(tutorialHelpModalSource).toContain('translate3d(${offsetPercent}%, 0, 0)');
    expect(tutorialHelpModalSource).toContain('contain: layout paint');
    expect(tutorialHelpModalSource).toContain('not4kTutorialTextFade');
    expect(tutorialHelpModalSource).not.toContain('translateX(');
    expect(tutorialHelpModalSource).not.toContain('brightness(0.72) saturate(0.82)');
    expect(tutorialHelpModalSource).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('새 프리뷰 준비 후 두 animation frame을 기다린 뒤 캐러셀 이동을 시작해 준비 위치가 먼저 그려짐', () => {
    expect(tutorialHelpModalSource).toContain('transitionFrameIdsRef');
    expect(tutorialHelpModalSource).toContain('cancelScheduledTransitionStart();');
    expect(tutorialHelpModalSource).toContain('const firstFrameId = window.requestAnimationFrame(() => {');
    expect(tutorialHelpModalSource).toContain('const secondFrameId = window.requestAnimationFrame(() => {');
    expect(tutorialHelpModalSource).toContain('setPlayerTransition((transition) => {');
    expect(tutorialHelpModalSource).toContain("phase: 'animating'");
  });

  it('전환 중 Next/Prev는 완료 예정 슬롯을 기준으로 다음 전환을 잡고 도식 표시는 active와 entering 슬롯으로 제한', () => {
    expect(tutorialHelpModalSource).toContain('const sourcePlayerIndex = playerTransition?.toIndex ?? visiblePlayerIndex');
    expect(tutorialHelpModalSource).toContain('const sourcePlayerSlot = playerTransition?.toSlot ?? activePlayerSlot');
    expect(tutorialHelpModalSource).toContain('fromIndex: sourcePlayerIndex');
    expect(tutorialHelpModalSource).toContain('fromSlot: sourcePlayerSlot');
    expect(tutorialHelpModalSource).toContain('data-tutorial-preview-id={preview.id}');
    expect(tutorialHelpModalSource).toContain("const diagramModalEnabled = slotState === 'active' || slotState === 'entering'");
    expect(tutorialHelpModalSource).toContain("const diagramModalVisible = slotState === 'active' || slotState === 'entering'");
    expect(tutorialHelpModalSource).toContain('diagramModalVisible={diagramModalVisible}');
  });

  it('페이지를 다시 방문하면 같은 튜토리얼이라도 새 인스턴스 key로 프리뷰 상태를 처음부터 재생', () => {
    expect(tutorialHelpModalSource).toContain('previewSlotInstanceIds');
    expect(tutorialHelpModalSource).toContain('nextPreviewSlotInstanceIdRef');
    expect(tutorialHelpModalSource).toContain('const nextSlotInstanceId = nextPreviewSlotInstanceIdRef.current++');
    expect(tutorialHelpModalSource).toContain('toSlotInstanceId: nextSlotInstanceId');
    expect(tutorialHelpModalSource).toContain('getTutorialPreviewSlotReadyKey(activePlayerSlot, visiblePlayerIndex, activePreviewInstanceId)');
    expect(tutorialHelpModalSource).toContain('previewInstanceId={previewInstanceId}');
    expect(tutorialHelpModalSource).toContain('key={`${preview.id}:${previewInstanceId}`}');
  });
});
