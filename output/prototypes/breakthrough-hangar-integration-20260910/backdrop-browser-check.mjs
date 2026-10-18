import {chromium} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=new URL('./',import.meta.url),{url}=JSON.parse(await readFile(new URL('preview-state.json',root),'utf8'));
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}),page=await browser.newPage({viewport:{width:1440,height:1100}}),checks=[],errors=[],pixels=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const check=(name,result)=>{assert.ok(result,name);checks.push(name);};
const settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
const snap=()=>page.evaluate(()=>window.flightStudy.snapshot());
const slider=async(id,value)=>{await page.locator('#'+id).evaluate((el,v)=>{el.value=String(v);el.dispatchEvent(new Event('input',{bubbles:true}));},value);await settle();};
const capture=async name=>{await settle();return await page.locator('.viewer').screenshot(name?{path:new URL(name,root).pathname}:{});};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function difference(a,b){return page.evaluate(async({a,b})=>{
 const decode=async data=>{const image=await createImageBitmap(new Blob([Uint8Array.from(atob(data),c=>c.charCodeAt(0))],{type:'image/png'})),canvas=new OffscreenCanvas(image.width,image.height),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);return{data:ctx.getImageData(0,0,image.width,image.height).data,width:image.width,height:image.height};};
 const [one,two]=await Promise.all([decode(a),decode(b)]);let count=0,total=0,maximum=0;
 for(let y=30;y<one.height;y++)for(let x=0;x<one.width;x++){const i=(y*one.width+x)*4,d=Math.max(...[0,1,2].map(k=>Math.abs(one.data[i+k]-two.data[i+k])));if(d>3)count++;maximum=Math.max(maximum,d);total+=d;}
 return{count,maximum,mean:total/(one.width*(one.height-30))};
 },{a:a.toString('base64'),b:b.toString('base64')});}
try{
 await page.goto(url+'?module=E&altitude=0&progress=.72&paused=1&surroundings=0&extensions=1&backdrop=architecture&backdropBrightness=70');await page.waitForSelector('body[data-ready=true]');await settle();const initial=await snap();
 check('새 링크는70% 먼 건축 그림과 E 하부 연결을 켜고 입체 주변 건축은 끈다',initial.paintedBackdrop.visible&&initial.paintedBackdrop.strength===.7&&initial.space.extensionVisible&&!initial.space.farVisible&&!initial.space.stationVisible);
 for(const a of [0,50,100]){
  await slider('altitude',a);const before=await snap(),withPaint=await capture(`backdrop-alt-${a}.png`);await page.locator('#backdrop').selectOption('none');const without=await capture(`backdrop-black-${a}.png`),after=await snap();
  check(`고도${a}%에서 그림 토글은 화면을 바꾸고 E·시간·카메라·광원색은 유지`,hash(withPaint)!==hash(without)&&before.objectId===after.objectId&&JSON.stringify(before.motion)===JSON.stringify(after.motion)&&JSON.stringify(before.view)===JSON.stringify(after.view)&&JSON.stringify(before.colors)===JSON.stringify(after.colors));
  await page.locator('#backdrop').selectOption('architecture');await settle();
  for(const kind of ['building','extension']){const p=await page.evaluate(k=>window.flightStudy.probeDepth(k),kind);check(`고도${a}%·${kind}의 앞 빛은 보이고 뒤 광원과 잔상은 배경을 켜도 가려진다`,!p.error&&JSON.stringify(p.baseline)===JSON.stringify(p.behind)&&JSON.stringify(p.baseline)===JSON.stringify(p.behindTrail)&&p.front[1]>p.baseline[1]+20);await settle();}
 }
 await slider('altitude',0);await page.locator('#extensions').uncheck();await slider('size',0);
 await page.locator('#building').uncheck();const backgroundOnly=await capture('backdrop-only.png');await page.locator('#building').check();
 for(const progress of [0,2500,7200,9999]){await slider('progress',progress);const delta=await difference(backgroundOnly,await capture(`backdrop-approach-${progress}.png`));pixels.push({progress,...delta});check(`진행${progress/100}%의 E는 ${progress===0||progress===9999?'원경 그림에 검은 구멍 없이 사라짐':'그림 앞에서 실제 입체 픽셀 표시'}`,progress===0||progress===9999?delta.count===0:delta.count>15);}
 await slider('progress',7200);await page.locator('#building').uncheck();await slider('backdropBrightness',0);const zero=await capture();await page.locator('#backdrop').selectOption('none');check('배경 밝기0%는 기존 검은 화면과 픽셀 일치',hash(zero)===hash(await capture()));
 await page.locator('#backdrop').selectOption('architecture');await slider('backdropBrightness',70);await page.locator('#building').check();await slider('size',10);
 for(const id of ['A','B','C','D','E','F','G','H']){await page.locator(`[data-module="${id}"]`).click();await settle();const s=await snap();check(`${id} 선택에서도 같은 원경 그림과 메시를 재사용`,s.module===id&&s.paintedBackdrop.visible&&s.paintedBackdrop.textureId===initial.paintedBackdrop.textureId&&s.paintedBackdrop.meshId===initial.paintedBackdrop.meshId);}
 await page.locator('[data-module="E"]').click();await page.locator('#extensions').check();await page.locator('#play').click();await page.waitForTimeout(180);await page.locator('#play').click();await settle();const frozen=await snap(),still=await capture('backdrop-paused.png');await page.waitForTimeout(100);check('정지하면 배경·E·잔상 픽셀이 함께 유지되고 원경에 재사용 점프가 없다',hash(still)===hash(await capture())&&JSON.stringify(frozen.paintedBackdrop.frame)===JSON.stringify((await snap()).paintedBackdrop.frame));
 await slider('backdropBrightness',45);await page.reload();await page.waitForSelector('body[data-ready=true]');const restored=await snap();check('새로고침은 그림·밝기45%·입체 주변 꺼짐·하부 켜짐·정지를 복원',restored.backdrop==='architecture'&&restored.backdropBrightness===45&&!restored.surroundings&&restored.extensions&&!restored.running);
 await slider('backdropBrightness',70);await slider('progress',7200);
 for(const [width,height] of [[320,780],[390,844],[844,390],[1440,1100]]){await page.setViewportSize({width,height});await settle();const l=await page.evaluate(()=>{const a=document.querySelector('.viewer').getBoundingClientRect(),b=document.querySelector('.controls').getBoundingClientRect();return{ratio:a.width/a.height,below:b.top>=a.bottom-1,overflow:document.documentElement.scrollWidth>innerWidth};});check(`${width}px에서 그림·16:9·하단 조절·가로 넘침 없음`,Math.abs(l.ratio-16/9)<.02&&l.below&&!l.overflow&&(await snap()).paintedBackdrop.visible);await page.screenshot({path:new URL(`backdrop-viewport-${width}.png`,root).pathname,fullPage:true});}
 for(const [route,path] of [['painted-backdrop.mjs','painted-backdrop.mjs'],['assets/distant-architecture.png','../../imagegen/distant-architecture-backdrop-20260910/distant-architecture.png']]){const r=await fetch(url+route);check(`${route} HTTP200과 원본 바이트 일치`,r.status===200&&Buffer.from(await r.arrayBuffer()).equals(await readFile(new URL(path,root))));}
 check('배경 단위검사는 외부에 제공하지 않음',(await fetch(url+'painted-backdrop.test.ts')).status===404);
 check('페이지·콘솔·CSP 오류0개',errors.length===0);const final=await snap();await writeFile(new URL('backdrop-browser-check.json',root),JSON.stringify({checkedAt:new Date().toISOString(),checks,errors,pixels,metrics:{calls:final.calls,triangles:final.triangles},limitations:'One generated painted background with optional recursive scale sampling and focus adjustment. Not separate 3D wall/floor/ceiling scenery. Headless pixels do not establish device FPS or artistic acceptance.'},null,2));console.log(JSON.stringify({passed:checks.length,errors,pixels}));
}finally{await browser.close();}
