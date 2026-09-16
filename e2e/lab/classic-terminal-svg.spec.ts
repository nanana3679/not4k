import { test, expect } from '@playwright/test';

test('터미널 페이지에서1000×200 싱글·더블 시작/끝SVG4개를 다운로드 가능', async ({ page }) => {
  await page.goto('/assets-lab/classic/terminal-preview.html');
  await expect(page.getByRole('heading', {name:'Classic 터미널', exact:true})).toBeVisible();
  const downloads = page.locator('a[download]');
  await expect(downloads).toHaveCount(4);
  for (const link of await downloads.all()) {
    const response = await page.request.get((await link.getAttribute('href'))!);
    expect(response.status()).toBe(200);
    const svg = await response.text();
    expect(svg).toContain('viewBox="0 0 1000 200"');
    expect(svg).not.toMatch(/<image\b|data:image|<foreignObject/);
  }
  await expect(page.locator('[data-zero-length] img')).toHaveCount(2);
});

test('7개 점등 상태에서 바디와 접합하고 끝은 시작의 상하반전이며 더블 양 끝 띠는 연속', async ({ page }) => {
  await page.goto('/assets-lab/classic/terminal-preview.html');
  const checks = await page.evaluate(async () => {
    const raster = async (name: string) => {
      const image = new Image();
      image.src = `/lab/note-assets/classic/${name}.svg`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(image, 0, 0);
      return {width: canvas.width, height: canvas.height, pixels:ctx.getImageData(0,0,canvas.width,canvas.height).data};
    };
    const checks = [];
    for (const flavor of ['single','double']) {
      for (const state of ['on','idle','failed', ...(flavor === 'double' ? ['partial-off'] : [])]) {
        const suffix = state === 'on' ? '' : `-${state}`;
        const [body, start, end] = await Promise.all([
          raster(`body-${flavor}-${state === 'failed' ? 'off' : state}`),
          raster(`terminal-start-${flavor}${suffix}`),
          raster(`terminal-end-${flavor}${suffix}`),
        ]);
        let startEdgeDiff = 0, endEdgeDiff = 0, flipMaxDiff = 0, flipTotalDiff = 0, railMaxDiff = 0;
        for (let x=0;x<1000;x++) for (let channel=0;channel<4;channel++) {
          const i=x*4+channel;
          startEdgeDiff=Math.max(startEdgeDiff, Math.abs(start.pixels[i]-body.pixels[i]));
          endEdgeDiff=Math.max(endEdgeDiff, Math.abs(end.pixels[199*4000+i]-body.pixels[i]));
        }
        for (let y=0;y<200;y++) for (let x=0;x<4000;x++) {
          const diff=Math.abs(start.pixels[y*4000+x]-end.pixels[(199-y)*4000+x]);
          flipMaxDiff=Math.max(flipMaxDiff,diff); flipTotalDiff+=diff;
        }
        // The outer gray and colored rails must remain continuous through the
        // whole cap, down to its thin closing line at y=194.
        for (let y=0;y<194;y++) for (let x=0;x<34;x++) for (const railX of [x, 999-x]) {
          for (let channel=0;channel<4;channel++) {
            const source=body.pixels[railX*4+channel];
            railMaxDiff=Math.max(railMaxDiff,
              Math.abs(start.pixels[(y*1000+railX)*4+channel]-source),
              Math.abs(end.pixels[((199-y)*1000+railX)*4+channel]-source));
          }
        }
        const lightY = 70;
        const core = [...start.pixels.slice((lightY*1000+500)*4,(lightY*1000+500)*4+3)];
        const closure = [...start.pixels.slice((199*1000+500)*4,(199*1000+500)*4+3)];
        checks.push({flavor,state,width:start.width,height:start.height,startEdgeDiff,endEdgeDiff,railMaxDiff,flipMaxDiff,flipMeanDiff:flipTotalDiff/800000,core,closure});
      }
    }
    return checks;
  });
  for (const check of checks) {
    expect(check.width).toBe(1000);
    expect(check.height).toBe(200);
    // The approved single uses separately drawn reflected edges at the join.
    // Its 6–8/255 antialias differences are verified against the approved SVG below.
    expect(check.startEdgeDiff, `${check.flavor} ${check.state} 시작 접합`).toBeLessThanOrEqual(check.flavor === 'single' ? 8 : 0);
    // Chromium dithers gradients by pixel position: the unchanged body's top/bottom
    // rows also differ by up to 3/255. A mirrored SVG uses a different dither phase.
    expect(check.endEdgeDiff, `${check.flavor} ${check.state} 끝 접합`).toBeLessThanOrEqual(check.flavor === 'single' ? 8 : 3);
    if(check.flavor === 'double') expect(check.railMaxDiff, `${check.state} 더블 양 끝 띠 연속`).toBeLessThanOrEqual(3);
    // Chromium dithers mirrored gradients and antialiased outlines differently.
    // Both terminals now share the approved dense reflected edges. Their
    // source start AND mirrored end renders are compared exactly below.
    // Geometry is also an exact whole-SVG reflection in terminals.test.ts.
    expect(check.flipMaxDiff, `${check.flavor} ${check.state} 반전 최대 차이`).toBeLessThanOrEqual(10);
    expect(check.flipMeanDiff, `${check.flavor} ${check.state} 반전 평균 차이`).toBeLessThan(1);
    if (check.state === 'on') {
      expect(Math.min(...check.core)).toBeGreaterThan(245);
      expect(check.closure).not.toEqual(check.core);
    }
  }
});

test('싱글 바디·양 끝 터미널의 켜짐 상태는 Penpot 확정 SVG와 모든 픽셀이 같고 PNG 접합에는 투명 여백이 없음', async ({page}) => {
  await page.goto('/assets-lab/classic/terminal-preview.html');
  const checks=await page.evaluate(async()=>{
    const raster=async(src:string)=>{const im=new Image();im.src=src;await im.decode();const c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;const ctx=c.getContext('2d')!;ctx.drawImage(im,0,0);return {width:c.width,height:c.height,pixels:ctx.getImageData(0,0,c.width,c.height).data};};
    const references=[];
    for(const [approved,current] of [['body-single','body-single-on'],['terminal-start-single','terminal-start-single'],['terminal-end-single','terminal-end-single']]){
      const [a,b]=await Promise.all([raster(`/assets-lab/classic/revisions/penpot-approved/${approved}.svg`),raster(`/lab/note-assets/classic/${current}.svg`)]);
      let maxDiff=0;for(let i=0;i<a.pixels.length;i++)maxDiff=Math.max(maxDiff,Math.abs(a.pixels[i]-b.pixels[i]));
      references.push({current,width:b.width,height:b.height,maxDiff});
    }
    const pngs=[];
    for(const name of ['body-single','body-single-held','body-single-failed','terminal-single','terminal-single-idle','terminal-single-failed']){
      const im=await raster(`/skins/classic/${name}.png`);let minAlpha=255;
      for(let i=3;i<im.pixels.length;i+=4)minAlpha=Math.min(minAlpha,im.pixels[i]);
      pngs.push({name,width:im.width,height:im.height,minAlpha});
    }
    return {references,pngs};
  });
  for(const ref of checks.references)expect(ref).toMatchObject({width:1000,height:200,maxDiff:0});
  for(const png of checks.pngs)expect(png,png.name).toMatchObject({width:200,height:40,minAlpha:255});
  await expect(page.locator('.selected img')).toHaveCount(4);
});

test('더블 시작은 독립 수정 SVG와 같고 끝은 전체 반전이며4개 상태 모두200×40 PNG로 빈 픽셀 없이 연결', async ({page}, testInfo) => {
  await page.goto('/assets-lab/classic/terminal-preview.html');
  const checks = await page.evaluate(async () => {
    const raster = async (src: string) => {
      const image = new Image(); image.src = src; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0);
      return {width:canvas.width,height:canvas.height,pixels:ctx.getImageData(0,0,canvas.width,canvas.height).data};
    };
    const source = await (await fetch('/assets-lab/classic/sources/terminal-start-double.svg')).text();
    const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
    const root = doc.documentElement;
    const mirror = doc.createElementNS('http://www.w3.org/2000/svg','g');
    mirror.setAttribute('transform','translate(0 200) scale(1 -1)');
    for (const node of [...root.children]) if (node.localName === 'g') mirror.append(node);
    root.append(mirror);
    const flipped = new XMLSerializer().serializeToString(root);
    const references = [];
    for (const [direction, svg] of [['start',source],['end',flipped]]) {
      const [expected, actual] = await Promise.all([
        raster('data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg)),
        raster(`/lab/note-assets/classic/terminal-${direction}-double.svg`),
      ]);
      let maxDiff=0; for(let i=0;i<actual.pixels.length;i++) maxDiff=Math.max(maxDiff,Math.abs(actual.pixels[i]-expected.pixels[i]));
      references.push({direction,maxDiff});
    }
    const states = [];
    for (const [terminal,body] of [['terminal-double','body-double-held'],['terminal-double-idle','body-double'],['terminal-double-partial-failed-left','body-double-partial-held-left'],['terminal-double-failed','body-double-failed']]) {
      const [cap,tile] = await Promise.all([terminal,body].map(name=>raster(`/skins/classic/${name}.png`)));
      let minAlpha=255,joinMaxDiff=0;
      for(let i=3;i<cap.pixels.length;i+=4) minAlpha=Math.min(minAlpha,cap.pixels[i]);
      for(let i=0;i<cap.width*4;i++) joinMaxDiff=Math.max(joinMaxDiff,Math.abs(cap.pixels[39*cap.width*4+i]-tile.pixels[i]));
      const color = (x:number,y:number) => [...cap.pixels.slice((y*200+x)*4,(y*200+x)*4+3)];
      states.push({terminal,width:cap.width,height:cap.height,minAlpha,joinMaxDiff,white:color(100,28),yellow:color(91,28)});
    }
    return {references,states};
  });
  for(const reference of checks.references) expect(reference.maxDiff,reference.direction).toBe(0);
  for(const state of checks.states) {
    expect(state,state.terminal).toMatchObject({width:200,height:40,minAlpha:255});
    expect(state.joinMaxDiff,state.terminal).toBeLessThanOrEqual(3);
  }
  const [on,idle,partial,failed] = checks.states;
  expect(Math.min(...on.white)).toBeGreaterThan(245);
  expect(Math.min(...partial.white)).toBeGreaterThan(245);
  expect(Math.max(...idle.white)).toBeLessThan(80);
  for(const state of [on,idle]) expect(state.yellow[0]-state.yellow[2],state.terminal).toBeGreaterThan(80);
  expect(Math.max(...failed.white)-Math.min(...failed.white)).toBeLessThanOrEqual(1);
  await page.locator('[data-assembly-preview]').screenshot({path:testInfo.outputPath('double-terminal-assembly.png')});
});

test('390px 화면에서 SVG 조립과 다운로드가 넘치지 않고 실제 크기 터미널은100×20', async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('/assets-lab/classic/terminal-preview.html');
  await page.locator('.actual img').first().evaluate((image: HTMLImageElement) => image.decode());
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const terminal=await page.locator('.actual img').first().boundingBox();
  expect(terminal?.width).toBe(100);
  expect(terminal?.height).toBe(20);
});
