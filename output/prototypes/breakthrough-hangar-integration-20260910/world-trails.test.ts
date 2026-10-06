import {it,expect} from 'vitest';
import {TrailPool,advanceTrails,limitTrailSamples,mobileTrailQuality,trailAlpha} from './world-trails.mjs';
const face=(id='p1/0/fill/1',x=0,z=10)=>({id,points:[[x,0,z],[x+1,0,z],[x,1,z]],screen:[{x,y:0},{x:x+1,y:0},{x,y:1}],outline:false,alpha:1,rgb:[255,100,0],lineWidth:1});
it('8px 이동한 16ms 동안 세계 좌표와 깊이를 보간한 잔상2개를 남긴다',()=>{const t=advanceTrails([],[face()],[face(undefined,8,8)],.016,.12,.016);expect(t).toHaveLength(2);expect(t[0].points[0]).toEqual([2,0,9.5]);expect(t[1].points[0]).toEqual([6,0,8.5]);});
it('재출현으로 cycle ID가0→1이면 먼 위치까지 이어 붙이지 않고 이전 면만 남긴다',()=>{const t=advanceTrails([],[face()],[face('p1/1/fill/1',100,200)],.016,.12,.016);expect(t).toHaveLength(1);expect(t[0].points).toEqual(face().points);});
it('전면 절단으로 꼭짓점3→4개이면 새 경계와 이전 경계를 보간하지 않는다',()=>{const n=face(undefined,8);n.points.push([10,1,0]);n.screen.push({x:10,y:1});expect(advanceTrails([],[face()],[n],.016,.12,.016)[0].points).toEqual(face().points);});
it('열린 윤곽선 경계가 달라지면 닫는 선을 새로 연결하지 않는다',()=>{const a={...face(),outline:true,edges:[true,false,true]},b={...face(undefined,8),outline:true,edges:[true,true,true]};const t=advanceTrails([],[a],[b],.016,.12,.016);expect(t).toHaveLength(1);expect(t[0].edges).toEqual([true,false,true]);});
it('120ms가 지난 잔상은 사라지고 60ms 잔상은 처음보다 어두워진다',()=>{const t={...face(),time:0,interval:.016};expect(advanceTrails([t],[],[],.12,.12,0)).toEqual([]);expect(trailAlpha(t,.06,.12)).toBeLessThan(trailAlpha(t,.01,.12));expect(trailAlpha(t,.12,.12)).toBe(0);});
it('일시정지 dt=0과 고정 시간에서는 기존 잔상의 개수·위치·밝기가 유지된다',()=>{const t={...face(),time:0,interval:.016};expect(advanceTrails([t],[face()],[face(undefined,8)],.02,.12,0)).toEqual([t]);});
it('속도0으로 화면 이동이0px이면 잔상 표본을 추가하지 않는다',()=>{expect(advanceTrails([],[face()],[face()],.016,.12,.016)).toEqual([]);});
it('잔상 길이0ms는 남아 있던 모든 잔상을 즉시 비운다',()=>{expect(advanceTrails([{...face(),time:0}],[],[],.01,0,.01)).toEqual([]);});
it('100px 빠른 이동도 한 광원당12개의 보간 표본으로 제한한다',()=>{expect(advanceTrails([],[face()],[face(undefined,100)],.05,.12,.05)).toHaveLength(12);});
it('모바일 품질에서 100px 빠른 이동은 한 광원당6개의 보간 표본으로 제한한다',()=>{expect(advanceTrails([],[face()],[face(undefined,100)],.05,.12,.05,mobileTrailQuality)).toHaveLength(6);});
it('잔상5개를 최대3개로 제한하면 처음·중간·마지막 시간 범위를 유지한다',()=>{const samples=Array.from({length:5},(_,time)=>({...face(String(time)),time}));expect(limitTrailSamples(samples,3).map(s=>s.time)).toEqual([0,2,4]);});
it('모바일 잔상 예산900개를 넘으면 시간 범위를 유지한900개만 남긴다',()=>{const samples=Array.from({length:1200},(_,time)=>({...face(String(time)),time}));const limited=limitTrailSamples(samples,mobileTrailQuality.maxSamples);expect(limited).toHaveLength(900);expect(limited[0].time).toBe(0);expect(limited.at(-1).time).toBe(1199);});
const sampleValues=(s:{id:string;outline:boolean;rgb:number[];points:number[][];edges?:boolean[];alpha:number;lineWidth:number;time:number;interval:number})=>({id:s.id,outline:s.outline,rgb:s.rgb,points:s.points.map(p=>[...p]),edges:s.edges&&[...s.edges],alpha:s.alpha,lineWidth:s.lineWidth,time:s.time,interval:s.interval});
it('TrailPool을 넘긴 잔상은 30fps·60fps·정지·120ms 만료가 섞인 8프레임 동안 새 객체 계산과 표본 값·순서가 같다',()=>{
 const pool=new TrailPool();let fresh:ReturnType<typeof advanceTrails>=[],reused:ReturnType<typeof advanceTrails>=[],previous=[face(),{...face('p2/0/stroke/line',20),outline:true,edges:[true,false,true]}],now=0;
 for(const [dt,shift] of [[.033,6],[.016,3],[0,0],[.016,90],[.05,4],[.016,2],[.2,1],[.016,8]]){
  now+=dt;
  const current=previous.map(f=>({...f,points:f.points.map(p=>[p[0]+shift,p[1],p[2]-shift/10]),screen:f.screen.map(p=>({x:p.x+shift,y:p.y})),alpha:Math.max(.1,f.alpha-.05)}));
  fresh=advanceTrails(fresh,previous,current,now,.12,dt);
  reused=advanceTrails(reused,previous,current,now,.12,dt,undefined,pool);
  expect(reused.map(sampleValues)).toEqual(fresh.map(sampleValues));
  previous=current;
 }
});
it('TrailPool은 120ms가 지나 만료된 표본 객체를 다음 표본으로 다시 쓰고 반환 배열도 같은 배열이다',()=>{
 const pool=new TrailPool(),first=advanceTrails(pool.clear(),[face()],[face(undefined,8)],.016,.12,.016,undefined,pool);
 const old=first[0];
 const second=advanceTrails(first,[face()],[face(undefined,8)],.2,.12,.016,undefined,pool);
 expect(second).toBe(first);
 expect(second).toHaveLength(2);
 expect(second).toContain(old);
});
it('TrailPool에 다른 배열을 history로 넘기면 그 배열과 표본 객체를 바꾸지 않는다',()=>{
 const history=[{...face(),time:0,interval:.016}],saved=structuredClone(history);
 advanceTrails(history,[face()],[face(undefined,8)],.2,.12,.016,undefined,new TrailPool());
 expect(history).toEqual(saved);
});
it('모바일 예산 3개로 TrailPool 표본 5개를 줄이면 limitTrailSamples처럼 처음·중간·마지막 시간을 남긴다',()=>{
 const pool=new TrailPool(),samples=advanceTrails(pool.clear(),[face()],[face(undefined,20)],.05,.12,.05,{maxSamples:3},pool);
 const full=advanceTrails([],[face()],[face(undefined,20)],.05,.12,.05);
 expect(full).toHaveLength(5);
 expect(samples.map(s=>s.time)).toEqual(limitTrailSamples(full,3).map(s=>s.time));
});
it('TrailPool 표본의 frame·screen은 원래 면 버퍼를 가리키지 않고 null이다',()=>{
 const pool=new TrailPool(),samples=advanceTrails(pool.clear(),[{...face(),frame:{t:.5}}],[face(undefined,8)],.016,.12,.016,undefined,pool);
 expect(samples.length).toBeGreaterThan(0);
 for(const sample of samples){expect(sample.frame).toBeNull();expect(sample.screen).toBeNull();}
});
it('100px 이동 면 400개로 표본 4,800개가 생긴 뒤 이동이 멎으면 재사용 대기 표본은 살아 있는 표본×2+256개로 줄고 표본 값은 새 객체 계산과 같다',()=>{
 const pool=new TrailPool(),faces=(shift:number)=>Array.from({length:400},(_,i)=>face(`p${i}/0/fill/line`,shift,10+i));
 let fresh:ReturnType<typeof advanceTrails>=[],reused:ReturnType<typeof advanceTrails>=pool.clear(),now=.05;
 fresh=advanceTrails(fresh,faces(0),faces(100),now,.12,.05);
 reused=advanceTrails(reused,faces(0),faces(100),now,.12,.05,undefined,pool);
 expect(reused).toHaveLength(4800);
 for(const [dt,shift] of [[.2,0],[.016,1],[.016,1]]){
  now+=dt;
  fresh=advanceTrails(fresh,faces(100),faces(100+shift),now,.12,dt);
  reused=advanceTrails(reused,faces(100),faces(100+shift),now,.12,dt,undefined,pool);
  expect(reused.map(sampleValues)).toEqual(fresh.map(sampleValues));
  expect(pool.freeCount).toBeLessThanOrEqual(reused.length*2+256);
 }
 expect(pool.freeCount).toBeLessThan(1000);
});
