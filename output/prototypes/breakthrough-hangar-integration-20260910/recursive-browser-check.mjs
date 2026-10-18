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
const base='?module=E&altitude=0&progress=.72&paused=1&surroundings=0&extensions=0&building=0&size=0&backdrop=architecture';
async function visit(params=''){const q=new URLSearchParams(base.slice(1));for(const [k,v] of new URLSearchParams(params))q.set(k,v);await page.goto(url+'?'+q);await page.waitForSelector('body[data-ready=true]');await settle();}
try{
 await visit();const initial=await snap(),first=await capture('recursive-only-start.png');
 check('새 배경 기본값은 밝기50%·재귀 확대·확대 속도100%·위상0',initial.backdropBrightness===50&&initial.backdropMotion==='recursive'&&initial.backdropRate===100&&initial.paintedBackdrop.phase===0);
 await slider('backdropBrightness',70);const brighter=await capture('recursive-only-brighter.png');const brightness=await difference(first,brighter);check('같은 재귀 구도에서50%와70%의 실제 배경 밝기가 다름',brightness.mean>1);await slider('backdropBrightness',50);
 await page.locator('#play').click();await page.waitForTimeout(1000);await page.locator('#play').click();await settle();const moved=await snap(),moving=await capture('recursive-only-moved.png');
 check('재생하면 위상과 배경 픽셀이 전진하고 그림·메시 개수는 증가하지 않음',moved.backdropPhase>0&&hash(first)!==hash(moving)&&moved.paintedBackdrop.textureId===initial.paintedBackdrop.textureId&&moved.paintedBackdrop.meshId===initial.paintedBackdrop.meshId&&moved.calls===initial.calls&&moved.geometries===initial.geometries);
 check('배경100% 위상은 실제 전진량22400당 한 번 회전',(Math.abs(moved.backdropPhase-(moved.motion.travel-initial.motion.travel)/22400)<1e-6));
 await page.waitForTimeout(150);check('일시정지는 재귀 위상과 전체 배경 픽셀을 정확히 유지',hash(moving)===hash(await capture())&&(await snap()).backdropPhase===moved.backdropPhase);
 await page.reload();await page.waitForSelector('body[data-ready=true]');await settle();check('정지 후 새로고침하면 재귀 위치와 화면이 복원',Math.abs((await snap()).backdropPhase-moved.backdropPhase)<1e-12&&hash(moving)===hash(await capture()));
 await slider('backdropRate',0);await page.locator('#play').click();const rateZero=await snap();await page.waitForTimeout(150);check('확대 속도0%는 비행 중에도 배경 확대만 정지',(await snap()).backdropPhase===rateZero.backdropPhase&&(await snap()).motion.travel>rateZero.motion.travel);await page.locator('#play').click();
 await slider('backdropRate',100);await slider('speed',0);await page.locator('#play').click();const speedZero=await snap();await page.waitForTimeout(150);check('비행 속도0%에서는 재귀 배경도 전진하지 않음',(await snap()).backdropPhase===speedZero.backdropPhase);await page.locator('#play').click();
 await slider('speed',1000);await page.locator('#backdropMotion').selectOption('static');const staticFrame=await capture('recursive-static-comparison.png');await page.locator('#play').click();const fixed=await snap();await page.waitForTimeout(150);check('고정 그림 비교에서는 비행 시간이 흘러도 배경 위상은 유지',(await snap()).backdropPhase===fixed.backdropPhase);await page.locator('#play').click();check('고정 그림은 실제 픽셀도 움직이지 않음',hash(staticFrame)===hash(await capture()));
 for(const phase of [.25,.5,.75]){await visit('&backdropPhase='+phase);check(`재귀 위상${phase}에서 배경이 다른 확대 구도로 표시`,hash(first)!==hash(await capture('recursive-quarter-'+phase+'.png')));}
 await visit('&backdropPhase=.999999');const last=await capture('recursive-wrap-before.png');await visit('&backdropPhase=0');const beginning=await capture('recursive-wrap-after.png'),seam=await difference(last,beginning);pixels.push({kind:'cycle',...seam});check('재귀 한 주기 경계99.9999%→0%에서 화면 점프가 없음',seam.mean<.05&&seam.maximum<=3);
 await visit('&backdropPhase=1');check('정확히 한 주기 뒤는 최초 프레임과 픽셀 일치',hash(beginning)===hash(await capture()));
 await visit('&backdropPhase=.9998&backdropRate=300');await page.locator('#play').click();await page.waitForTimeout(150);await page.locator('#play').click();await settle();check('실제 재생으로 주기를 넘겨도 위상0~1과 같은 배경 객체를 유지',(await snap()).backdropPhase<.1);
 for(const a of [0,50,100]){await visit('&backdropPhase=.35&altitude='+a/100+'&progress=0&building=0');const blank=await capture();await page.locator('#building').check();const gap=await difference(blank,await capture());pixels.push({kind:'fog',altitude:a,...gap});check(`고도${a}%에서 원거리 건물은 움직이는 재귀 배경에 검은 구멍을 만들지 않음`,gap.count===0);}
 await visit('&extensions=1&building=1&size=.25');await page.locator('#play').click();await page.waitForTimeout(300);await page.locator('#play').click();await settle();const combined=await snap(),withTrail=await capture('recursive-combined.png');await page.waitForTimeout(100);check('E·하부 연결·광원·잔상이 있는 실제 장면도 재귀 배경과 함께 정지',combined.trailCount>0&&hash(withTrail)===hash(await capture()));
 for(const [width,height] of [[390,844],[844,390]]){await page.setViewportSize({width,height});await settle();check(`${width}px에서 배경 확대 조절이 가로 넘침 없이 보임`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.querySelector('#backdropMotion').getBoundingClientRect().height>=44));await page.screenshot({path:new URL('recursive-viewport-'+width+'.png',root).pathname,fullPage:true});}
 check('페이지·콘솔·CSP 오류0개',errors.length===0);await writeFile(new URL('recursive-browser-check.json',root),JSON.stringify({checkedAt:new Date().toISOString(),checks,errors,pixels,limitations:'Same painted image is recursively sampled, not procedural 3D architecture. Two texture samples join adjacent scales plus a center sample; one background draw, no per-layer objects. Artistic review and target-device FPS remain user/device checks.'},null,2));console.log(JSON.stringify({passed:checks.length,errors,pixels}));
}finally{await browser.close();}
