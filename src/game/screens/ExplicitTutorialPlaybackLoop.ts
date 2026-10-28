interface TutorialLoopSession {
  readonly iteration: number;
  advanceTo(timeMs: number): void;
  repeat(endTimeMs: number): unknown;
}
interface TutorialLoopPresentation {
  render(localTimeMs: number, deltaMs: number): void;
  restarted(iteration: number): void;
  completed(): void;
  failed(reason: unknown): void;
}

/** RAF 수명만 소유한다. 판정·최종 정산·새 세션은 tutorial controller가 소유한다. */
export class ExplicitTutorialPlaybackLoop {
  private frame: number | null = null;
  private origin: number | null = null;
  private previous: number | null = null;
  private closed = false;
  private completed = false;

  constructor(private readonly session: TutorialLoopSession, private readonly endAt: number,
    private readonly presentation: TutorialLoopPresentation, private repeat = true) {}

  start(): void {
    if (this.closed || this.frame !== null) return;
    if (this.completed) {
      this.session.repeat(this.endAt);
      this.origin = null; this.previous = null; this.completed = false;
      this.presentation.restarted(this.session.iteration);
    }
    this.frame = requestAnimationFrame(this.step);
  }

  setRepeat(enabled: boolean): void {
    this.repeat = enabled;
    if (enabled && this.completed) this.start();
  }

  dispose(): void {
    this.closed = true;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  private readonly step = (now: number) => {
    this.frame = null;
    if (this.closed) return;
    try {
      this.origin ??= now;
      const local = Math.min(this.endAt, now - this.origin);
      this.session.advanceTo(local);
      this.presentation.render(local, this.previous === null ? 0 : now - this.previous);
      this.previous = now;
      if (local === this.endAt) {
        this.completed = true;
        if (!this.repeat) { this.presentation.completed(); return; }
      }
      this.start();
    } catch (reason) { this.dispose(); this.presentation.failed(reason); }
  };
}
