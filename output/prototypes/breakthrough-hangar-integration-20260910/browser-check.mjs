import {chromium} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {progressForDepth} from './integration.mjs';
const NEAR=progressForDepth(44),NEAR_SLIDER=NEAR*10000;
const root=new URL('./',import.meta.url),{url}=JSON.parse(await readFile(new URL('preview-state.json',root),'utf8'));
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}),page=await browser.newPage({viewport:{width:1440,height:1100}}),checks=[],errors=[],probes=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const check=(name,value)=>{assert.ok(value,name);checks.push(name);};
const settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
const snap=()=>page.evaluate(()=>window.flightStudy.snapshot());
const slider=async(id,value)=>{await page.locator('#'+id).evaluate((el,v)=>{el.value=String(v);el.dispatchEvent(new Event('input',{bubbles:true}));},value);await settle();};
const capture=async name=>{await settle();const bytes=await page.locator('.viewer').screenshot({path:new URL(name,root).pathname});return createHash('sha256').update(bytes).digest('hex');};
try{
 await page.goto(url+`?paused=1&progress=${NEAR}&altitude=0`);await page.waitForSelector('body[data-ready=true]');await settle();
 const baseline=await snap(),ids=baseline.geometryIds,object=baseline.objectId,textureIds=baseline.textures;
 check('초기 직선·크기10%·속도1000%·120ms 잔상·336개 광원·표면5장',baseline.variant==='lines'&&baseline.size===.25&&baseline.speed===1000&&baseline.trail===.12&&baseline.lightIds.length===336&&textureIds.length===5);
 check('광원·발광·잔상 모두 건물 깊이를 검사하고 깊이를 쓰지 않음',baseline.depthTest);
 const hashes={};
 for(const mode of ['1','0']){
  await page.locator('#clearance').selectOption(mode);await settle();
  for(const a of [0,50,100]){
   await slider('altitude',a);await slider('progress',NEAR_SLIDER);const s=await snap();hashes[`${mode}-${a}`]=await capture(`mode-${mode}-alt-${a}.png`);
   check(`시점${mode}·고도${a}%에서 같은 E 입체·UV·5장 그림·수평 시선 유지`,s.objectId===object&&JSON.stringify(s.geometryIds)===JSON.stringify(ids)&&JSON.stringify(s.textures)===JSON.stringify(textureIds)&&JSON.stringify(s.cameraQuaternion)==='[0,0,0,1]');
   const probe=await page.evaluate(()=>window.flightStudy.probeDepth());probes.push({mode,altitude:a,...probe});
   check(`시점${mode}·고도${a}% 실제 E 뒤의 광원과 잔상 픽셀은 건물색 그대로`,!probe.error&&JSON.stringify(probe.baseline)===JSON.stringify(probe.behind)&&JSON.stringify(probe.baseline)===JSON.stringify(probe.behindTrail));
   check(`시점${mode}·고도${a}% 실제 E 앞의 광원과 잔상 픽셀은 밝아짐`,probe.front[1]>probe.baseline[1]+20&&probe.frontTrail[1]>probe.baseline[1]+20);
  }
  check(`시점${mode}에서 고도0·50·100% 실제 화면이 모두 다름`,new Set([hashes[`${mode}-0`],hashes[`${mode}-50`],hashes[`${mode}-100`]]).size===3);
 }
 await page.locator('#clearance').selectOption('1');await slider('altitude',0);const withBuilding=await capture('with-building.png'),beforeToggle=await snap();
 await page.locator('#building').uncheck();const withoutBuilding=await capture('without-building.png'),off=await snap();
 check('건물 끄기는 실제 화면을 바꾸고 광원 좌표·색상·시간을 유지',withBuilding!==withoutBuilding&&JSON.stringify(off.colors)===JSON.stringify(beforeToggle.colors)&&off.motion.travel===beforeToggle.motion.travel);await page.locator('#building').check();
 for(const variant of ['lines','triangles','mixed']){await page.locator('#variant').selectOption(variant);await settle();const s=await snap();check(`${variant} 선택 시 기존 광원 ID336개와 E 입체 유지`,s.variant===variant&&s.objectId===object&&JSON.stringify(s.lightIds)===JSON.stringify(baseline.lightIds)&&s.faceCount>0);await capture(`variant-${variant}.png`);}
 await page.locator('details summary').click();await page.locator('#variant').selectOption('triangles');await slider('outline',100);await capture('all-outlines.png');check('윤곽선100%에서 본체 렌더 정점 존재',(await snap()).vertices.core>0);
 await slider('size',0);const zero=await snap();check('크기0%에서 광원·잔상0개이며 E는 표시',zero.faceCount===0&&zero.trailCount===0&&zero.vertices.core===0&&zero.building);await capture('zero-lights.png');
 await slider('size',10);await slider('outline',25);await page.locator('#variant').selectOption('lines');
 await slider('buildingSize',180);for(const progress of [5000,NEAR_SLIDER,8000,8500,9999]){await slider('progress',progress);const s=await snap();check(`건물180%·진행${progress/100}%에서 배율 유지·동일 입체`,s.pose.scale===1.8&&s.objectId===object&&JSON.stringify(s.geometryIds)===JSON.stringify(ids));}
 await slider('progress',NEAR_SLIDER);await slider('buildingSize',100);await page.locator('#art').uncheck();const plain=await capture('plain.png');await page.locator('#art').check();check('표면 그림 토글은 같은 E의 실제 픽셀만 변경',plain!==await capture('painted.png')&&(await snap()).objectId===object);
 await page.locator('#guides').check();const guide=await capture('guides.png');await page.locator('#guides').uncheck();check('절단면 가이드 토글 화면 변화',guide!==await capture('no-guides.png'));
 await page.locator('#lanes').check();const lane=await capture('lanes.png');await page.locator('#lanes').uncheck();check('중앙 4레인 참고선 토글 화면 변화',lane!==await capture('no-lanes.png'));
 await slider('altitude',74);await slider('secondary',37);await slider('progress',NEAR_SLIDER);await page.reload();await page.waitForSelector('body[data-ready=true]');const restored=await snap();check('고도74%·보조색37%·근거리·정지 URL 복원',restored.altitude===.74&&restored.secondary===.37&&Math.abs(restored.progress-NEAR)<1e-6&&!restored.running);
 await page.locator('details summary').click();await slider('altitude',0);await slider('progress',(NEAR-.02)*10000);await slider('speed',1000);await page.locator('#play').click();
 const sequence=await page.evaluate(async()=>{const out=[],until=performance.now()+9000;await new Promise(resolve=>{function frame(){const s=window.flightStudy.snapshot();out.push({p:s.progress,id:s.objectId,travel:s.motion.travel,note:s.motion.noteTime,time:s.motion.time,trails:s.trailCount,scale:s.pose.scale});if(out.length>5&&s.progress<out[out.length-2].p)resolve();else if(performance.now()<until)requestAnimationFrame(frame);else resolve();}requestAnimationFrame(frame);});return out;});
 check('1000%에서 같은 E가 배율100%로 통과 후 재사용',sequence.some((s,i)=>i>0&&s.p<sequence[i-1].p)&&sequence.every(s=>s.id===sequence[0].id&&s.scale===1));
 check('1000% 비행 중 실제 세계 잔상 표본이 생성됨',sequence.some(s=>s.trails>0));
 const first=sequence[0],last=sequence.at(-1);check('실제 애니메이션에서도 전진량/시간은280이며 노트 시간은배속과 독립',Math.abs((last.travel-first.travel)/(last.time-first.time)-280)<1e-6&&Math.abs(last.note-first.note-(last.time-first.time))<1e-6);
 await page.locator('#play').click();await settle();const frozen=await snap(),frozenHash=await capture('paused-trails.png');await page.waitForTimeout(150);const later=await snap();check('정지하면 진행·시간·잔상 개수와 실제 픽셀이 유지',later.motion.travel===frozen.motion.travel&&later.motion.time===frozen.motion.time&&later.trailCount===frozen.trailCount&&await capture('paused-trails-later.png')===frozenHash);
 await slider('speed',0);await page.locator('#play').click();const stopped=(await snap()).motion;await page.waitForTimeout(200);const stoppedLater=(await snap()).motion;check('속도0은 전진만 멈추고 참고 노트 시간은 흐름',stoppedLater.travel===stopped.travel&&stoppedLater.noteTime>stopped.noteTime);await page.locator('#play').click();
 await page.locator('#auto').check();await page.locator('#play').click();const a=(await snap()).altitude;await page.waitForTimeout(200);check('고도 반복 재생 시 고도 변화',(await snap()).altitude!==a);await page.locator('#play').click();const ap=(await snap()).altitude;await page.waitForTimeout(100);check('고도 반복도 정지하면 유지',(await snap()).altitude===ap);await page.locator('#auto').uncheck();
 await slider('speed',1000);await slider('progress',NEAR_SLIDER);
 for(const [width,height] of [[320,780],[390,844],[844,390],[1440,1100]]){await page.setViewportSize({width,height});await settle();const layout=await page.evaluate(()=>{const a=document.querySelector('.viewer').getBoundingClientRect(),b=document.querySelector('.controls').getBoundingClientRect();return{ratio:a.width/a.height,below:b.top>=a.bottom-1,overflow:document.documentElement.scrollWidth>innerWidth,buttons:[...document.querySelectorAll('button')].filter(e=>e.offsetParent!==null).every(e=>e.getBoundingClientRect().height>=44)};});check(`${width}px에서16:9·하단 조절·44px 버튼·가로 넘침 없음`,Math.abs(layout.ratio-16/9)<.02&&layout.below&&!layout.overflow&&layout.buttons);await page.screenshot({path:new URL(`viewport-${width}.png`,root).pathname,fullPage:true});}
 for(const name of ['index.html','style.css','scene.mjs','integration.mjs','world-trails.mjs','render-quality.mjs','light-batch.mjs','legacy/geometry.mjs','originals/hangar.mjs']){const r=await fetch(url+name);check(`${name} 제공 코드와 파일 일치`,r.status===200&&Buffer.from(await r.arrayBuffer()).equals(await readFile(new URL(name,root))));}
 for(const path of ['preview-state.json','source-manifest.json','integration.test.ts','browser-check.json','../AGENTS.md'])check(`${path} 비공개 경로404`,(await fetch(url+path)).status===404);
 const reduced=await browser.newPage({reducedMotion:'reduce'});await reduced.goto(url);await reduced.waitForSelector('body[data-ready=true]');check('움직임 줄이기 환경에서는 정지 시작',!(await reduced.evaluate(()=>window.flightStudy.snapshot())).running);await reduced.close();
 const resized=await browser.newPage({viewport:{width:844,height:700},deviceScaleFactor:3});
 resized.on('pageerror',e=>errors.push(e.message));
 try{
  await resized.goto(url+'?paused=1&size=.25&speed=1000');await resized.waitForSelector('body[data-ready=true]');
  for(const [width,ratio,limit] of [[844,1.5,null],[390,1,900],[844,1.5,null]]){
   await resized.setViewportSize({width,height:700});
   await resized.waitForFunction(({ratio,limit})=>{const s=window.flightStudy.snapshot();return s.renderPixelRatio===ratio&&s.trailSampleLimit===limit;},{ratio,limit});
   check(`DPR3에서${width}px로 전환하면 렌더 DPR${ratio}·잔상 예산${limit??'기존값'}을 함께 적용`,true);
  }
  await resized.setViewportSize({width:390,height:700});await resized.locator('#play').click();
  await resized.waitForFunction(()=>{const s=window.flightStudy.snapshot();return s.trailSampleLimit===900&&s.trailCount>0&&s.trailCount<=900;});
  check('데스크톱에서390px로 전환 후 재생해도 실제 잔상은900개 이하',true);
 }finally{await resized.close();}
 check('페이지·콘솔·CSP 오류0개',errors.length===0);
 const metrics=await snap();await writeFile(new URL('browser-check.json',root),JSON.stringify({checkedAt:new Date().toISOString(),url,checks,errors,probes,metrics:{calls:metrics.calls,triangles:metrics.triangles,geometries:metrics.geometries},limitations:'Isolated E + legacy light study. Headless SwiftShader verifies behavior/pixels, not real-device performance or artistic acceptance.'},null,2));console.log(JSON.stringify({passed:checks.length,errors,probes}));
}finally{await browser.close();}
