import {chromium} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=new URL('./',import.meta.url),{url}=JSON.parse(await readFile(new URL('preview-state.json',root),'utf8'));
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}),page=await browser.newPage({viewport:{width:1440,height:1100}}),checks=[],errors=[],probes=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const check=(name,v)=>{assert.ok(v,name);checks.push(name);};
const settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
const snap=()=>page.evaluate(()=>window.flightStudy.snapshot());
const slider=async(id,value)=>{await page.locator('#'+id).evaluate((el,v)=>{el.value=String(v);el.dispatchEvent(new Event('input',{bubbles:true}));},value);await settle();};
const capture=async name=>{await settle();const bytes=await page.locator('.viewer').screenshot({path:new URL(name,root).pathname});return createHash('sha256').update(bytes).digest('hex');};
try{
 await page.goto(url+'?module=E&altitude=0&progress=.72&paused=1&surroundings=1&extensions=1');await page.waitForSelector('body[data-ready=true]');await settle();const baseline=await snap();
 check('E 공간 비교 링크는 원경·뒤 골조·하부 연결을 켜고 이전 고도0·중거리160을 유지',baseline.space.farVisible&&baseline.space.stationVisible&&baseline.space.extensionVisible&&baseline.altitude===0&&Math.abs(baseline.pose.center[2]-160)<1e-6);
 for(const a of [0,50,100]){
  await slider('altitude',a);const before=await snap(),hashes=[];
  for(const [surroundings,extensions] of [[true,true],[true,false],[false,true],[false,false]]){
   await page.locator('#surroundings').setChecked(surroundings);await page.locator('#extensions').setChecked(extensions);await settle();const s=await snap();
   hashes.push(await capture(`space-alt-${a}-${+surroundings}-${+extensions}.png`));
   check(`고도${a}%·주변${+surroundings}·하부${+extensions}에서 각 층만 바뀌고 E·광원·시간·카메라 유지`,s.space.farVisible===surroundings&&s.space.stationVisible===surroundings&&s.space.extensionVisible===extensions&&s.objectId===baseline.objectId&&JSON.stringify(s.geometryIds)===JSON.stringify(baseline.geometryIds)&&JSON.stringify(s.motion)===JSON.stringify(before.motion)&&JSON.stringify(s.colors)===JSON.stringify(before.colors)&&JSON.stringify(s.view)===JSON.stringify(before.view));
  }
  check(`고도${a}%에서 기존·배경만·연결만·전체의 실제 화면이 모두 다름`,new Set(hashes).size===4);
  await page.locator('#surroundings').check();await page.locator('#extensions').check();await settle();
  for(const kind of ['extension','station']){const probe=await page.evaluate(k=>window.flightStudy.probeDepth(k),kind);probes.push({altitude:a,kind,...probe});check(`고도${a}%의 ${kind} 뒤 광원·잔상은 가리고 앞은 표시`,!probe.error&&JSON.stringify(probe.baseline)===JSON.stringify(probe.behind)&&JSON.stringify(probe.baseline)===JSON.stringify(probe.behindTrail)&&probe.front[1]>probe.baseline[1]+20&&probe.frontTrail[1]>probe.baseline[1]+20);await settle();}
 }
 await page.locator('[data-module="A"]').click();await settle();const a=await snap();check('A 선택은 E 공간을 숨기고 원래8종 비교를 유지',a.module==='A'&&!a.space.farVisible&&!a.space.stationVisible&&!a.space.extensionVisible&&await page.locator('#surroundings').isDisabled()&&await page.locator('#extensions').isDisabled());
 await page.locator('[data-module="E"]').click();await settle();const e=await snap();check('E로 돌아오면 선택한 공간과 기존 객체를 재사용',e.space.farVisible&&e.space.extensionVisible&&e.space.groupId===baseline.space.groupId&&e.objectId===baseline.objectId);
 await page.locator('#building').uncheck();await settle();check('건물을 숨기면 하부 연결도 숨기고 주변 공간은 남음',!(await snap()).space.extensionVisible&&(await snap()).space.farVisible);await page.locator('#building').check();
 await slider('altitude',0);await slider('progress',7780);await capture('space-near-low.png');await slider('altitude',100);await capture('space-near-high.png');
 await page.locator('#extensions').uncheck();await page.reload();await page.waitForSelector('body[data-ready=true]');const restored=await snap();check('새로고침 후 E·고도100%·주변 켜짐·연결 꺼짐·정지 복원',restored.module==='E'&&restored.altitude===1&&restored.surroundings&&!restored.extensions&&!restored.running);
 await page.locator('#extensions').check();await slider('altitude',0);await slider('progress',7200);await page.locator('#play').click();await page.waitForTimeout(120);const start=await snap();await page.waitForTimeout(150);const moving=await snap();check('배경은 E와 같은 전진량으로 움직이며 위상이 독립적으로 이어짐',moving.motion.travel>start.motion.travel&&Math.abs(moving.space.farSample[2]-start.space.farSample[2]-(moving.motion.travel-start.motion.travel)*.956)<.001);
 await page.locator('#play').click();await settle();const frozen=await snap(),frozenHash=await capture('space-paused.png');await page.waitForTimeout(120);check('일시정지는 먼 배경·붙인 골조·잔상과 실제 픽셀을 함께 멈춤',JSON.stringify((await snap()).space.farSample)===JSON.stringify(frozen.space.farSample)&&frozenHash===await capture('space-paused-later.png'));
 await slider('size',0);await page.locator('#surroundings').uncheck();await slider('buildingSize',180);await slider('progress',9999);const end=await capture('space-wrap-end.png');await slider('progress',0);check('180% 하부 연결도 재사용 끝→시작에서 순간 출현 픽셀이 없음',end===await capture('space-wrap-start.png'));
 await slider('buildingSize',100);await slider('size',10);await slider('progress',7200);await page.locator('#surroundings').check();
 for(const [width,height] of [[320,780],[390,844],[844,390],[1440,1100]]){await page.setViewportSize({width,height});await settle();const l=await page.evaluate(()=>{const a=document.querySelector('.viewer').getBoundingClientRect(),b=document.querySelector('.controls').getBoundingClientRect();return{ratio:a.width/a.height,below:b.top>=a.bottom-1,overflow:document.documentElement.scrollWidth>innerWidth};});check(`${width}px에서 공간 비교16:9·하단 조절·가로 넘침 없음`,Math.abs(l.ratio-16/9)<.02&&l.below&&!l.overflow);await page.screenshot({path:new URL(`space-viewport-${width}.png`,root).pathname,fullPage:true});}
 const response=await fetch(url+'surroundings.mjs');check('공간 실행 파일HTTP200과 소스 바이트 일치',response.status===200&&Buffer.from(await response.arrayBuffer()).equals(await readFile(new URL('surroundings.mjs',root))));check('공간 단위 테스트 파일은비공개404',(await fetch(url+'surroundings.test.ts')).status===404);
 check('페이지·콘솔·CSP 오류0개',errors.length===0);const final=await snap();await writeFile(new URL('space-browser-check.json',root),JSON.stringify({checkedAt:new Date().toISOString(),checks,errors,probes,metrics:{calls:final.calls,triangles:final.triangles,instances:final.space.instanceCount},limitations:'E-only spatial study. Far silhouettes use two instance draws; detailed attached geometry is not broadly optimized. Software WebGL pixels do not certify hardware FPS or artistic approval.'},null,2));console.log(JSON.stringify({passed:checks.length,errors,metrics:{calls:final.calls,triangles:final.triangles}}));
}finally{await browser.close();}
