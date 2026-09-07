import { describe, expect, it, vi } from "vitest";
import { createWaveformFeed } from "./waveformFeed";

// AudioBuffer는 실제 디코딩 없이 식별 가능한 최소 스텁으로 대체한다.
function fakeBuffer(label: string): AudioBuffer {
  return { _label: label } as unknown as AudioBuffer;
}

describe("createWaveformFeed", () => {
  it("오디오가 먼저 도착하고 렌더러가 나중에 준비되면 준비 시점에 apply가 1번 호출된다", () => {
    const apply = vi.fn();
    const feed = createWaveformFeed(apply);
    const buf = fakeBuffer("a");

    feed.audioArrived(buf);
    expect(apply).not.toHaveBeenCalled(); // 렌더러 준비 전엔 대기

    feed.rendererReady();
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith(buf);
  });

  it("렌더러가 먼저 준비되고 오디오가 나중에 도착하면 도착 시점에 apply가 1번 호출된다", () => {
    const apply = vi.fn();
    const feed = createWaveformFeed(apply);
    const buf = fakeBuffer("a");

    feed.rendererReady();
    expect(apply).not.toHaveBeenCalled(); // 버퍼 도착 전엔 대기

    feed.audioArrived(buf);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith(buf);
  });

  it("오디오만 도착하고 렌더러가 준비 안 되면 apply가 호출되지 않는다", () => {
    const apply = vi.fn();
    const feed = createWaveformFeed(apply);

    feed.audioArrived(fakeBuffer("a"));
    expect(apply).not.toHaveBeenCalled();
  });

  it("렌더러만 준비되고 오디오가 안 오면 apply가 호출되지 않는다", () => {
    const apply = vi.fn();
    const feed = createWaveformFeed(apply);

    feed.rendererReady();
    expect(apply).not.toHaveBeenCalled();
  });

  it("둘 다 준비된 뒤 렌더러 준비가 다시 호출돼도 재-apply되지 않는다", () => {
    const apply = vi.fn();
    const feed = createWaveformFeed(apply);
    const buf = fakeBuffer("a");

    feed.audioArrived(buf);
    feed.rendererReady();
    expect(apply).toHaveBeenCalledTimes(1);

    feed.rendererReady(); // 멱등: 보류 버퍼 없음
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it("적용 후 새 오디오가 도착하면 새 버퍼로 apply가 다시 호출된다", () => {
    const apply = vi.fn();
    const feed = createWaveformFeed(apply);
    const first = fakeBuffer("first");
    const second = fakeBuffer("second");

    feed.audioArrived(first);
    feed.rendererReady();
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenLastCalledWith(first);

    feed.audioArrived(second); // 메타 모달 재-import
    expect(apply).toHaveBeenCalledTimes(2);
    expect(apply).toHaveBeenLastCalledWith(second);
  });

  it("렌더러 준비 전 오디오가 두 번 도착하면 마지막 버퍼로만 apply된다", () => {
    const apply = vi.fn();
    const feed = createWaveformFeed(apply);
    const stale = fakeBuffer("stale");
    const latest = fakeBuffer("latest");

    feed.audioArrived(stale);
    feed.audioArrived(latest);
    feed.rendererReady();

    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith(latest);
  });
});
