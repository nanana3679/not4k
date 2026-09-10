import {chromium} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const root=new URL('./',import.meta.url),{url}=JSON.parse(await readFile(new URL('preview-state.json',root),'utf8'));
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:1100}}),checks=[],errors=[],models=[],probes=[],wraps=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const check=(name,value)=>{assert.ok(value,name);checks.push(name);};
const settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
const snap=()=>page.evaluate(()=>window.flightStudy.snapshot());
const slider=async(id,value)=>{await page.locator('#'+id).evaluate((el,v)=>{el.value=String(v);el.dispatchEvent(new Event('input',{bubbles:true}));},value);await settle();};
const capture=async name=>{await settle();const bytes=await page.locator('.viewer').screenshot(name?{path:new URL(name,root).pathname}:{});return createHash('sha256').update(bytes).digest('hex');};
const capturePixels=async()=>{await settle();return (await page.locator('.viewer').screenshot()).toString('base64');};
const pixelDifference=(a,b)=>page.evaluate(async([a,b])=>{
 const decode=async base64=>{const image=await createImageBitmap(new Blob([Uint8Array.from(atob(base64),c=>c.charCodeAt(0))],{type:'image/png'}));const canvas=new OffscreenCanvas(image.width,image.height),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);return ctx.getImageData(0,0,image.width,image.height).data;};
 const [one,two]=await Promise.all([decode(a),decode(b)]);let maximum=0,changed=0;
 for(let i=0;i<one.length;i+=4){let difference=0;for(let c=0;c<3;c++)difference=Math.max(difference,Math.abs(one[i+c]-two[i+c]));maximum=Math.max(maximum,difference);if(difference)changed++;}
 return{maximum,changed};
},[a,b]);

try{
 await page.goto(url+'?module=A&altitude=0&progress=.72&paused=1&extensions=1&backdrop=architecture&backdropBrightness=50&size=0');
 await page.waitForSelector('body[data-ready=true]');await settle();
 const initial=await snap(),ids=initial.space.extensionIds;
 for(const id of ['A','B','C','D','E','F','G','H']){
  await page.locator(`[data-module="${id}"]`).click();await settle();
  const before=await snap();
  check(`${id} 선택은 해당 연결부 하나만 표시하고 구조 연장 조절을 사용할 수 있음`,before.space.visibleExtensions.join()===id&&!await page.locator('#extensions').isDisabled());
  check(`${id} 전환은 기존 전진량·모든 연결부 ID를 유지`,JSON.stringify(before.motion)===JSON.stringify(initial.motion)&&JSON.stringify(before.space.extensionIds)===JSON.stringify(ids));
  for(const altitude of [0,50,100]){
   await slider('altitude',altitude);const onState=await snap(),on=await capture(`connections-${id}-alt-${altitude}.png`);
   await page.locator('#extensions').uncheck();await settle();const offState=await snap(),off=await capture();
   check(`${id} 고도${altitude}%에서 연장 구조가 실제 화면에 추가됨`,on!==off);
   check(`${id} 고도${altitude}%에서 연장을 꺼도 본체 geometry·카메라·전진량·배경 위상 유지`,!offState.space.extensionVisible&&JSON.stringify(onState.geometryIds)===JSON.stringify(offState.geometryIds)&&JSON.stringify(onState.view)===JSON.stringify(offState.view)&&JSON.stringify(onState.motion)===JSON.stringify(offState.motion)&&onState.backdropPhase===offState.backdropPhase);
   await page.locator('#extensions').check();await settle();
   const s=await snap(),local=s.space.extensionBounds,position=s.space.extensionPosition,scale=s.space.extensionScale;
   const depth=-(position[2]+(local.min[2]+local.max[2])/2*scale[2]);
   const bottom=position[1]+local.min[1]*scale[1];
   const projectedY=s.view.principalY+(s.view.cameraHeight-bottom)*s.view.focal/(depth+s.view.back);
   check(`${id} 고도${altitude}% 중거리160에서 긴 몸통의 아래 끝은 화면 아래로 이어짐`,projectedY>s.view.height);
   if(altitude!==50){
    const p=await page.evaluate(()=>window.flightStudy.probeDepth('extension'));probes.push({id,altitude,...p});
    check(`${id} 고도${altitude}% 연결부 뒤 광원·잔상은 가리고 앞 광원·잔상은 표시`,!p.error&&JSON.stringify(p.baseline)===JSON.stringify(p.behind)&&JSON.stringify(p.baseline)===JSON.stringify(p.behindTrail)&&p.front[1]>p.baseline[1]+20&&p.frontTrail[1]>p.baseline[1]+20);
    await settle();
   }
  }
  await slider('altitude',0);await slider('buildingSize',180);await slider('progress',9999);const end=await capturePixels();
  await slider('progress',0);
  const difference=await pixelDifference(end,await capturePixels());wraps.push({id,...difference});
  check(`${id} 크기180%의 반복 끝→출발은 배경 안개의8비트 반올림 차이1/255 이내`,difference.maximum<=1);
  await slider('buildingSize',100);await slider('progress',7200);
  await page.locator('#building').uncheck();await settle();check(`${id} 건물 숨김은 연결부도 숨김`,!(await snap()).space.extensionVisible);
  await page.locator('#building').check();await settle();
  models.push({id,calls:(await snap()).calls,triangles:(await snap()).triangles});
 }
 await page.locator('[data-module="A"]').click();await settle();check('A로 되돌아와도 같은 연결부 객체를 재사용', (await snap()).space.extensionId===ids.A);
 await page.locator('#extensions').uncheck();await page.reload();await page.waitForSelector('body[data-ready=true]');
 check('A의 구조 연장 끄기와 모델 선택을 새로고침 후 복원',!(await snap()).space.extensionVisible&&(await snap()).module==='A');
 await page.locator('#extensions').check();await page.locator('details summary').click();await page.locator('#art').uncheck();await settle();const plain=await capture();
 await page.locator('#art').check();check('A의 구조 연결부도 표면 그림 비교를 따라감',plain!==await capture());
 await slider('size',10);await page.locator('#play').click();await page.waitForTimeout(200);await page.locator('#play').click();await settle();
 const paused=await snap(),frozen=await capture();await page.waitForTimeout(150);
 check('구조 연장·광원·잔상·원경을 함께 정지하면 같은 프레임 유지',paused.trailCount>0&&frozen===await capture());
 for(const [width,height] of [[320,800],[390,844],[844,390]]){
  await page.setViewportSize({width,height});await settle();
  check(`너비${width}px에서 구조 연장 조절이 활성화되고 가로 넘침 없음`,!await page.locator('#extensions').isDisabled()&&await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await capture(`connections-viewport-${width}.png`);
 }
 for(const name of ['a-wedge','b-maintenance','c-service-tower','d-twin-gallery','e-hangar','f-open-dock','g-transfer-spine','h-logistics-hub']){
  const path=`extensions/${name}.mjs`,r=await fetch(url+path);
  check(`${name} 연결부 실행 파일 HTTP200과 작업 파일 일치`,r.status===200&&Buffer.from(await r.arrayBuffer()).equals(await readFile(new URL(path,root))));
  check(`${name} 연결부 테스트 파일은 비공개404`,(await fetch(url+`extensions/${name}.test.ts`)).status===404);
 }
 const materialSource=await fetch(url+'architectural-materials.mjs');
 check('공통 외장 재질 실행 파일 HTTP200과 소스 일치',materialSource.status===200&&Buffer.from(await materialSource.arrayBuffer()).equals(await readFile(new URL('architectural-materials.mjs',root))));
 check('공통 외장 재질 테스트는 비공개404',(await fetch(url+'architectural-materials.test.ts')).status===404);
 check('페이지·콘솔·CSP 오류0개',errors.length===0);
 await writeFile(new URL('connections-browser-check.json',root),JSON.stringify({checkedAt:new Date().toISOString(),checks,errors,models,probes,wraps},null,2));
 console.log(JSON.stringify({passed:checks.length,errors,models}));
}finally{await browser.close();}
