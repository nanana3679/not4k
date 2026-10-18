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

const base='?module=E&altitude=0&progress=.72&paused=1&surroundings=0&extensions=0&building=0&size=0&backdrop=architecture&backdropPhase=.2';
try{
 await page.goto(url+base);await page.waitForSelector('body[data-ready=true]');await settle();const initial=await snap(),low=await capture('stable-zoom-low.png');
 const frames=[];for(const altitude of [0,25,50,75,100]){await slider('altitude',altitude);const s=await snap();frames.push(s.paintedBackdrop.frame);check(`정지·고도${altitude}%에서 배경 배율과 재귀 위상을 유지`,s.paintedBackdrop.frame.zoom===initial.paintedBackdrop.frame.zoom&&s.paintedBackdrop.phase===initial.paintedBackdrop.phase);}
 const high=await capture('stable-zoom-high.png'),end=await snap();
 check('고도0→100%에서 같은 재귀 그림의 소실점만 아래로 이동',end.paintedBackdrop.frame.target[1]<initial.paintedBackdrop.frame.target[1]);
 const drift=await page.evaluate(async({a,b,dy})=>{
  const decode=async data=>{const image=await createImageBitmap(new Blob([Uint8Array.from(atob(data),c=>c.charCodeAt(0))],{type:'image/png'})),c=new OffscreenCanvas(image.width,image.height),x=c.getContext('2d');x.drawImage(image,0,0);return{data:x.getImageData(0,0,image.width,image.height).data,width:image.width,height:image.height};};
  const [one,two]=await Promise.all([decode(a),decode(b)]);let total=0,samples=0;
  for(let y=60;y<one.height-60-dy;y+=3)for(let x=20;x<one.width-20;x+=3){const yy=y+dy,y0=Math.floor(yy),f=yy-y0;
   for(let k=0;k<3;k++){const old=one.data[(y*one.width+x)*4+k],next=two.data[(y0*two.width+x)*4+k]*(1-f)+two.data[((y0+1)*two.width+x)*4+k]*f;total+=Math.abs(old-next);samples++;}}
  return{mean:total/samples,samples};
 },{a:low.toString('base64'),b:high.toString('base64'),dy:end.view.focus.y-initial.view.focus.y});
 pixels.push({kind:'altitude-translation',...drift});check('고도 전후 실제 배경 픽셀은 확대 없이 세로 이동으로 정렬됨',drift.mean<1.5);
 await slider('altitude',0);await page.locator('#auto').check();await page.locator('#play').click();
 const sequence=await page.evaluate(async()=>{const out=[],start=window.flightStudy.snapshot().motion.time,until=performance.now()+90000;
  await new Promise(resolve=>{function sample(){const s=window.flightStudy.snapshot();out.push({time:s.motion.time,altitude:s.altitude,zoom:s.paintedBackdrop.frame.zoom,phase:s.paintedBackdrop.phase});if(s.motion.time-start>=12.05||performance.now()>until)resolve();else requestAnimationFrame(sample);}requestAnimationFrame(sample);});return out;});
 await page.locator('#play').click();await settle();const rates=[];for(let i=1;i<sequence.length;i++){const a=sequence[i-1],b=sequence[i],dt=b.time-a.time;if(dt>1e-6)rates.push((Math.log(b.zoom/a.zoom)+Math.log(4)*(b.phase-a.phase))/dt*100);}
 check('실제 고도 반복0→100→0의12초 한 주기를 끝까지 관찰',sequence.at(-1).time-sequence[0].time>=12&&Math.max(...sequence.map(s=>s.altitude))>.99&&Math.min(...sequence.map(s=>s.altitude))<.01);
 check('고도 반복 중 초당 합성 확대율은+1.733%로 일정하고 음수 축소 구간이 없음',Math.min(...rates)>1.7328&&Math.max(...rates)<1.733);
 check('고도 반복 한 주기 내내 배경 커버 배율은 하나로 고정',new Set(sequence.map(s=>s.zoom)).size===1);
 await capture('stable-zoom-auto.png');
 await page.setViewportSize({width:390,height:844});await settle();const before=(await snap()).paintedBackdrop.frame.zoom;await slider('altitude',100);check('390px 모바일에서도 고도 변경이 추가 줌을 만들지 않음',(await snap()).paintedBackdrop.frame.zoom===before);await page.screenshot({path:new URL('stable-zoom-mobile.png',root).pathname,fullPage:true});
 check('페이지·콘솔·CSP 오류0개',errors.length===0);
 await writeFile(new URL('zoom-stability-browser-check.json',root),JSON.stringify({checkedAt:new Date().toISOString(),checks,errors,pixels,zoomRates:{min:Math.min(...rates),max:Math.max(...rates)},observedSeconds:sequence.at(-1).time-sequence[0].time,limitations:'Proves removal of altitude-dependent auto-fit zoom and backward zoom in the default altitude cycle. Perceived recursive-layer blending is still an artistic judgment.'},null,2));console.log(JSON.stringify({passed:checks.length,errors,pixels,zoomRates:{min:Math.min(...rates),max:Math.max(...rates)}}));
}finally{await browser.close();}
