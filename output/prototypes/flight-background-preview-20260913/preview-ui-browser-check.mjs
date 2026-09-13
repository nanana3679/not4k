import { strict as assert } from 'node:assert';
import { chromium } from '@playwright/test';

const publicUrl = process.env.PREVIEW_URL;
if (!publicUrl) throw new Error('PREVIEW_URL 환경 변수에 실행 중인 미리보기 URL을 지정하세요.');

const views = [
  ['liftoff', ['altitude']],
  ['infiltration', ['altitude']],
  ['breakthrough', ['altitude']],
];

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
        assert.ok(bounds && bounds.height >= 44 && bounds.width >= viewport.width - 40);
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
} finally {
  await browser.close();
}

console.log(JSON.stringify({ passed: checks.length, checks }));
