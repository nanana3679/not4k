import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { TutorialHelpModal } from './TutorialHelpModal';
import { BASIC_TUTORIAL_EXPLICIT_PREVIEWS } from './basicTutorialExplicitPreviews';
import tutorialHelpModalSource from './TutorialHelpModal.tsx?raw';

const emptyPassRecords = { passedIds: [], isGuest: true, recordPass: () => {}, resetGuest: () => {} };

function countOccurrences(source: string, pattern: string): number {
  return source.split(pattern).length - 1;
}

describe('TutorialHelpModal', () => {
  it('A의 single-note 캐시로 팝업을 열면 single-note만 체크하고 계정 기록 초기화 버튼은 표시하지 않는다', () => {
    const html = renderToStaticMarkup(React.createElement(TutorialHelpModal, {
      onClose: () => {},
      passRecords: { passedIds: ['single-note'], isGuest: false, recordPass: () => {}, resetGuest: () => {} },
    }));
    expect(countOccurrences(html, 'data-tutorial-index-check="true"')).toBe(1);
    expect(html).toMatch(/data-tutorial-index-item="single-note"[^>]+data-tutorial-index-passed="true"/);
    expect(html).not.toContain('Reset Passed');
  });
  it('팝업을 열면 Basic 탭과 연결된 패널을 선택하고 Advanced 탭은 비선택으로 표시한다', () => {
    const html = renderToStaticMarkup(React.createElement(TutorialHelpModal, { onClose: () => {}, passRecords: emptyPassRecords }));
    expect(html).toContain('role="tablist" aria-label="Tutorial level"');
    expect(html).toContain('id="tutorial-tab-basic" type="button" role="tab" aria-selected="true"');
    expect(html).toContain('id="tutorial-tab-advanced" type="button" role="tab" aria-selected="false"');
    expect(html).toContain('role="tabpanel" aria-labelledby="tutorial-tab-basic"');
    expect(html).not.toContain('data-tutorial-index-item="advanced-double-hold"');
    expect(html).toContain('릴리즈 없는 롱노트');
    expect(html).toContain('길이가 0인 바디와 틱 노트');
  });

  it('곡 선택 도움말 팝업은 dialog role과 닫기 버튼을 렌더링', () => {
    const html = renderToStaticMarkup(
      React.createElement(TutorialHelpModal, { onClose: () => {}, passRecords: emptyPassRecords }),
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('Close');
  });

  it('튜토리얼 팝업은 실제 프리뷰 플레이어 캔버스 자리를 렌더링', () => {
    const html = renderToStaticMarkup(
      React.createElement(TutorialHelpModal, { onClose: () => {}, passRecords: emptyPassRecords }),
    );

    expect(countOccurrences(html, 'data-tutorial-preview-canvas="true"')).toBe(2);
    expect(countOccurrences(html, 'data-tutorial-engine="explicit"')).toBe(2);
    expect(html).not.toContain('data-tutorial-last-iteration=');
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
      React.createElement(TutorialHelpModal, { onClose: () => {}, passRecords: emptyPassRecords }),
    );

    expect(html).toContain('aria-label="Previous tutorial"');
    expect(html).toContain('aria-label="Next tutorial"');
    expect(html).toContain('1 / 17');
  });

  it('통과 기록 없이 팝업을 열면 Basic 17개 목록에 통과 체크와 열람 표시가 없다', () => {
    const html = renderToStaticMarkup(
      React.createElement(TutorialHelpModal, { onClose: () => {}, passRecords: emptyPassRecords }),
    );

    expect(html).toContain('aria-label="Tutorial index"');
    expect(html).toContain('not4k-tutorial-index');
    expect(countOccurrences(html, 'data-tutorial-index-item=')).toBe(BASIC_TUTORIAL_EXPLICIT_PREVIEWS.length);
    expect(countOccurrences(html, 'data-tutorial-index-current="true"')).toBe(1);
    expect(html).not.toContain('data-tutorial-index-seen');
    expect(countOccurrences(html, 'data-tutorial-index-check="true"')).toBe(0);
    expect(html).toContain('data-tutorial-index-item="hand-placement"');
    expect(html).toContain('data-tutorial-index-item="vertical-movement"');
    expect(html).toContain('>0</span><span');
    expect(html).toContain('>14</span><span');
    expect(html).toContain('손배치');
    expect(html).toContain('수직 이동');
    expect(html).not.toContain('0 손배치');
    expect(html).not.toContain('14 수직 이동');
    expect(html).not.toContain('Viewed tutorial');
    expect(html).not.toContain('Passed tutorial');
  });

  it('튜토리얼 팝업은 가운데 플레이어와 오른쪽 텍스트 전용 영역을 분리해서 렌더링', () => {
    const html = renderToStaticMarkup(
      React.createElement(TutorialHelpModal, { onClose: () => {}, passRecords: emptyPassRecords }),
    );

    expect(html).toContain('not4k-tutorial-player-column');
    expect(html).toContain('not4k-tutorial-text-panel');
    expect(html).toContain('aria-label="Tutorial text"');
    expect(html.indexOf('class="not4k-tutorial-player-column"')).toBeLessThan(
      html.indexOf('class="not4k-tutorial-text-panel"'),
    );
    expect(html).toContain('border-left:1px solid #2b303a');
    expect(html).toContain('왼손은 Q W E C에 약지·중지·검지·엄지를 올려두세요');
  });

  it('튜토리얼 팝업은 0번 손배치 본문과 현재 TKL 반대손 배치를 함께 렌더링', () => {
    const html = renderToStaticMarkup(
      React.createElement(TutorialHelpModal, { onClose: () => {}, passRecords: emptyPassRecords }),
    );

    expect(html).toContain('손배치');
    expect(html).not.toContain('0 손배치');
    expect(html).toContain('왼손은 Q W E C에 약지·중지·검지·엄지를 올려두세요');
    expect(html).toContain('반대손은 현재 TKL 배치 기준');
    expect(html).toContain('P [ ] ,');
    expect(html).toContain('키 배치는 옵션에서 언제든 바꿀 수 있습니다');
  });

  it('390px 모바일 폭에서는 프리뷰 플레이어 래퍼가 폭을 줄일 수 있는 스타일을 포함', () => {
    const html = renderToStaticMarkup(
      React.createElement(TutorialHelpModal, { onClose: () => {}, passRecords: emptyPassRecords }),
    );

    expect(html).toContain('not4k-tutorial-player-wrap');
    expect(html).toContain('@media (max-width: 560px)');
    expect(html).toContain('min-width: 0 !important');
  });

  it('모바일 세로 배치에서 playerColumn은 flex:0 0 auto로 프리뷰를 찌부시키지 않고 contentLayout이 전체를 스크롤', () => {
    // contentLayout: 모달 높이를 넘기면 열을 찌부시키지 않고 한 덩어리로 세로 스크롤
    expect(tutorialHelpModalSource).toContain("flex: '1 1 auto'");
    expect(tutorialHelpModalSource).toContain("overflowY: 'auto'");
    // 모바일에서는 flex 배분으로 줄이지 말고 프리뷰(플레이+키보드) 자연 높이를 유지
    expect(tutorialHelpModalSource).toContain('flex: 0 0 auto !important');
    // 목록은 높이 제한 + 내부 스크롤로 렌더러가 세로로 밀리지 않게 유지
    expect(tutorialHelpModalSource).toContain('max-height: 156px !important');
  });

  it('스크롤 컨테이너(contentLayout·목록·설명)의 스크롤바를 숨김', () => {
    expect(tutorialHelpModalSource).toContain('.not4k-tutorial-content-layout::-webkit-scrollbar');
    expect(tutorialHelpModalSource).toContain('scrollbar-width: none');
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
    expect(tutorialHelpModalSource).toContain("from './tutorialPreviewSlots'");
    expect(tutorialHelpModalSource).toContain('getTutorialPreviewSlotRenderOrder(activePlayerSlot, transition)');
    expect(tutorialHelpModalSource).toContain('getTutorialPreviewTrackTransform(transition, transitionProgress)');
    expect(tutorialHelpModalSource).toContain('getEaseOutQuintProgress(elapsedRatio)');
    expect(tutorialHelpModalSource).toContain("transition.direction === 'backward'");
    expect(tutorialHelpModalSource).toContain('getStandbyTutorialPreviewSlot(activePlayerSlot)');
    expect(tutorialHelpModalSource).toContain("phase: 'preparing'");
    expect(tutorialHelpModalSource).toContain("phase: 'animating'");
    expect(tutorialHelpModalSource).toContain('data-tutorial-preview-slot={slotState}');
    expect(tutorialHelpModalSource).toContain('data-tutorial-transition-direction={transition?.direction ??');
    expect(tutorialHelpModalSource).toContain('diagramModalEnabled={diagramModalEnabled}');
    // 들어오는·대기 슬롯은 첫 프레임에서 멈춰 두고 active가 된 뒤 재생한다(tutorialPreviewSlots.test.ts).
    expect(tutorialHelpModalSource).toContain('paused={!isTutorialPreviewSlotPlaying(slotState) || practiceStopped}');
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
  });

  it('운영체제 prefers-reduced-motion이 reduce여도 페이지 전환은 260ms·모달 닫기는 120ms로 같다(모션 감소 matchMedia·@media 규칙 없음, RFD 0030)', () => {
    // 전환 타이머·진행률과 닫기 타이머는 상수만 쓰고 운영체제 설정을 읽지 않는다.
    expect(tutorialHelpModalSource).toContain('}, TUTORIAL_PAGE_TRANSITION_MS);');
    expect(tutorialHelpModalSource).toContain('(now - startMs) / TUTORIAL_PAGE_TRANSITION_MS');
    expect(tutorialHelpModalSource).toContain('}, TUTORIAL_MODAL_CLOSE_MS);');
    expect(tutorialHelpModalSource).not.toMatch(/matchMedia\([^)]*reduced-motion/);
    // CSS 전환·애니메이션도 운영체제 설정으로 1ms로 줄이지 않는다.
    expect(tutorialHelpModalSource).not.toContain('prefers-reduced-motion');
  });

  it('새 프리뷰 준비 후 두 animation frame을 기다린 뒤 캐러셀 이동을 시작해 준비 위치가 먼저 그려짐', () => {
    expect(tutorialHelpModalSource).toContain('transitionFrameIdsRef');
    expect(tutorialHelpModalSource).toContain('cancelScheduledTransitionStart();');
    expect(tutorialHelpModalSource).toContain('const firstFrameId = window.requestAnimationFrame(() => {');
    expect(tutorialHelpModalSource).toContain('const secondFrameId = window.requestAnimationFrame(() => {');
    expect(tutorialHelpModalSource).toContain('setPlayerTransition((transition) => {');
    expect(tutorialHelpModalSource).toContain("phase: 'animating'");
  });

  it('전환 중 Next/Prev는 완료 예정 슬롯을 기준으로 다음 전환을 잡고, 멈춤은 entering까지 arming하되 도식 확인 모달은 active 슬롯에서만 표시', () => {
    expect(tutorialHelpModalSource).toContain('const sourcePlayerIndex = playerTransition?.toIndex ?? visiblePlayerIndex');
    expect(tutorialHelpModalSource).toContain('const sourcePlayerSlot = playerTransition?.toSlot ?? activePlayerSlot');
    expect(tutorialHelpModalSource).toContain('fromIndex: sourcePlayerIndex');
    expect(tutorialHelpModalSource).toContain('fromSlot: sourcePlayerSlot');
    expect(tutorialHelpModalSource).toContain('data-tutorial-preview-id={preview.id}');
    // 멈춤(pause)은 entering에서 미리 arming(도식 시작점 고정), 하지만 뷰포트 portal 모달은
    // 전환 중 두 개가 겹쳐 보이지 않도록 active 슬롯에서만 표시한다.
    expect(tutorialHelpModalSource).toContain('diagramModalVisible={diagramModalVisible}');
  });

  it('페이지를 다시 방문하면 같은 튜토리얼이라도 새 인스턴스 id를 재생기에 넘겨 같은 렌더러에서 처음부터 재생', () => {
    expect(tutorialHelpModalSource).toContain('previewSlotInstanceIds');
    expect(tutorialHelpModalSource).toContain('nextPreviewSlotInstanceIdRef');
    expect(tutorialHelpModalSource).toContain('const nextSlotInstanceId = nextPreviewSlotInstanceIdRef.current++');
    expect(tutorialHelpModalSource).toContain('toSlotInstanceId: nextSlotInstanceId');
    expect(tutorialHelpModalSource).toContain('getTutorialPreviewSlotReadyKey(activePlayerSlot, visiblePlayerIndex, activePreviewInstanceId)');
    expect(tutorialHelpModalSource).toContain('previewInstanceId={previewInstanceId}');
  });

  it('레슨을 넘겨도 두 슬롯의 재생기를 다시 마운트하지 않도록 재생기 key에 차트·인스턴스 id를 넣지 않고 previewInstanceId prop으로 넘김', () => {
    const playerStart = tutorialHelpModalSource.indexOf('<TutorialPreviewPlayer');
    const playerEnd = tutorialHelpModalSource.indexOf('/>', playerStart);
    const playerJsx = tutorialHelpModalSource.slice(playerStart, playerEnd);
    expect(playerStart).toBeGreaterThan(-1);
    expect(playerJsx).toContain('previewInstanceId={previewInstanceId}');
    expect(playerJsx).not.toContain('key=');
    expect(tutorialHelpModalSource).not.toContain('key={`${preview.id}:${previewInstanceId}`}');
    expect(tutorialHelpModalSource).toContain('key={`preview-slot-${slotId}`}');
  });
});
