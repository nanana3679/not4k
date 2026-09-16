import { test, expect } from '@playwright/test';
import { trillAssemblySvg } from '../../assets-lab/classic/trill-quartz.mjs';

const preview = '/assets-lab/classic/trill-quartz-preview.html';

test('석영 미리보기에서1000×200 벡터 에셋7개와 묶음·상태별 조립SVG를 다운로드 가능', async ({page}) => {
  await page.goto(preview);
  await expect(page.getByRole('heading', {name:'Trill · 석영 SVG', exact:true})).toBeVisible();
  const assets = page.locator('.asset-download');
  await expect(assets).toHaveCount(3);
  const allLinks = page.locator('.asset-download,.state-download');
  const paths = await allLinks.evaluateAll(links => [...new Set(links.map(link=>(link as HTMLAnchorElement).pathname))]);
  expect(paths).toHaveLength(7);
  for (const path of paths) {
    const response = await page.request.get(path);
    expect(response.ok()).toBeTruthy();
    const source = await response.text();
    expect(source).toContain('viewBox="0 0 1000 200"');
    expect(source).toContain('data-layer="base"');
    expect(source).toContain('data-layer="reflections"');
    expect(source).not.toMatch(/<image\b|<foreignObject\b|data:image|<script\b/);
  }
  for (const link of await page.locator('.files a[download]').all()) {
    const url = await link.evaluate(element => (element as HTMLAnchorElement).href);
    const response = await page.request.get(url);
    expect(response.status()).toBe(200);
    if (url.endsWith('.zip')) {
      expect([...((await response.body()).subarray(0, 4))]).toEqual([80, 75, 3, 4]);
    } else {
      expect(await response.text()).toContain('<svg');
    }
  }
  for (const image of await page.locator('details img').all()) {
    const response = await page.request.get(await image.evaluate(element => (element as HTMLImageElement).src));
    expect(response.status()).toBe(200);
    expect([...((await response.body()).subarray(0, 8))]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  }
});

test('포인트·터미널은 상하대칭이고 터미널 색은 바디와 같으며 바디 반복 경계에는 명암 차이가 없음', async ({page}) => {
  await page.goto(preview);
  const result = await page.evaluate(async () => {
    const raster = async (name: string) => {
      const image = new Image();
      image.src = `/assets-lab/classic/sources/${name}.svg`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      return {width:canvas.width, height:canvas.height, pixels:context.getImageData(0,0,canvas.width,canvas.height).data};
    };
    const [point, body, terminal] = await Promise.all(['point-trill','body-trill','terminal-end-trill'].map(raster));
    let repeatMaxDiff = 0, materialMaxDiff = 0, minBodyAlpha = 255;
    let pointSupportMismatch = 0, terminalSupportMismatch = 0;
    let contrast = 0, contrastCount = 0;
    for (let y = 0; y < 200; y++) for (let x = 0; x < 1000; x++) {
      const i = (y*1000+x)*4;
      const mirror = ((199-y)*1000+x)*4;
      minBodyAlpha = Math.min(minBodyAlpha, body.pixels[i+3]);
      if ((point.pixels[i+3] > 0) !== (point.pixels[mirror+3] > 0)) pointSupportMismatch++;
      if ((terminal.pixels[i+3] > 0) !== (terminal.pixels[mirror+3] > 0)) terminalSupportMismatch++;
      if (terminal.pixels[i+3] === 255) for (let c = 0; c < 3; c++) {
        materialMaxDiff = Math.max(materialMaxDiff, Math.abs(terminal.pixels[i+c]-body.pixels[i+c]));
      }
      if (point.pixels[i+3] === 255) {
        contrast += (point.pixels[i]+point.pixels[i+1]+point.pixels[i+2]-body.pixels[i]-body.pixels[i+1]-body.pixels[i+2])/3;
        contrastCount++;
      }
    }
    for (let x = 0; x < 4000; x++) repeatMaxDiff = Math.max(repeatMaxDiff, Math.abs(body.pixels[x]-body.pixels[199*4000+x]));
    return {dimensions:[point,body,terminal].map(({width,height})=>({width,height})),repeatMaxDiff,materialMaxDiff,minBodyAlpha,pointSupportMismatch,terminalSupportMismatch,pointBrightnessDifference:contrast/contrastCount};
  });
  expect(result.dimensions).toEqual(Array(3).fill({width:1000,height:200}));
  expect(result.pointSupportMismatch).toBe(0);
  expect(result.terminalSupportMismatch).toBe(0);
  expect(result.minBodyAlpha).toBe(255);
  // Chromium can dither a gradient by pixel position, even with y-invariant paint.
  expect(result.repeatMaxDiff).toBeLessThanOrEqual(3);
  expect(result.materialMaxDiff).toBeLessThanOrEqual(3);
  expect(result.pointBrightnessDifference).toBeGreaterThan(45);
});

test('대기·켜짐·실패 모두 너비100·125·200과 길이0·13·83.5·167의 조립 내부에 투명한 틈이 없음', async ({page}) => {
  await page.goto(preview);
  const inputs = ['idle','on','failed'].flatMap(state => [[100,0],[100,13],[125,83.5],[200,167]].map(([width,length]) => ({state,width,length,svg:trillAssemblySvg(width,length,state)})));
  const checks = await page.evaluate(async inputs => {
    const checks = [];
    for (const {width,length,svg} of inputs) {
      const image = new Image();
      image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = Math.ceil(length+width/5);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(image,0,0);
      const pixels = ctx.getImageData(0,0,canvas.width,canvas.height).data;
      let interiorMinAlpha = 255, exteriorMaxAlpha = 0;
      for(let y=0;y<canvas.height;y++) for(let x=1;x<width-1;x++) {
        const inset = Math.abs(x+.5-width/2)/5;
        const bottom = length+width/5-inset;
        const alpha = pixels[(y*width+x)*4+3];
        if(y+.5 > inset+2 && y+.5 < bottom-2) interiorMinAlpha = Math.min(interiorMinAlpha,alpha);
        if(y+.5 < inset-2 || y+.5 > bottom+2) exteriorMaxAlpha = Math.max(exteriorMaxAlpha,alpha);
      }
      checks.push({width,length,interiorMinAlpha,exteriorMaxAlpha});
    }
    return checks;
  }, inputs);
  for(const check of checks) {
    expect(check.interiorMinAlpha, JSON.stringify(check)).toBe(255);
    expect(check.exteriorMaxAlpha, JSON.stringify(check)).toBe(0);
  }
});

test('켜짐 중앙부는 대기보다 밝고 실패는 어두우며 세 상태 모두 터미널 재질·빛과 반복 단면이 일치', async ({page}) => {
  await page.goto(preview);
  const result = await page.evaluate(async () => {
    const read = async (name: string) => {
      const image = new Image(); image.src=`/assets-lab/classic/sources/${name}.svg`; await image.decode();
      const canvas=document.createElement('canvas'); canvas.width=1000; canvas.height=200;
      const ctx=canvas.getContext('2d',{willReadFrequently:true})!;ctx.drawImage(image,0,0,1000,200);
      return ctx.getImageData(0,0,1000,200).data;
    };
    const states=[];
    for(const suffix of ['', '-on', '-failed']) {
      const [body,terminal]=await Promise.all([read(`body-trill${suffix}`),read(`terminal-end-trill${suffix}`)]);
      let materialDiff=0,repeatDiff=0,center=0,average=0,alphaMin=255,maskMismatch=0;
      for(let y=0;y<200;y++)for(let x=0;x<1000;x++) {
        const i=(y*1000+x)*4;
        const inset=Math.abs(x+.5-500)/5;
        // Clipping a near-white translucent light can round an antialiased
        // edge's alpha to255; compare material beyond the geometric edge.
        const insideMaterial=y+.5>inset+2&&y+.5<200-inset-2;
        alphaMin=Math.min(alphaMin,body[i+3]);
        if((terminal[i+3]>0)!==(terminal[((199-y)*1000+x)*4+3]>0))maskMismatch++;
        for(let c=0;c<3;c++) {
          if(insideMaterial)materialDiff=Math.max(materialDiff,Math.abs(body[i+c]-terminal[i+c]));
          if(y===0)repeatDiff=Math.max(repeatDiff,Math.abs(body[i+c]-body[(199*1000+x)*4+c]));
          average+=body[i+c]/3;
          if(x>=420&&x<580)center+=body[i+c]/3;
        }
      }
      states.push({suffix,materialDiff,repeatDiff,alphaMin,maskMismatch,average:average/200000,center:center/32000});
    }
    return states;
  });
  for(const state of result){
    expect(state.materialDiff).toBeLessThanOrEqual(3);
    expect(state.repeatDiff).toBeLessThanOrEqual(3);
    expect(state.alphaMin).toBe(255);
    expect(state.maskMismatch).toBe(0);
  }
  expect(result[1].center).toBeGreaterThan(result[0].center+55);
  expect(result[1].average).toBeGreaterThan(result[0].average+15);
  expect(result[2].average).toBeLessThan(result[0].average-60);
  expect(result[2].center).toBeLessThan(110);
});

test('상태 선택은 바디·터미널·짧은 조립·다운로드를 함께 바꾸며 포인트와 치수는 유지', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto(preview);
  await expect(page.getByRole('button',{name:'켜짐',exact:true})).toHaveAttribute('aria-pressed','true');
  const assembly=page.locator('#adjustable-assembly');
  for(const [state,label,suffix] of [['failed','실패','-failed'],['idle','대기',''],['on','켜짐','-on']]) {
    await page.getByRole('button',{name:label,exact:true}).click();
    await expect(assembly).toHaveAttribute('data-state',state);
    await expect(assembly.locator('.terminal')).toHaveAttribute('src',`./sources/terminal-end-trill${suffix}.svg`);
    expect(await assembly.locator('.body').evaluate(node=>getComputedStyle(node).backgroundImage)).toContain(`body-trill${suffix}.svg`);
    await expect(page.locator('#body-part a')).toHaveAttribute('href',`./sources/body-trill${suffix}.svg`);
    await expect(page.locator('#assembly-download')).toHaveAttribute('href',`./downloads/assembled-${state}.svg`);
    await expect(assembly.locator('.point')).toHaveAttribute('src','./sources/point-trill.svg');
    for(const part of ['.body','.terminal','.point']) expect((await assembly.locator(part).boundingBox())?.width).toBe(200);
    for(const item of await page.locator('.sizes .quartz-assembly').all()) await expect(item).toHaveAttribute('data-state',state);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('390px 화면에서 너비·길이 슬라이더를 움직여도 세 파츠의 폭과 캡 비율이 같고 가로 넘침이 없음', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto(preview);
  const width = page.locator('#note-width');
  const length = page.locator('#body-length');
  await width.focus();
  await width.press('Home');
  await expect(page.locator('#width-value')).toHaveText('60px');
  await width.press('End');
  await expect(page.locator('#width-value')).toHaveText('260px');
  await length.focus();
  await length.press('Home');
  await expect(page.locator('#length-value')).toHaveText('0px');
  const assembly = page.locator('#adjustable-assembly');
  expect((await assembly.boundingBox())?.height).toBe(52);
  expect((await assembly.locator('.body').boundingBox())?.height).toBe(0);
  await length.press('End');
  await expect(page.locator('#length-value')).toHaveText('320px');
  for (const name of ['.body','.point','.terminal']) expect((await assembly.locator(name).boundingBox())?.width).toBe(260);
  expect((await assembly.locator('.point').boundingBox())?.height).toBe(52);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  for (const image of await page.locator('.sizes .quartz-assembly img').all()) {
    const bounds = await image.boundingBox();
    expect(bounds?.width).toBe(100);
    expect(bounds?.height).toBe(20);
  }
});
