/** 한 엔진에서 element와 MediaElementAudioSourceNode를 각각 한 번만 만든다. 시계·gain은 AudioEngine 소유다. */
export class PitchPreservingMedia {
  private readonly element = new Audio();
  private readonly source: MediaElementAudioSourceNode;
  private objectUrl: string | null = null;
  private preparation: Promise<void> | null = null;
  private cancelPreparation: (() => void) | null = null;
  private playGeneration = 0;

  constructor(ctx: AudioContext, onEnded: () => void, private readonly onPlaybackError: (error: unknown) => void) {
    const element = this.element;
    element.preload = 'auto';
    const pitch = element as Partial<HTMLAudioElement> & {
      mozPreservesPitch?: boolean; webkitPreservesPitch?: boolean;
    };
    if ('preservesPitch' in pitch) pitch.preservesPitch = true;
    else if ('mozPreservesPitch' in pitch) pitch.mozPreservesPitch = true;
    else if ('webkitPreservesPitch' in pitch) pitch.webkitPreservesPitch = true;
    this.source = ctx.createMediaElementSource(element);
    element.onended = () => { if (element.ended) onEnded(); };
  }

  get positionSeconds(): number { return this.element.currentTime; }
  set playbackRate(rate: number) { this.element.playbackRate = rate; }

  load(blob: Blob): void {
    this.clear();
    this.objectUrl = URL.createObjectURL(blob);
    this.element.src = this.objectUrl;
    this.element.load();
  }

  prepare(): Promise<void> {
    if (!this.objectUrl) return Promise.reject(new Error('No pitch-preserving audio loaded'));
    this.preparation ??= new Promise<void>((resolve, reject) => {
      const element = this.element;
      const finish = (error?: Error) => {
        clearTimeout(timeout);
        element.removeEventListener('loadeddata', ready);
        element.removeEventListener('canplaythrough', ready);
        element.removeEventListener('error', failed);
        this.cancelPreparation = null;
        if (error) reject(error); else resolve();
      };
      const ready = () => { if (element.readyState >= 2) finish(); };
      const failed = () => finish(new Error(`Pitch-preserving audio failed to load (media error ${element.error?.code ?? 'unknown'})`));
      const timeout = setTimeout(() => finish(new Error('Pitch-preserving audio was not ready after 5000ms')), 5000);
      this.cancelPreparation = () => finish(new Error('Pitch-preserving audio preparation cancelled by load/dispose'));
      element.addEventListener('loadeddata', ready);
      element.addEventListener('canplaythrough', ready);
      element.addEventListener('error', failed);
      if (element.error) failed(); else ready();
    });
    return this.preparation;
  }

  /** null은 pause 당시 element 위치를 그대로 잇는다. 보정된 엔진 시계로 seek하지 않는다. */
  start(gain: GainNode, positionSeconds: number | null, rate: number): void {
    this.source.connect(gain);
    this.playbackRate = rate;
    if (positionSeconds !== null) this.seek(positionSeconds);
    const generation = ++this.playGeneration;
    const failed = (error: unknown) => {
      // pause/load가 취소한 과거 play의 AbortError는 현재 시도의 실패가 아니다.
      if (generation === this.playGeneration) this.onPlaybackError(error);
    };
    try { void this.element.play().catch(failed); } catch (error) {
      // Promise 거부와 같은 순서로 전달해 호출자가 재생 상태를 설정한 뒤 pause하게 한다.
      queueMicrotask(() => failed(error));
    }
  }

  seek(positionSeconds: number): void { this.element.currentTime = positionSeconds; }

  pause(): void {
    this.playGeneration++;
    this.element.pause();
    this.source.disconnect();
  }

  clear(): void {
    this.cancelPreparation?.();
    this.preparation = null;
    this.pause();
    this.element.removeAttribute('src');
    this.element.load();
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = null;
  }

  dispose(): void {
    this.element.onended = null;
    this.clear();
  }
}
