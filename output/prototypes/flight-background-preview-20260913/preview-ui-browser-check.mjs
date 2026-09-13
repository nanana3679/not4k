import { strict as assert } from 'node:assert';
import { chromium } from '@playwright/test';

const publicUrl = process.env.PREVIEW_URL;
if (!publicUrl) throw new Error('PREVIEW_URL 환경 변수에 실행 중인 미리보기 URL을 지정하세요.');

const views = [
  ['liftoff', ['altitude']],
  ['infiltration', ['altitude']],
  ['breakthrough', ['altitude']],
];

async function waitForView(page, view) {
  await page.waitForFunction(selected => document.querySelector('#preview-frame')?.contentWindow?.location.pathname.includes(`/flight/${selected}/`), view);
  const frame = page.frameLocator('#preview-frame');
  if (view === 'breakthrough') await frame.locator('body[data-ready="true"]').waitFor();
  else await frame.locator('#scene').evaluate(element => new Promise(resolve => {
    if (element.dataset.ready === 'true') return resolve();
    const observer = new MutationObserver(() => {
      if (element.dataset.ready === 'true') { observer.disconnect(); resolve(); }
    });
    observer.observe(element, { attributes: true });
  }));
  return frame;
}

async function setApproachAltitude(frame, value) {
  await frame.locator('#altitude').evaluate((element, nextValue) => {
    element.value = String(nextValue);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
  await frame.locator('#scene').evaluate((element, target) => new Promise((resolve, reject) => {
    const deadline = performance.now() + 5000;
    const check = () => {
      if (Math.abs(Number(element.dataset.altitude) - target) < .02) return resolve();
      if (performance.now() > deadline) return reject(new Error(`고도 ${target} 렌더 대기 시간 초과: ${element.dataset.altitude}`));
      requestAnimationFrame(check);
    };
    check();
  }), value / 100);
}

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const checks = [];
try {
  for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    const response = await page.goto(publicUrl);
    assert.equal(response.status(), 200);
    assert.deepEqual(await page.locator('button[data-view]').allTextContents(), ['LIFTOFF', 'INFILTRATION', 'BREAKTHROUGH']);
    assert.equal(await page.locator('h1').count(), 0);
    checks.push(`${viewport.width}px 공개 셸은 영어 장면 탭만 표시한다`);

    const widths = [];
    for (const [view, expectedSliders] of views) {
      if (view !== 'liftoff') await page.locator(`[data-view="${view}"]`).click();
      const frame = await waitForView(page, view);

      const state = await frame.locator('body').evaluate(body => {
        const shown = element => {
          const style = getComputedStyle(element);
          const bounds = element.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && bounds.width > 2 && bounds.height > 2;
        };
        const ranges = [...body.querySelectorAll('input[type=range]')].filter(shown);
        const buttons = [...body.querySelectorAll('button')].filter(shown);
        const text = [...body.querySelectorAll('h1,h2,h3,p,small,strong,summary,footer,.hud,.caption,.stage-label')]
          .filter(shown)
          .filter(element => parseFloat(getComputedStyle(element).fontSize) > 0)
          .map(element => element.textContent.trim())
          .filter(Boolean);
        return {
          ranges: ranges.map(element => element.id),
          buttons: buttons.map(element => element.id),
          text,
          overflow: document.documentElement.scrollWidth > innerWidth + 1 || document.documentElement.scrollHeight > innerHeight + 1,
        };
      });
      assert.deepEqual(state.ranges, expectedSliders);
      assert.deepEqual(state.buttons, []);
      assert.deepEqual(state.text, []);
      assert.equal(state.overflow, false);
      for (const sliderId of expectedSliders) {
        const bounds = await frame.locator(`#${sliderId}`).boundingBox();
        assert.ok(bounds && bounds.height >= 44 && bounds.width >= viewport.width - 40, `${viewport.width}px ${view} ${sliderId} 크기: ${JSON.stringify(bounds)}`);
        widths.push(bounds.width);
      }
      checks.push(`${viewport.width}px ${view}는 ${expectedSliders.join('·')} 슬라이더만 표시한다`);
      if (view === 'breakthrough') {
        assert.equal(await frame.locator('body').evaluate(() => window.flightStudy.snapshot().backdropBrightness), 10);
        checks.push(`${viewport.width}px breakthrough 배경 밝기는 10%로 고정된다`);
        await frame.locator('#altitude').evaluate(element => {
          element.value = '50';
          element.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await frame.locator('body').evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        assert.equal(await frame.locator('body').evaluate(() => window.flightStudy.snapshot().altitude), .5);
        checks.push(`${viewport.width}px breakthrough altitude 슬라이더는 고도를 50%로 변경한다`);
      }
    }
    assert.ok(Math.max(...widths) - Math.min(...widths) < 1);
    assert.deepEqual(errors, []);
    checks.push(`${viewport.width}px 세 장면 슬라이더의 크기가 같고 오류·넘침이 없다`);
    await page.close();
  }

  const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });

  await page.goto(`${publicUrl}?view=liftoff`);
  let frame = await waitForView(page, 'liftoff');
  await setApproachAltitude(frame, 81);
  assert.equal(await frame.locator('#altitude').inputValue(), '81');
  assert.equal(await frame.locator('body').evaluate(() => Number(new URL(location.href).searchParams.get('altitude'))), .81);
  checks.push('LIFTOFF altitude 81%는 렌더 상태와 장면 URL에 반영된다');

  await page.locator('[data-view="infiltration"]').click();
  frame = await waitForView(page, 'infiltration');
  const initialPitch = Number(await frame.locator('#scene').getAttribute('data-pitch'));
  await setApproachAltitude(frame, 70);
  const changedPitch = Number(await frame.locator('#scene').getAttribute('data-pitch'));
  assert.ok(changedPitch < initialPitch);
  assert.equal(await frame.locator('body').evaluate(() => Number(new URL(location.href).searchParams.get('altitude'))), .7);
  checks.push('INFILTRATION altitude 70%는 시선 각도와 장면 URL을 함께 바꾼다');

  await page.locator('[data-view="liftoff"]').click();
  frame = await waitForView(page, 'liftoff');
  assert.equal(await frame.locator('#altitude').inputValue(), '81');
  await page.locator('[data-view="infiltration"]').click();
  frame = await waitForView(page, 'infiltration');
  assert.equal(await frame.locator('#altitude').inputValue(), '70');
  checks.push('장면을 왕복해도 LIFTOFF 81%와 INFILTRATION 70% 고도가 각각 유지된다');

  await page.goto(`${publicUrl}?view=breakthrough`);
  await waitForView(page, 'breakthrough');
  await page.reload();
  await waitForView(page, 'breakthrough');
  assert.equal(await page.locator('button[data-view="breakthrough"]').getAttribute('aria-selected'), 'true');
  await page.goto(`${publicUrl}?view=unknown`);
  await waitForView(page, 'liftoff');
  assert.equal(new URL(page.url()).searchParams.get('view'), 'liftoff');
  checks.push('BREAKTHROUGH 딥링크는 새로고침 후 복원되고 잘못된 view는 LIFTOFF로 교정된다');

  await page.locator('button[data-view="infiltration"]').focus();
  await page.keyboard.press('Enter');
  frame = await waitForView(page, 'infiltration');
  const keyboardAltitude = Number(await frame.locator('#altitude').inputValue());
  await frame.locator('#altitude').focus();
  await frame.locator('#altitude').press('ArrowRight');
  assert.equal(Number(await frame.locator('#altitude').inputValue()), keyboardAltitude + 1);
  checks.push('키보드 Enter로 장면을 열고 ArrowRight로 altitude를 1% 올릴 수 있다');

  await page.locator('nav').evaluate(nav => {
    nav.querySelector('[data-view="breakthrough"]').click();
    nav.querySelector('[data-view="infiltration"]').click();
    nav.querySelector('[data-view="liftoff"]').click();
  });
  await waitForView(page, 'liftoff');
  assert.equal(await page.locator('button[data-view="liftoff"]').getAttribute('aria-selected'), 'true');
  for (const view of ['breakthrough', 'infiltration', 'liftoff']) {
    await page.locator(`button[data-view="${view}"]`).click();
    frame = await waitForView(page, view);
    assert.equal(await frame.locator('body').evaluate(() => location.pathname), `/flight/${view}/`);
    assert.equal(await page.locator(`button[data-view="${view}"]`).getAttribute('aria-selected'), 'true');
    if (view === 'infiltration') assert.equal(Number(await frame.locator('#altitude').inputValue()), keyboardAltitude + 1);
  }
  assert.deepEqual(errors, []);
  checks.push('빠른 연속 전환 뒤에도 세 탭은 올바른 장면과 INFILTRATION 고도를 복원한다');
  await page.close();

  const reducedContext = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 960, height: 720 } });
  const reducedPage = await reducedContext.newPage();
  const requestedSkies = [];
  reducedPage.on('request', request => {
    const pathname = new URL(request.url()).pathname;
    if (pathname.endsWith('/sky.png') || pathname.endsWith('/sky-infiltration.png')) requestedSkies.push(pathname);
  });
  await reducedPage.goto(`${publicUrl}?view=liftoff`);
  frame = await waitForView(reducedPage, 'liftoff');
  assert.equal(await frame.locator('#scene').getAttribute('data-running'), 'false');
  await reducedPage.locator('button[data-view="infiltration"]').click();
  frame = await waitForView(reducedPage, 'infiltration');
  assert.equal(await frame.locator('#scene').getAttribute('data-running'), 'false');
  await reducedPage.locator('button[data-view="breakthrough"]').click();
  frame = await waitForView(reducedPage, 'breakthrough');
  assert.equal(await frame.locator('body').evaluate(() => window.flightStudy.snapshot().running), false);
  checks.push('움직임 줄이기 환경에서는 LIFTOFF·INFILTRATION·BREAKTHROUGH가 모두 정지한다');
  assert.deepEqual(requestedSkies, ['/flight/liftoff/sky.png', '/flight/infiltration/sky-infiltration.png']);
  checks.push('LIFTOFF와 INFILTRATION은 각 장면에 필요한 하늘 이미지만 한 장씩 요청한다');
  await reducedContext.close();

  for (const [view, assetPattern, loadingSelector] of [
    ['liftoff', '**/flight/liftoff/ground.png', '.loading'],
    ['breakthrough', '**/flight/breakthrough/assets/armor.png', '#loading'],
  ]) {
    const failureContext = await browser.newContext({ viewport: { width: 960, height: 720 } });
    const failurePage = await failureContext.newPage();
    await failurePage.route(assetPattern, route => route.abort());
    await failurePage.goto(`${publicUrl}?view=${view}`);
    await failurePage.waitForFunction(selected => document.querySelector('#preview-frame')?.contentWindow?.location.pathname.includes(`/flight/${selected}/`), view);
    const failureFrame = failurePage.frameLocator('#preview-frame');
    await failureFrame.locator('body[data-error="assets"]').waitFor();
    const errorOverlay = await failureFrame.locator(loadingSelector).evaluate(element => ({
      display: getComputedStyle(element).display,
      message: element.textContent,
      role: element.getAttribute('role'),
      live: element.getAttribute('aria-live'),
    }));
    assert.equal(errorOverlay.display, 'grid');
    assert.equal(errorOverlay.message, 'Unable to load preview. Refresh the page.');
    assert.equal(errorOverlay.role, 'status');
    assert.equal(errorOverlay.live, 'assertive');
    checks.push(`${view.toUpperCase()} 필수 자산 실패는 영어 새로고침 안내를 표시한다`);
    await failureContext.close();
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify({ passed: checks.length, checks }));
