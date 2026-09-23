import type { FlightScenario } from '../../../shared/chartDifficulty';

export interface FlightBackgroundOptions {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  resolution: number;
  scenario: FlightScenario;
}

export interface FlightBackgroundDriver {
  render(altitude: number, deltaSeconds: number): void;
  reset(): void;
  dispose(): void;
}

export interface FlightBackgroundDriverOptions {
  container: HTMLDivElement;
  width: number;
  height: number;
  resolution: number;
  scenario: FlightScenario;
}

export type FlightDriverFactory = (options: FlightBackgroundDriverOptions) => Promise<FlightBackgroundDriver>;

async function loadDriver(scenario: FlightScenario): Promise<FlightDriverFactory> {
  return scenario === 'breakthrough'
    ? (await import('./breakthrough.mjs')).createBreakthroughBackground
    : (await import('./approach.mjs')).createApproachBackground;
}

/** 독립 RAF 없이 게임 프레임과 수명을 공유하는 배경. 입력은 앞쪽 게임 캔버스가 받는다. */
export class FlightBackground {
  private driver: FlightBackgroundDriver | null = null;
  private disposed = false;
  private readonly container: HTMLDivElement;
  private readonly reducedMotion: boolean;
  private readonly canvasPosition: string;

  constructor(private readonly options: FlightBackgroundOptions) {
    this.container = document.createElement('div');
    this.container.dataset.flightBackground = options.scenario;
    this.container.setAttribute('aria-hidden', 'true');
    this.canvasPosition = options.canvas.style.position;
    options.canvas.style.position = 'relative';
    Object.assign(this.container.style, {
      position: 'absolute', inset: '0', pointerEvents: 'none', overflow: 'hidden', background: '#080e1b',
    });
    options.canvas.before(this.container);
    this.reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  async init(factory?: FlightDriverFactory): Promise<void> {
    const create = factory ?? await loadDriver(this.options.scenario);
    if (this.disposed) return;
    const driver = await create({ ...this.options, container: this.container });
    if (this.disposed) { driver.dispose(); return; }
    this.driver = driver;
    this.render(1, 0);
    this.container.dataset.ready = 'true';
  }

  render(altitude: number, deltaMs: number): void {
    if (this.disposed || !this.driver) return;
    const value = Number.isFinite(altitude) ? Math.min(1, Math.max(0, altitude)) : 0;
    const dt = this.reducedMotion || document.hidden || !Number.isFinite(deltaMs)
      ? 0 : Math.min(.05, Math.max(0, deltaMs / 1000));
    this.driver.render(value, dt);
    this.container.dataset.altitude = String(value);
  }

  reset(): void { if (!this.disposed) this.driver?.reset(); }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.driver?.dispose();
    this.driver = null;
    this.container.remove();
    this.options.canvas.style.position = this.canvasPosition;
  }
}
