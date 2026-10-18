import {chromium} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {progressForDepth} from './integration.mjs';
const root=new URL('./',import.meta.url),{url}=JSON.parse(await readFile(new URL('preview-state.json',root),'utf8'));
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}),page=await browser.newPage({viewport:{width:1200,height:1000}}),checks=[],errors=[],frames=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const check=(name,result)=>{assert.ok(result,name);checks.push(name);};
const settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
const slider=async(id,value)=>{await page.locator('#'+id).evaluate((el,v)=>{el.value=String(v);el.dispatchEvent(new Event('input',{bubbles:true}));},value);await settle();};
const shot=async name=>{await settle();return await page.locator('.viewer').screenshot(name?{path:new URL(name,root).pathname}:{});};
async function pixelDifference(a,b){return page.evaluate(async({a,b})=>{
 const decode=async data=>{const bitmap=await createImageBitmap(new Blob([Uint8Array.from(atob(data),c=>c.charCodeAt(0))],{type:'image/png'}));const canvas=new OffscreenCanvas(bitmap.width,bitmap.height),ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);return{data:ctx.getImageData(0,0,bitmap.width,bitmap.height).data,width:bitmap.width,height:bitmap.height};};
 const [one,two]=await Promise.all([decode(a),decode(b)]);let count=0,minX=one.width,maxX=0,minY=one.height,maxY=0,total=0;
 for(let y=30;y<one.height;y++)for(let x=0;x<one.width;x++){const i=(y*one.width+x)*4,d=Math.max(...[0,1,2].map(k=>Math.abs(one.data[i+k]-two.data[i+k])));total+=d;if(d>10){count++;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}}
 return{count,width:count?maxX-minX+1:0,height:count?maxY-minY+1:0,frameHeight:one.height,energy:total};
 },{a:a.toString('base64'),b:b.toString('base64')});}
try{
 await page.goto(url+'?paused=1&size=0');await page.waitForSelector('body[data-ready=true]');const initial=await page.evaluate(()=>window.flightStudy.snapshot());
 check('기본 시작은깊이1100의원거리·실제 안개650~1400',Math.abs(initial.pose.center[2]-1100)<1e-6&&initial.fog.near===650&&initial.fog.far===1400);
 await page.locator('#building').uncheck();const blank=await shot();await page.locator('#building').check();
 for(const z of [1600,1400,1300,1200,1100,900,600,300,100,44]){await slider('progress',progressForDepth(z)*10000);const bytes=await shot(`arrival-z-${z}.png`),pixels=await pixelDifference(blank,bytes),s=await page.evaluate(()=>window.flightStudy.snapshot());frames.push({z,pixels,id:s.objectId,scale:s.pose.scale});}
 console.log(JSON.stringify({frames}));
 check('재배치 직후1600에서는 건물 전체가 안개 속이라 튀어나오는 픽셀이0개',frames[0].pixels.count===0);
 check('1100부터900·600·300까지 같은 건물의 보이는 픽셀과 높이가 계속 증가',[4,5,6,7].every((i,j,all)=>frames[i].pixels.count>0&&(j===0||frames[i].pixels.count>frames[all[j-1]].pixels.count&&frames[i].pixels.height>frames[all[j-1]].pixels.height)));
 check('깊이1100에서8%이하의 작은 모습이 실제 픽셀로 보임',frames[4].pixels.count>15&&frames[4].pixels.height/frames[4].pixels.frameHeight<.08);
 check('깊이300에서는 같은 건물의 실제 높이가 원거리1100보다2배 이상',frames[7].pixels.height>frames[4].pixels.height*2);
 check('원거리에서 통과까지 실제 객체 UUID·배율100% 유지',frames.every(f=>f.id===initial.objectId&&f.scale===1));
 await page.locator('#far').click();await settle();const start=await page.evaluate(()=>window.flightStudy.snapshot());check('먼 곳부터 재생은 출발1600 부근으로 돌아가 재생 시작',start.running&&start.pose.center[2]>1500);await page.locator('#play').click();
 await page.locator('#near').click();await settle();const near=await page.evaluate(()=>window.flightStudy.snapshot());check('근거리에서 보기는 변경한 전체 경로에서도 깊이44에서 정지',!near.running&&Math.abs(near.pose.center[2]-44)<1e-6);
 await slider('progress',9999);const end=await shot();await slider('progress',0);const beginning=await shot();const wrap=await pixelDifference(end,beginning);check('반복 끝99.99%→시작0%에서 건물이 순간 출현하는 픽셀0개',wrap.count===0);
 check('페이지·콘솔·CSP 오류0개',errors.length===0);
 await writeFile(new URL('arrival-browser-check.json',root),JSON.stringify({checkedAt:new Date().toISOString(),checks,errors,frames,wrap,limitations:'Deterministic paused captures verify actual distant visibility and recycling pixels. Perceived pacing still needs user review.'},null,2));console.log(JSON.stringify({passed:checks.length,errors}));
}finally{await browser.close();}
