import { describe, expect, it } from 'vitest';
import { canEncodeWavRange, encodeWavBlob } from '../../shared/audio/encodeWav';
import { dragRangeAt, followRangeInput, initialRangeState, notifiedRange, pressRangeAt, rangesForNewAudio, type RangePress } from './previewRangeState';

describe('구간 선택기의 처음 구간(initialRangeState)', () => {
  it('프리뷰 값이 없으면 120초 음원에서 30～45초·페이드 0.5초로 시작한다', () => {
    expect(initialRangeState(120, {})).toEqual({ startTime: 30, endTime: 45, enabled: true, fadeInTime: 0.5, fadeOutTime: 0.5 });
  });

  it('저장된 프리뷰 10～20초를 5초 음원에 맞추면 5～5초로 자른다', () => {
    expect(initialRangeState(5, { initialStart: 10, initialEnd: 20 })).toMatchObject({ startTime: 5, endTime: 5 });
  });

  it('인게임 구간 값이 없고 페이드 입력을 보이면 0～음원 길이 90초·페이드 0초로 시작한다', () => {
    expect(initialRangeState(90, { defaultStart: 0, defaultEnd: 90, defaultDuration: 90, showFadeControls: true }))
      .toEqual({ startTime: 0, endTime: 90, enabled: true, fadeInTime: 0, fadeOutTime: 0 });
  });

  it('저장된 인게임 2～110초·페이드 1초는 120초 음원에서 그대로 쓴다', () => {
    expect(initialRangeState(120, { initialStart: 2, initialEnd: 110, initialFadeInTime: 1, initialFadeOutTime: 1,
      defaultStart: 0, defaultEnd: 120, showFadeControls: true }))
      .toEqual({ startTime: 2, endTime: 110, enabled: true, fadeInTime: 1, fadeOutTime: 1 });
  });
});

describe('선택기가 알리는 구간(notifiedRange)', () => {
  it('2초 구간에 페이드 1.5초면 구간 절반인 1초로 자른다', () => {
    expect(notifiedRange({ startTime: 3, endTime: 5, enabled: true, fadeInTime: 1.5, fadeOutTime: 0.2 }))
      .toEqual({ startTime: 3, endTime: 5, fadeInTime: 1, fadeOutTime: 0.2 });
  });
});

describe('음원을 바꿀 때의 구간(rangesForNewAudio)', () => {
  const preview = { startTime: 60, endTime: 75, fadeInTime: 1, fadeOutTime: 2 };
  const gameplay = { startTime: 5, endTime: 170, fadeInTime: 3, fadeOutTime: 4 };
  const previewDefault = (startTime: number, endTime: number) => ({ startTime, endTime, fadeInTime: 0.5, fadeOutTime: 0.5 });
  const gameplayDefault = (endTime: number) => ({ startTime: 0, endTime, fadeInTime: 0, fadeOutTime: 0 });

  it('180초 음원의 프리뷰 60～75초·인게임 5～170초를 180초 음원으로 바꾸면 둘 다 페이드까지 그대로 둔다', () => {
    expect(rangesForNewAudio(180, preview, gameplay)).toEqual({ preview, gameplay, reset: null });
  });

  it('같은 구간을 70초 음원으로 바꾸면 프리뷰 17.5～32.5초·페이드 0.5초와 인게임 0～70초·페이드 0초로 돌린다', () => {
    expect(rangesForNewAudio(70, preview, gameplay))
      .toEqual({ preview: previewDefault(17.5, 32.5), gameplay: gameplayDefault(70), reset: 'both' });
  });

  it('같은 구간을 50초 음원으로 바꾸면 프리뷰 12.5～27.5초와 인게임 0～50초로 돌린다', () => {
    expect(rangesForNewAudio(50, preview, gameplay))
      .toEqual({ preview: previewDefault(12.5, 27.5), gameplay: gameplayDefault(50), reset: 'both' });
  });

  it('프리뷰 60～75초·인게임 5～60초를 70초 음원으로 바꾸면 프리뷰만 17.5～32.5초로 돌리고 인게임은 페이드까지 그대로 둔다', () => {
    const shorterGameplay = { ...gameplay, endTime: 60 };

    expect(rangesForNewAudio(70, preview, shorterGameplay))
      .toEqual({ preview: previewDefault(17.5, 32.5), gameplay: shorterGameplay, reset: 'preview' });
  });

  it('프리뷰 10～25초·인게임 5～170초를 70초 음원으로 바꾸면 인게임만 0～70초로 돌리고 프리뷰는 페이드까지 그대로 둔다', () => {
    const earlierPreview = { ...preview, startTime: 10, endTime: 25 };

    expect(rangesForNewAudio(70, earlierPreview, gameplay))
      .toEqual({ preview: earlierPreview, gameplay: gameplayDefault(70), reset: 'gameplay' });
  });

  it('프리뷰 끝 75초가 새 음원 길이 75초와 같으면 들어가는 구간이라 그대로 둔다', () => {
    expect(rangesForNewAudio(75, preview, null).preview).toEqual(preview);
  });

  it('프리뷰 끝 75초가 새 음원 길이 74.5초를 넘으면 시작이 들어가도 18.625～33.625초로 돌린다', () => {
    expect(rangesForNewAudio(74.5, preview, null)).toMatchObject({ preview: previewDefault(18.625, 33.625), reset: 'preview' });
  });

  it('길이 0인 프리뷰 120～120초는 120초 음원에서도 들어가지 않는 구간이라 30～45초로 돌린다', () => {
    expect(rangesForNewAudio(120, { startTime: 120, endTime: 120 }, null))
      .toMatchObject({ preview: previewDefault(30, 45), reset: 'preview' });
  });

  it('시작이 음수인 프리뷰 -1～10초는 들어가지 않는 구간이라 120초 음원에서 30～45초로 돌린다', () => {
    expect(rangesForNewAudio(120, { startTime: -1, endTime: 10 }, null))
      .toMatchObject({ preview: previewDefault(30, 45), reset: 'preview' });
  });

  it('이전 프리뷰·인게임 구간이 없으면 120초 음원의 기본값 30～45초·0～120초를 쓰고 돌린 구간으로 치지 않는다', () => {
    expect(rangesForNewAudio(120, {}, null))
      .toEqual({ preview: previewDefault(30, 45), gameplay: gameplayDefault(120), reset: null });
  });

  it('프리뷰 시작 60초만 있고 끝이 없으면 이전 구간이 없는 것으로 보아 120초 음원의 기본값 30～45초를 쓰고 돌린 구간으로 치지 않는다', () => {
    expect(rangesForNewAudio(120, { startTime: 60 }, null)).toMatchObject({ preview: previewDefault(30, 45), reset: null });
  });

  it.each([
    [20, 5, 20],
    [16, 1, 16],
    [15, 0, 15],
    [10, 0, 10],
    [5, 0, 5],
    [3, 0, 3],
  ])('프리뷰 60～75초를 %d초 음원으로 바꾸면 끝에서 15초 앞을 넘지 않아 %d～%d초로 돌린다', (duration, startTime, endTime) => {
    expect(rangesForNewAudio(duration, preview, null).preview).toEqual(previewDefault(startTime, endTime));
  });

  it('프리뷰 60～75초를 0.6초 음원으로 바꾸면 곡 전체 0～0.6초로 돌리고 페이드 0.5초를 구간 절반 0.3초로 자른다', () => {
    expect(rangesForNewAudio(0.6, preview, null).preview).toEqual({ startTime: 0, endTime: 0.6, fadeInTime: 0.3, fadeOutTime: 0.3 });
  });

  it('프리뷰 60～75초를 44100Hz 10초 음원으로 바꾸면 돌린 0～10초가 canEncodeWavRange를 통과하고 encodeWavBlob이 441000샘플 WAV를 만든다', () => {
    const samples = new Float32Array(441000);
    const audioBuffer = { length: samples.length, sampleRate: 44100, numberOfChannels: 1, getChannelData: () => samples } as unknown as AudioBuffer;

    const range = rangesForNewAudio(samples.length / 44100, preview, null).preview;

    expect(canEncodeWavRange(audioBuffer, range.startTime, range.endTime)).toBe(true);
    expect(encodeWavBlob(audioBuffer, range.startTime, range.endTime, range).size).toBe(44 + 441000 * 2);
  });
});

describe('구간 선택기를 끈 위치의 구간(dragRangeAt)', () => {
  /** 120초 음원을 폭 240px(1px = 0.5초)에 그린 선택기. 최소 1초, 최대는 음원 길이다. */
  const rect = { left: 0, width: 240 };
  const limits = { duration: 120, minRangeDuration: 1, maxRangeDuration: 120 };

  it('10～20초의 끝 핸들을 180px에 놓으면 끝이 90초가 되고 시작 10초는 그대로다', () => {
    expect(dragRangeAt({ mode: 'end', startX: 40, startTime: 10, endTime: 20 }, 180, rect, limits))
      .toEqual({ startTime: 10, endTime: 90 });
  });

  it('10～20초의 시작 핸들을 끝 너머 100px(50초)로 끌면 최소 길이 1초를 남긴 19초에서 멈춘다', () => {
    expect(dragRangeAt({ mode: 'start', startX: 20, startTime: 10, endTime: 20 }, 100, rect, limits))
      .toEqual({ startTime: 19, endTime: 20 });
  });

  it('10～20초 구간 안을 잡아 60px(30초) 옮기면 40～50초가 되고, 음원 끝 너머로 옮기면 110～120초에서 멈춘다', () => {
    const drag = { mode: 'move' as const, startX: 30, startTime: 10, endTime: 20 };
    expect(dragRangeAt(drag, 90, rect, limits)).toEqual({ startTime: 40, endTime: 50 });
    expect(dragRangeAt(drag, 1000, rect, limits)).toEqual({ startTime: 110, endTime: 120 });
  });
});

describe('누른 동안 포인터 위치의 구간(pressRangeAt)', () => {
  /** 120초 음원을 폭 240px(1px = 0.5초)에 그린 선택기. 최소 1초, 최대는 음원 길이다. */
  const rect = { left: 0, width: 240 };
  const limits = { duration: 120, minRangeDuration: 1, maxRangeDuration: 120 };
  /** 10～20초의 끝 핸들(40px)을 2px 옆 42px에서 잡은 누름. */
  const heldEnd: RangePress = { drag: { mode: 'end', startX: 42, startTime: 10, endTime: 20 },
    last: { startTime: 10, endTime: 20 }, moved: false };

  it('10～20초의 끝 핸들 2px 옆 42px을 눌러 42px에 그대로 있으면 끝이 21초로 튀지 않고 10～20초를 유지한다', () => {
    expect(pressRangeAt(heldEnd, 42, rect, limits).last).toEqual({ startTime: 10, endTime: 20 });
  });

  it.each([[44.9], [39.1]])('42px에서 누른 끝 핸들이 3px 미만으로 떨려 %spx에 있으면 클릭으로 보아 10～20초를 유지한다', clientX => {
    expect(pressRangeAt(heldEnd, clientX, rect, limits)).toBe(heldEnd);
  });

  it.each([[45, 22.5], [39, 19.5]])('42px에서 누른 끝 핸들이 정확히 3px 움직여 %spx에 이르면 끌기가 되어 끝이 %s초다', (clientX, endTime) => {
    expect(pressRangeAt(heldEnd, clientX, rect, limits)).toMatchObject({ last: { startTime: 10, endTime }, moved: true });
  });

  it('42px에서 누른 끝 핸들을 100px까지 끈 뒤 누른 자리에서 2px 떨어진 44px로 돌아오면 3px 안이어도 끌기이므로 끝이 22초다', () => {
    const dragged = pressRangeAt(heldEnd, 100, rect, limits);

    expect(pressRangeAt(dragged, 44, rect, limits).last).toEqual({ startTime: 10, endTime: 22 });
  });

  it('42px에서 누른 끝 핸들을 100px로 끌면 끝이 50초가 되고 움직인 누름이 된다', () => {
    expect(pressRangeAt(heldEnd, 100, rect, limits)).toMatchObject({ last: { startTime: 10, endTime: 50 }, moved: true });
  });

  it('42px에서 누른 끝 핸들을 100px까지 끈 뒤 누른 자리 42px로 돌아오면 끌기이므로 놓은 위치의 끝 21초다', () => {
    const dragged = pressRangeAt(heldEnd, 100, rect, limits);

    expect(pressRangeAt(dragged, 42, rect, limits).last).toEqual({ startTime: 10, endTime: 21 });
  });

  it('구간 밖을 눌러 95～105초로 옮긴 누름은 잡은 곳이 없어 포인터가 움직여도 95～105초를 유지한다', () => {
    const press: RangePress = { drag: null, last: { startTime: 95, endTime: 105 }, moved: false };

    expect(pressRangeAt(press, 10, rect, limits).last).toEqual({ startTime: 95, endTime: 105 });
  });
});

describe('구간 선택기를 다시 그리는 때(followRangeInput)', () => {
  const shown = { initialStart: 10, initialEnd: 20, initialFadeInTime: 1, initialFadeOutTime: 0.5 };

  it('선택기가 적용한 10～20초·페이드 1초가 store에 들어와 같은 값이 오면 다시 그리지 않는다(같은 key)', () => {
    const mount = { shown, generation: 3 };

    expect(followRangeInput(mount, { ...shown })).toBe(mount);
  });

  it('변경 취소·Undo로 페이드가 1초에서 저장된 0초로 바뀌면 새 값으로 다시 그린다(key 3→4)', () => {
    expect(followRangeInput({ shown, generation: 3 }, { ...shown, initialFadeInTime: 0 }))
      .toEqual({ shown: { ...shown, initialFadeInTime: 0 }, generation: 4 });
  });

  it('인게임 구간이 없던(undefined) 선택기에 저장된 2～110초가 오면 다시 그린다', () => {
    const empty = { initialStart: undefined, initialEnd: undefined, initialFadeInTime: undefined, initialFadeOutTime: undefined };

    expect(followRangeInput({ shown: empty, generation: 0 }, { ...empty, initialStart: 2, initialEnd: 110 }).generation).toBe(1);
  });
});
