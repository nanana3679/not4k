import { expect, it } from 'vitest';
import { addTutorialPassedId, clearTutorialPassedIds, persistTutorialPassedIds, readTutorialPassedIdsFromStorage } from './tutorialPassRecords';

it('single-note·double-note 통과를 저장하고 다시 읽으면 두 항목의 통과를 복원한다', () => {
  const valueByKey = new Map<string, string>();
  const storage = {
    getItem: (key: string) => valueByKey.get(key) ?? null,
    setItem: (key: string, value: string) => { valueByKey.set(key, value); },
  };
  persistTutorialPassedIds(storage, new Set(['single-note', 'double-note']));
  expect(valueByKey.get('not4k-tutorial-passed-ids')).toBe('["single-note","double-note"]');
  expect([...readTutorialPassedIdsFromStorage(storage)]).toEqual(['single-note', 'double-note']);
});

it('브라우저 저장소가 없거나 접근·쓰기·삭제가 거부되면 읽기는 빈 통과 집합이며 저장·초기화는 예외를 내지 않는다', () => {
  const unavailable = {
    getItem: () => { throw new Error('blocked'); },
    setItem: () => { throw new Error('quota'); },
    removeItem: () => { throw new Error('blocked'); },
  };
  for (const storage of [null, undefined, unavailable]) {
    expect([...readTutorialPassedIdsFromStorage(storage)]).toEqual([]);
    expect(() => persistTutorialPassedIds(storage, new Set(['single-note']))).not.toThrow();
    expect(() => clearTutorialPassedIds(storage)).not.toThrow();
  }
});

it('통과 기록을 초기화하면 passed 키만 지우고 기존 viewed·설정 저장값은 그대로 남긴다', () => {
  const valueByKey = new Map([
    ['not4k-tutorial-passed-ids', '["single-note","future-lesson"]'],
    ['not4k-tutorial-viewed-ids', '["double-note"]'],
    ['settings', '{"volume":0.5}'],
  ]);
  clearTutorialPassedIds({ removeItem: key => { valueByKey.delete(key); } });
  expect([...valueByKey]).toEqual([
    ['not4k-tutorial-viewed-ids', '["double-note"]'], ['settings', '{"volume":0.5}'],
  ]);
});

it.each([null, '{broken', '{}', 'null', '42', '"single-note"'])(
  '저장값이 %s이면 읽을 때 통과한 항목 없이 시작한다', value => {
    expect([...readTutorialPassedIdsFromStorage({ getItem: () => value })]).toEqual([]);
  },
);

it('알 수 없는 ID·중복·숫자가 저장되어 있으면 문자열 ID만 중복 없이 복원하고 다음 저장에도 알 수 없는 ID를 남긴다', () => {
  let value = '["future-lesson","single-note","single-note",17,null,{},false]';
  const storage = { getItem: () => value, setItem: (_key: string, next: string) => { value = next; } };
  const passedIds = new Set(readTutorialPassedIdsFromStorage(storage));
  expect([...passedIds]).toEqual(['future-lesson', 'single-note']);
  passedIds.add('double-note');
  persistTutorialPassedIds(storage, passedIds);
  expect(JSON.parse(value)).toEqual(['future-lesson', 'single-note', 'double-note']);
});

it('다른 탭이 single-note 통과를 저장한 뒤 이 탭이 빈 메모리 집합으로 double-note 통과를 더하면 두 항목이 모두 남는다', () => {
  const valueByKey = new Map<string, string>();
  const storage = {
    getItem: (key: string) => valueByKey.get(key) ?? null,
    setItem: (key: string, value: string) => { valueByKey.set(key, value); },
  };
  persistTutorialPassedIds(storage, new Set(['single-note']));

  const merged = addTutorialPassedId(storage, new Set(), 'double-note');

  expect([...merged].sort()).toEqual(['double-note', 'single-note']);
  expect([...readTutorialPassedIdsFromStorage(storage)].sort()).toEqual(['double-note', 'single-note']);
});
