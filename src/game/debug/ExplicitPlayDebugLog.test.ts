import { afterEach, describe, expect, it, vi } from 'vitest';
import { explicitPlaytestCharts } from '../../lab/explicitPlaytestCharts';
import { compileExplicitJudgmentChart } from '../judgment/explicitCompiledChart';
import { ExplicitJudgmentSession } from '../judgment/ExplicitJudgmentSession';
import { ExplicitPlayDebugLog } from './ExplicitPlayDebugLog';

function create() {
  const chart = compileExplicitJudgmentChart(explicitPlaytestCharts[0].chart);
  return { session: new ExplicitJudgmentSession(chart), log: new ExplicitPlayDebugLog(chart,
    { playbackRate: 2, outputLatencyMs: 20, inputOffsetMs: -40, visualOffsetMs: 70 }) };
}
const observation = { songTimeMs: 1500, inputTimeMs: 1420, visualTimeMs: 1640, frameDeltaMs: 16 };
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('명시 플레이 debug log', () => {
  it('탭1000·틱1500을 기록하면 source·kind·실제 관측 시각과 틱 timing=n/a를 남기고 재조회로 효과를 중복하지 않는다', () => {
    const { session, log } = create();
    session.processBatch(1000, [{ type: 'down', lane: 1, key: 'KeyQ' }]); session.advance(1500);
    log.record(session, observation); log.record(session, observation);
    const text = log.exportAsText();
    expect(text).toContain('"kind":"tap"'); expect(text).toContain('"kind":"tick"');
    expect(text).toContain('"source":{"noteIndex":'); expect(text).toContain('"songTimeMs":1500');
    expect(text).toContain('"inputTimeMs":1420'); expect(text).toContain('"visualTimeMs":1640');
    expect(text).toContain('"frameDeltaMs":16'); expect(text).toContain('timing=n/a');
    expect(text.split('\n').filter(line => line.startsWith('effect '))).toHaveLength(2);
  });

  it('1500 이후2000을 쳤다가1500으로 되감으면 이전 시도 폐기를 표시하고 복원 효과는 다시 기록하지 않는다', () => {
    const { session, log } = create();
    session.processBatch(1000, [{ type: 'down', lane: 1, key: 'KeyQ' }]); session.advance(1500);
    log.record(session, observation);
    session.processBatch(2000, [{ type: 'up', lane: 1, key: 'KeyQ' }]); log.record(session, { ...observation, songTimeMs: 2000 });
    const restored = session.reconstructAt(1500).session;
    log.rewind(1500, restored); log.record(restored, observation);
    expect(log.exportAsText()).toContain('rewind branch=1 targetMs=1500');
    expect(log.exportAsText()).toContain('previous branch are discarded');
    expect(log.exportAsText()).not.toContain('effect branch=1');
    restored.processBatch(2000, [{ type: 'up', lane: 1, key: 'KeyQ' }]);
    log.record(restored, { ...observation, songTimeMs: 2000 });
    log.finish(restored.finalize());
    expect(log.exportAsText().split('\n').filter(line => line.startsWith('effect branch=1'))).toHaveLength(1);
    expect(log.exportAsText()).toContain('final branch=1');
  });

  it('완주 뒤 Quit가 다시 export를 요청해도 Blob 다운로드와 URL 해제는 각각1회다', () => {
    const click = vi.fn(); vi.stubGlobal('document', { createElement: () => ({ click }) });
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:debug');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const { log } = create(); log.download(); log.download();
    expect(click).toHaveBeenCalledOnce(); expect(createUrl).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:debug');
  });

  it('브라우저 다운로드가 실패해도 예외를 던지지 않고 URL을1회 해제한다', () => {
    vi.stubGlobal('document', { createElement: () => ({ click: () => { throw new Error('download'); } }) });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:debug');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { log } = create(); expect(() => log.download()).not.toThrow(); log.download();
    expect(warn).toHaveBeenCalledOnce(); expect(revoke).toHaveBeenCalledOnce();
  });
});
