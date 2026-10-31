import { expect, it } from 'vitest';
import { prepareTutorialGuestHandoff, completeTutorialGuestHandoff, getVisibleTutorialPassedIds, type TutorialPassState } from './tutorialPassState';

it('게스트 single-note를 인계하지 않은 A가 로그인해 인계하면 기존 double-note와 합치고 로그아웃에는 아무 기록도 보이지 않는다', () => {
  const state: TutorialPassState = prepareTutorialGuestHandoff({
    guestIds: ['single-note'], accountPassedIdsByUser: { A: ['double-note'] }, pendingHandoffs: [], unresolvedPasses: [],
  }, 'A', 'receipt-1');
  const next = completeTutorialGuestHandoff(state, {
    userId: 'A', requestId: 'receipt-1', tutorialIds: ['single-note'],
  }, true);
  expect(getVisibleTutorialPassedIds(next, 'A')).toEqual(['double-note', 'single-note']);
  expect(getVisibleTutorialPassedIds(next, null)).toEqual([]);
  expect(getVisibleTutorialPassedIds(next, 'B')).toEqual([]);
  expect(state.pendingHandoffs[0]?.tutorialIds).toEqual(['single-note']);
});

it('A의 single-note 인계 대기 중 게스트가 single-note를 새로 통과하면 응답 뒤에도 새 게스트 기록을 남긴다', () => {
  const handoff = { userId: 'A', requestId: 'receipt-1', tutorialIds: ['single-note'] };
  const next = completeTutorialGuestHandoff({
    guestIds: ['single-note'], accountPassedIdsByUser: {}, pendingHandoffs: [handoff], unresolvedPasses: [],
  }, handoff, true);
  expect(getVisibleTutorialPassedIds(next, null)).toEqual(['single-note']);
  expect(getVisibleTutorialPassedIds(next, 'A')).toEqual(['single-note']);
});

it('A의 인계 응답 대기 중 새 게스트 double-note가 생겨 B로 로그인해도 single-note의 인계 대상을 바꾸지 않는다', () => {
  const state = prepareTutorialGuestHandoff({
    guestIds: ['single-note'], accountPassedIdsByUser: {}, pendingHandoffs: [], unresolvedPasses: [],
  }, 'A', 'receipt-1');
  expect(getVisibleTutorialPassedIds(state, null)).toEqual([]);
  expect(prepareTutorialGuestHandoff({ ...state, guestIds: ['double-note'] }, 'B', 'receipt-2').pendingHandoffs)
    .toEqual([
      { userId: 'A', requestId: 'receipt-1', tutorialIds: ['single-note'] },
      { userId: 'B', requestId: 'receipt-2', tutorialIds: ['double-note'] },
    ]);
});

it('게스트 기록 없이 A로 로그인하면 인계 요청을 만들지 않고 계정의 기회를 보존한다', () => {
  const state: TutorialPassState = { guestIds: [], accountPassedIdsByUser: {}, pendingHandoffs: [], unresolvedPasses: [] };
  expect(prepareTutorialGuestHandoff(state, 'A', 'receipt-1')).toBe(state);
});

it('인계를 이미 쓴 A가 single-note 인계를 거절받으면 로그인 중에는 double-note만 보이고 로그아웃에는 single-note만 보인다', () => {
  const next = completeTutorialGuestHandoff({
    guestIds: [], accountPassedIdsByUser: { A: ['double-note'] }, pendingHandoffs: [], unresolvedPasses: [],
  }, { userId: 'A', requestId: 'receipt-2', tutorialIds: ['single-note'] }, false);
  expect(getVisibleTutorialPassedIds(next, 'A')).toEqual(['double-note']);
  expect(getVisibleTutorialPassedIds(next, null)).toEqual(['single-note']);
});
