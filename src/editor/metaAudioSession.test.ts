import { describe, expect, it, vi } from 'vitest';
import { createMetaAudioSession, type MetaAudioPick, type MetaAudioPlayback } from './metaAudioSession';

const oldBuffer = { duration: 120 } as AudioBuffer;
const nextBuffer = { duration: 5 } as AudioBuffer;

/** 재생기처럼 로드에 성공하면 버퍼를 바꾸고, 실패하면 이전 버퍼를 그대로 둔다. */
function harness() {
  const loads = new Map<File, { resolve: () => void; reject: (error: Error) => void }>();
  const playback: MetaAudioPlayback & { buffer: AudioBuffer | null } = {
    buffer: oldBuffer as AudioBuffer | null,
    get audioBufferData() { return this.buffer; },
    loadAudioFile: vi.fn((file: File) => new Promise<void>((resolve, reject) => {
      loads.set(file, { resolve: () => { playback.buffer = file.name === 'next.ogg' ? nextBuffer : { duration: 1 } as AudioBuffer; resolve(); }, reject });
    })),
    restoreAudioBuffer: vi.fn((buffer: AudioBuffer) => { playback.buffer = buffer; }),
  };
  const state = { pick: null as MetaAudioPick | null, loading: false, shown: oldBuffer as AudioBuffer | null };
  const onLoadFailed = vi.fn();
  const session = createMetaAudioSession({
    setPick: pick => { state.pick = pick; },
    setAudioLoading: loading => { state.loading = loading; },
    setLoadedAudioBuffer: buffer => { state.shown = buffer; },
    onLoadFailed,
  });
  return { session, playback, loads, state, onLoadFailed };
}

describe('Meta 창 한 번의 음원 선택', () => {
  it('120초 음원 위에 broken.ogg 로드가 실패하면 표시 음원을 120초로 되돌리고 고른 파일을 실패로 남기며 로딩을 끈다', async () => {
    const { session, playback, loads, state, onLoadFailed } = harness();
    const broken = new File(['x'], 'broken.ogg');
    const loading = session.load(playback, broken);
    expect(state).toMatchObject({ pick: { file: broken, status: 'loading' }, loading: true, shown: null });

    loads.get(broken)!.reject(new Error('decode failed'));
    await loading;

    expect(state).toEqual({ pick: { file: broken, status: 'failed' }, loading: false, shown: oldBuffer });
    expect(onLoadFailed).toHaveBeenCalledOnce();
  });

  it('next.ogg를 불러온 뒤 적용 없이 닫으면 재생기를 120초 음원으로 되돌리고 고른 파일을 비운다', async () => {
    const { session, playback, loads, state } = harness();
    const next = new File(['x'], 'next.ogg');
    const loading = session.load(playback, next);
    loads.get(next)!.resolve();
    await loading;
    expect(state.pick).toEqual({ file: next, status: 'loaded' });
    expect(playback.audioBufferData).toBe(nextBuffer);

    session.cancel(playback);

    expect(playback.restoreAudioBuffer).toHaveBeenCalledExactlyOnceWith(oldBuffer);
    expect(playback.audioBufferData).toBe(oldBuffer);
    expect(state.pick).toBeNull();
  });

  it('next.ogg를 불러와 적용하면 재생기는 5초 next 음원을 유지하고 다음 창의 취소는 next로 돌아간다', async () => {
    const { session, playback, loads } = harness();
    const next = new File(['x'], 'next.ogg');
    const loading = session.load(playback, next);
    loads.get(next)!.resolve();
    await loading;

    session.apply();
    session.cancel(playback);

    expect(playback.restoreAudioBuffer).not.toHaveBeenCalled();
    expect(playback.audioBufferData).toBe(nextBuffer);
  });

  it('a.ogg 로딩 중 next.ogg를 고르고 a가 늦게 실패해도 next만 반영해 실패 안내 0회·로딩 끔이다', async () => {
    const { session, playback, loads, state, onLoadFailed } = harness();
    const first = new File(['a'], 'a.ogg');
    const next = new File(['x'], 'next.ogg');
    const firstLoading = session.load(playback, first);
    const nextLoading = session.load(playback, next);
    loads.get(next)!.resolve();
    await nextLoading;
    loads.get(first)!.reject(new Error('superseded'));
    await firstLoading;

    expect(state).toMatchObject({ pick: { file: next, status: 'loaded' }, loading: false });
    expect(onLoadFailed).not.toHaveBeenCalled();
  });

  it('next.ogg 로딩 중 창을 닫으면 로딩을 끄고 재생기를 120초 음원으로 되돌리며 늦은 완료는 고른 파일을 되살리지 않는다', async () => {
    const { session, playback, loads, state } = harness();
    const next = new File(['x'], 'next.ogg');
    const loading = session.load(playback, next);

    session.cancel(playback);
    expect(state).toMatchObject({ pick: null, loading: false });
    expect(playback.restoreAudioBuffer).toHaveBeenCalledExactlyOnceWith(oldBuffer);
    loads.get(next)!.reject(new Error('superseded'));
    await loading;

    expect(state).toMatchObject({ pick: null, loading: false });
  });

  it('창을 열 때 음원이 없으면 next.ogg를 불러오고 닫아도 되돌릴 음원이 없어 재생기를 그대로 둔다', async () => {
    const { session, playback, loads } = harness();
    playback.buffer = null;
    const next = new File(['x'], 'next.ogg');
    const loading = session.load(playback, next);
    loads.get(next)!.resolve();
    await loading;

    session.cancel(playback);

    expect(playback.restoreAudioBuffer).not.toHaveBeenCalled();
    expect(playback.audioBufferData).toBe(nextBuffer);
  });
});
