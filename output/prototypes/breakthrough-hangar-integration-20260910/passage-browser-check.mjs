import {chromium} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {PASSAGE_STOPS} from './passage.mjs';

const root=new URL('./',import.meta.url),{url}=JSON.parse(await readFile(new URL('preview-state.json',root),'utf8'));
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:1100}}),checks=[],errors=[],probes=[],frames=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const check=(name,v)=>{assert.ok(v,name);checks.push(name);};
const settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
const snap=()=>page.evaluate(()=>window.flightStudy.snapshot());
const slider=async(id,value)=>{await page.locator('#'+id).evaluate((el,v)=>{el.value=String(v);el.dispatchEvent(new Event('input',{bubbles:true}));},value);await settle();};
// Element screenshots still include overlapping HUD text; exclude it from pixel comparisons.
const capture=async name=>{
 await page.locator('.hud, #overlay').evaluateAll(nodes=>nodes.forEach(n=>n.hidden=true));
 try{await settle();const b=await page.locator('#scene').screenshot(name?{path:new URL(name,root).pathname}:{});return createHash('sha256').update(b).digest('hex');}
 finally{await page.locator('.hud, #overlay').evaluateAll(nodes=>nodes.forEach(n=>n.hidden=false));}
};
const stop=async name=>{await page.locator(`[data-stop="${name}"]`).click();await settle();};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
try{
 await page.goto(url+'?study=passage&altitude=0&paused=1&backdrop=architecture&backdropBrightness=50&extensions=1&surroundings=1');
 await page.waitForSelector('body[data-ready=true]');await settle();const initial=await snap();
 check('시설 링크는 원래8종·연장부·E 주변 골조를 숨기고 새 시설 하나만 표시',initial.study==='passage'&&initial.passageVisible&&initial.visibleModels.length===0&&!initial.space.extensionVisible&&!initial.space.farVisible&&!initial.space.stationVisible);
 check('시설의 초기 접근 깊이는650·속도1000%·광원10%·직선·잔상120ms',Math.abs(initial.pose.center[2]-650)<1e-6&&initial.speed===1000&&initial.size===.25&&initial.variant==='lines'&&initial.trail===.12);
 check('시설에서는 정지4구간을 보여주고 건물 크기와 이전 시점 선택은 비활성',await page.locator('#passage-stops').isVisible()&&await page.locator('#buildingSize').isDisabled()&&await page.locator('#clearance').isDisabled()&&!await page.locator('#context-controls').isVisible());
 await slider('size',0);
 for(const altitude of [0,50,100]){
  await slider('altitude',altitude);const hashes=[];
  for(const [stage,depth] of Object.entries(PASSAGE_STOPS)){
   await stop(stage);const s=await snap();
   check(`고도${altitude}%·${stage}는 깊이${depth}에 정지하고 시설·geometry·배율을 유지`,Math.abs(s.pose.center[2]-depth)<1e-6&&!s.running&&s.pose.scale===1&&s.objectId===initial.objectId&&same(s.geometryIds,initial.geometryIds));
   check(`고도${altitude}%·${stage}는 카메라 높이${-50+altitude*.9}와 전방 시선을 유지`,Math.abs(s.view.cameraHeight-(-50+altitude*.9))<1e-6&&same(s.cameraQuaternion,[0,0,0,1]));
   const hash=await capture(`passage-${altitude}-${stage}.png`);hashes.push(hash);frames.push({altitude,stage,hash,calls:s.calls,triangles:s.triangles});
   if(stage==='inside'){
    const p=await page.evaluate(()=>window.flightStudy.probeDepth());probes.push({altitude,...p});
    check(`고도${altitude}% 시설 벽 뒤 광원·잔상은 가리고 앞에서는 표시`,!p.error&&same(p.baseline,p.behind)&&same(p.baseline,p.behindTrail)&&p.front[1]>p.baseline[1]+20&&p.frontTrail[1]>p.baseline[1]+20);await settle();
   }
  }
  check(`고도${altitude}% 접근·입구·내부·출구의 실제 캔버스가 모두 다름`,new Set(hashes).size===4);
 }
 check('시설 내부의 낮음·중간·높음은 HUD를 제외한 실제 건축 화면도 다름',new Set(frames.filter(f=>f.stage==='inside').map(f=>f.hash)).size===3);
 await stop('exit');const outside=await capture();await page.locator('#building').uncheck();await settle();check('출구-350에서는 시설 전체가 뒤로 지나가 건물 표시를 꺼도 픽셀이 동일',outside===await capture());await page.locator('#building').check();
 await stop('inside');const textured=await capture();await page.locator('details summary').click();await page.locator('#art').uncheck();await settle();check('표면 그림을 끄면 같은 시설 geometry로 단색 구조를 비교',textured!==await capture()&&same((await snap()).geometryIds,initial.geometryIds));await page.locator('#art').check();
 await page.locator('[data-module="A"]').click();await settle();const a=await snap();check('A 버튼은 기존 모드·A 연장부·중거리160으로 돌아감',a.study==='modules'&&!a.passageVisible&&a.visibleModels.join()==='A'&&a.space.extensionModule==='A'&&a.space.extensionVisible&&Math.abs(a.pose.center[2]-160)<1e-6);
 await page.locator('#passage-study').click();await settle();check('시설로 돌아오면 같은 객체·geometry를 재사용하고 접근650에 정지', (await snap()).passageId===initial.passageId&&same((await snap()).geometryIds,initial.geometryIds)&&Math.abs((await snap()).pose.center[2]-650)<1e-6);
 await slider('size',10);await slider('altitude',0);await page.locator('#far').click();await page.waitForTimeout(150);const start=await snap();await page.waitForTimeout(220);const moving=await snap();
 check('먼 곳부터 재생하면 시설·광원은 같은 전진량의0.956배로 접근하고 잔상이 생김',moving.running&&moving.motion.travel>start.motion.travel&&Math.abs(start.pose.center[2]-moving.pose.center[2]-(moving.motion.travel-start.motion.travel)*.956)<.001&&moving.trailCount>0);
 await page.locator('#play').click();await settle();const frozen=await snap(),hash=await capture();await page.waitForTimeout(120);check('정지하면 시설·광원·잔상·재귀 배경의 시간과 실제 픽셀이 멈춤',same((await snap()).motion,frozen.motion)&&hash===await capture());
 await page.locator('#auto').check();await page.locator('#play').click();await page.waitForTimeout(250);const auto=await snap();check('자동 고도는 시설 크기·geometry를 바꾸지 않고 시점만 연속 상승',auto.altitude>0&&auto.pose.scale===1&&same(auto.geometryIds,initial.geometryIds));await page.locator('#play').click();await page.locator('#auto').uncheck();
 await slider('size',0);await page.locator('#backdrop').selectOption('none');await slider('progress',9999);const end=await capture();await slider('progress',0);check('반복 끝-800→출발1800에서 시설이 갑자기 나타나는 픽셀이 없음',end===await capture());
 await page.locator('#backdrop').selectOption('architecture');await slider('size',10);await slider('altitude',50);await stop('entry');await page.reload();await page.waitForSelector('body[data-ready=true]');const restored=await snap();
 check('새로고침은 시설 선택·고도50%·입구320·정지·광원10%를 복원',restored.study==='passage'&&restored.altitude===.5&&!restored.running&&restored.size===.25&&Math.abs(restored.pose.center[2]-320)<1e-6);
 for(const [width,height] of [[320,780],[390,844],[844,390],[1440,1100]]){
  await page.setViewportSize({width,height});await settle();
  const l=await page.evaluate(()=>{const a=document.querySelector('.viewer').getBoundingClientRect(),b=document.querySelector('.controls').getBoundingClientRect();return{ratio:a.width/a.height,below:b.top>=a.bottom-1,overflow:document.documentElement.scrollWidth>innerWidth};});
  check(`${width}px에서 시설16:9·하단 조절·가로 넘침 없음`,Math.abs(l.ratio-16/9)<.02&&l.below&&!l.overflow);await stop('inside');check(`${width}px에서 시설 내부 정지 버튼과 고도 조절을 사용 가능`,Math.abs((await snap()).pose.center[2])<1e-6);
  await page.screenshot({path:new URL(`passage-viewport-${width}.png`,root).pathname,fullPage:true});
 }
 const response=await fetch(url+'passage.mjs');check('시설 실행 파일HTTP200과 로컬 소스 바이트 일치',response.status===200&&Buffer.from(await response.arrayBuffer()).equals(await readFile(new URL('passage.mjs',root))));check('시설 테스트·접속 상태 파일은비공개404',(await fetch(url+'passage.test.ts')).status===404&&(await fetch(url+'preview-state.json')).status===404);
 check('페이지·콘솔·CSP 오류0개',errors.length===0);
 await writeFile(new URL('passage-browser-check.json',root),JSON.stringify({checkedAt:new Date().toISOString(),checks,errors,probes,frames,limitations:'One path-first facility prototype. Software WebGL checks do not certify real mobile FPS, gameplay collision rules, or artistic approval.'},null,2));console.log(JSON.stringify({passed:checks.length,errors}));
}finally{await browser.close();}
