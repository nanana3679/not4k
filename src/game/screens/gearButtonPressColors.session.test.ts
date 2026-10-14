import { describe, expect, it } from 'vitest';
import type { NoteEntity } from '../../shared';
import { AutoPlayer } from '../input/AutoPlayer';
import { InputTimeline } from '../input/InputTimeline';
import { compileJudgmentChart } from '../judgment/compiledJudgmentChart';
import { NoteJudgmentSession } from '../judgment/NoteJudgmentSession';
import { body, point } from '../judgment/noteJudgmentTestHarness';
import { GEAR_BUTTON_GEOMETRY, GearButtonState, type GearButtonColor } from '../renderer/gearButtons';
import { GameClock } from '../time/GameClock';
import { GearButtonPressColors } from './gearButtonPressColors';
import { stepPlaySession } from './playSessionInput';

function play(notes: readonly NoteEntity[], auto = false, offset = 0) {
  const starts = notes.map(note => note.beat.n / note.beat.d);
  const ends = new Map(notes.flatMap((note, index) => 'endBeat' in note ? [[index, note.endBeat.n / note.endBeat.d] as const] : []));
  const compiled = compileJudgmentChart(notes, starts, ends);
  const colors = new GearButtonPressColors(notes);
  const session = new NoteJudgmentSession(compiled, { onDownConsumed: colors.onDownConsumed });
  const timeline = new InputTimeline();
  const player = new AutoPlayer(notes, new Map(starts.map((at, index) => [index, at])), ends, auto ? [{ startMs: 0, endMs: 5000 }] : [], compiled);
  const audio = { currentTimeMs: 0, playbackRate: 1, getOutputLatencyMs: () => 0 };
  const clock = new GameClock(audio, { visualOffsetMs: 0, inputOffsetMs: offset }, () => audio.currentTimeMs);
  const state = new GearButtonState();
  const applied: [string, boolean, GearButtonColor][] = [];
  const target = {
    setGearButtonKey(_lane: number, key: string, pressed: boolean, color?: GearButtonColor) {
      if (pressed) state.press(key, color);
      else state.release(key);
      applied.push([key, pressed, state.color]);
    },
  };
  return {
    state, session, timeline, applied,
    input(inputAt: number, key: string, type: 'down' | 'up') {
      timeline.enqueue({ inputAt, key, type, lane: 1 });
    },
    frame(at: number) {
      audio.currentTimeMs = at;
      stepPlaySession(timeline, session, player, clock, at, colors.onInput);
      colors.flush(target);
      state.advance(16, GEAR_BUTTON_GEOMETRY.release);
    },
  };
}

describe('GearButtonPressColors — 실제 입력 큐·Session·버튼 통합', () => {
  it('한 프레임에 A가 1000ms 더블을 치고 1001ms에 뗀 뒤 1005ms에 공입력으로 다시 눌리면 마지막 누름은 키 1개라 연파랑이다', () => {
    const p = play([point(1000, 'double')]);
    p.input(1000, 'A', 'down');
    p.input(1001, 'A', 'up');
    p.input(1005, 'A', 'down');
    p.frame(1010);
    expect(p.applied).toEqual([['A', true, 'double'], ['A', false, 'double'], ['A', true, 'single']]);
    expect(p.state).toMatchObject({ phase: 'pressed', heldKeys: 1, color: 'single' });
  });

  it('한 프레임에 1000ms AutoPlayer 싱글 뒤 1005ms 수동 A 공입력을 처리하면 합성 키도 포함한 키 2개라 금색이다', () => {
    const p = play([point(1000)], true);
    p.input(1005, 'A', 'down');
    p.frame(1010);
    expect(p.applied).toEqual([['auto_1_0_a', true, 'single'], ['A', true, 'double']]);
    expect(p.state).toMatchObject({ phase: 'pressed', heldKeys: 2, color: 'double' });
  });

  it('같은 1000ms에 A down→up→down을 처리해도 첫 소비만 금색이고 마지막 공입력은 연파랑이다', () => {
    const p = play([point(1000, 'double')]);
    p.input(1000, 'A', 'down');
    p.input(1000, 'A', 'up');
    p.input(1000, 'A', 'down');
    p.frame(1010);
    expect(p.applied).toEqual([['A', true, 'double'], ['A', false, 'double'], ['A', true, 'single']]);
  });

  it.each([1000, 1080])('core 시각 %ims에서 1000ms 큐가 B down·A up 순서여도 실제 적용 순서 A up·B down으로 재생해 B는 연파랑이다', coreAt => {
    const p = play([]);
    p.input(900, 'A', 'down');
    p.frame(coreAt);
    p.applied.length = 0;
    p.input(1000, 'B', 'down');
    p.input(1000, 'A', 'up');
    p.frame(1090);
    expect(p.applied).toEqual([['A', false, 'single'], ['B', true, 'single']]);
    expect(p.state).toMatchObject({ phase: 'pressed', color: 'single', heldKeys: 1 });
  });

  it('입력 +200ms로 곡 시각 1000ms보다 앞선 1200ms down도 이번 프레임에 모두 비우고 바로 연파랑으로 보인다', () => {
    const p = play([], false, 200);
    p.input(1200, 'A', 'down');
    expect(p.state.phase).toBe('idle');
    p.frame(1000);
    expect(p.timeline.size).toBe(0);
    expect(p.session.core.time).toBe(1200);
    expect(p.state).toMatchObject({ phase: 'pressed', color: 'single', heldKeys: 1 });
  });

  it('일시정지 중 큐에 쌓인 A down·up은 표시를 바꾸지 않고 재개 프레임에 releasing·0ms로 보여 짧은 탭을 보존한다', () => {
    const p = play([]);
    p.frame(900);
    p.input(1000, 'A', 'down');
    p.input(1005, 'A', 'up');
    expect(p.state.phase).toBe('idle');
    p.frame(1010);
    expect(p.state).toMatchObject({ phase: 'releasing', releaseMs: 0, heldKeys: 0 });
  });

  it('일시정지로 J가 멈춘 동안 A down이 999ms·up이 996ms로 큐에 들어가 up이 먼저 와도 재개 프레임에 누른 뒤 떼어 버튼이 돌아온다', () => {
    const p = play([]);
    p.frame(900);
    p.input(999, 'A', 'down');
    p.input(996, 'A', 'up');
    p.frame(1010);
    expect(p.applied).toEqual([['A', true, 'single'], ['A', false, 'single']]);
    expect(p.state).toMatchObject({ phase: 'releasing', releaseMs: 0, heldKeys: 0 });
    p.input(1100, 'A', 'down');
    p.frame(1110);
    expect(p.state).toMatchObject({ phase: 'pressed', heldKeys: 1 });
  });

  it('일시정지 중 A를 두 번 탭해 down 999·up 996·down 998·up 995ms로 들어가 up·up·down·down 순서여도 재개 뒤 버튼이 돌아온다', () => {
    const p = play([]);
    p.frame(900);
    p.input(999, 'A', 'down');
    p.input(996, 'A', 'up');
    p.input(998, 'A', 'down');
    p.input(995, 'A', 'up');
    p.frame(1010);
    expect(p.state).toMatchObject({ phase: 'releasing', heldKeys: 0 });
  });

  it('일시정지 중 A를 탭한 뒤 다시 눌러 down 999·up 996·down 998ms로 들어가면 재개 뒤 마지막 누름이 남아 버튼이 눌려 있다', () => {
    const p = play([]);
    p.frame(900);
    p.input(999, 'A', 'down');
    p.input(996, 'A', 'up');
    p.input(998, 'A', 'down');
    p.frame(1010);
    expect(p.state).toMatchObject({ phase: 'pressed', heldKeys: 1 });
    p.input(1100, 'A', 'up');
    p.frame(1110);
    expect(p.state).toMatchObject({ phase: 'releasing', heldKeys: 0 });
  });

  it('일시정지 중 down 995·up 999·down 997ms로 들어가 down·down·up 순서면 판정 core처럼 뗀 모습이 되고 다음 뗌·누름에서 정상으로 돌아온다', () => {
    const p = play([]);
    p.frame(900);
    p.input(995, 'A', 'down');
    p.input(999, 'A', 'up');
    p.input(997, 'A', 'down');
    p.frame(1010);
    expect(p.state).toMatchObject({ phase: 'releasing', heldKeys: 0 });
    p.input(1100, 'A', 'up');
    p.frame(1110);
    p.input(1200, 'A', 'down');
    p.frame(1210);
    expect(p.state).toMatchObject({ phase: 'pressed', heldKeys: 1 });
  });

  it('자동 구간에서 0~1000ms doubleLong 뒤 1000ms single 헤드·1000~2000ms doubleLong을 AutoPlayer가 이어 눌러도 끝나면 버튼이 눌린 채 남지 않는다', () => {
    const p = play([body(0, 1000, 'doubleLong'), point(1000), body(1000, 2000, 'doubleLong')], true);
    for (let at = 0; at <= 3000; at += 100) p.frame(at);
    expect(p.state).toMatchObject({ heldKeys: 0 });
    expect(p.state.phase).not.toBe('pressed');
    p.input(3050, 'A', 'down');
    p.frame(3100);
    expect(p.state).toMatchObject({ phase: 'pressed', heldKeys: 1, color: 'single' });
  });

  it('1000ms single 헤드·doubleLong 바디에 A·B를 누르면 A는 연파랑, 남은 unit을 시작한 B는 금색으로 재생한다', () => {
    const p = play([point(1000), body(1000, 2000, 'doubleLong')]);
    p.input(1000, 'A', 'down');
    p.input(1005, 'B', 'down');
    p.frame(1010);
    expect(p.applied).toEqual([['A', true, 'single'], ['B', true, 'double']]);
  });
});
