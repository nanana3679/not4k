import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FlightBackground, type FlightBackgroundDriver } from './FlightBackground';

function element() {
  return { style: { position: '' }, dataset: {}, setAttribute: vi.fn(), before: vi.fn(), remove: vi.fn() };
}
function setup() {
  const canvas = element();
  const background = new FlightBackground({ canvas: canvas as unknown as HTMLCanvasElement, width: 1280, height: 720, resolution: 1, scenario: 'breakthrough' });
  const driver = { render: vi.fn(), reset: vi.fn(), dispose: vi.fn() };
  return { canvas, background, driver };
}

beforeEach(() => {
  vi.stubGlobal('document', { hidden: false, createElement: () => element() });
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
});
afterEach(() => vi.unstubAllGlobals());

describe('게임 비행 배경 수명과 시간', () => {
  it('고도 .25와 16ms 프레임을 받으면 동일 고도와 .016초를 렌더러에 전달한다', async () => {
    const { background, driver } = setup();
    await background.init(async () => driver);
    background.render(.25, 16);
    expect(driver.render).toHaveBeenLastCalledWith(.25, .016);
  });

  it('일시정지 0ms는 이동하지 않고 재개 시 5초 간격은 .05초로 제한한다', async () => {
    const { background, driver } = setup();
    await background.init(async () => driver);
    background.render(.4, 0);
    expect(driver.render).toHaveBeenLastCalledWith(.4, 0);
    background.render(.4, 5000);
    expect(driver.render).toHaveBeenLastCalledWith(.4, .05);
  });

  it('움직임 줄이기에서는 고도 .7을 표시해도 배경 시간은 0초만 진행한다', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const { background, driver } = setup();
    await background.init(async () => driver);
    background.render(.7, 16);
    expect(driver.render).toHaveBeenLastCalledWith(.7, 0);
  });

  it('숨긴 탭과 NaN 시간은 이동하지 않으며 고도 2는 1로 제한한다', async () => {
    const { background, driver } = setup();
    await background.init(async () => driver);
    Object.defineProperty(document, 'hidden', { value: true });
    background.render(2, 100);
    expect(driver.render).toHaveBeenLastCalledWith(1, 0);
    background.render(NaN, NaN);
    expect(driver.render).toHaveBeenLastCalledWith(0, 0);
  });

  it('reset은 같은 배경을 초기화하고 dispose 두 번은 GPU 자원을 한 번만 해제한다', async () => {
    const { canvas, background, driver } = setup();
    await background.init(async () => driver);
    background.reset();
    expect(driver.reset).toHaveBeenCalledOnce();
    background.dispose(); background.dispose();
    expect(driver.dispose).toHaveBeenCalledOnce();
    expect(canvas.style.position).toBe('');
    driver.render.mockClear();
    background.render(.5, 16);
    expect(driver.render).not.toHaveBeenCalled();
  });

  it('배경 로딩 중 화면을 떠나면 늦게 생성된 드라이버도 해제하고 그리지 않는다', async () => {
    const { background, driver } = setup();
    let finish!: (value: FlightBackgroundDriver) => void;
    const pending = background.init(() => new Promise(resolve => { finish = resolve; }));
    background.dispose();
    finish(driver);
    await pending;
    expect(driver.dispose).toHaveBeenCalledOnce();
    expect(driver.render).not.toHaveBeenCalled();
  });
});
