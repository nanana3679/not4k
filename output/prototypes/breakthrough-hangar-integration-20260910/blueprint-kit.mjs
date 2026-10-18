// PROTOTYPE: fixed, textured architectural surfaces. XY profiles must be convex CCW.
export function createBuilder(){
 const model={vertices:[],faces:[],panels:[],boxes:[],beams:[],solids:[]};
 const box=(id,position,size,tone='side')=>model.boxes.push({id,position,size,tone});
 const beam=(id,start,end,width=.14,depth=width,tone='beam')=>model.beams.push({id,start,end,width,depth,tone});
 const panel=(id,x,y,z,w,h,texture='window')=>model.panels.push({id,points:[[x,y,z],[x+w,y,z],[x+w,y+h,z],[x,y+h,z]],texture,uv:[[0,0],[1,0],[1,1],[0,1]]});
 const prism=(id,profile,front,back,tone='hull')=>{
  const offset=model.vertices.length,n=profile.length,points=[...profile.map(([x,y])=>[x,y,front]),...profile.map(([x,y])=>[x,y,back])];model.vertices.push(...points);
  const loX=Math.min(...profile.map(p=>p[0])),hiX=Math.max(...profile.map(p=>p[0])),loY=Math.min(...profile.map(p=>p[1])),hiY=Math.max(...profile.map(p=>p[1]));
  const fs=[{name:'front',local:profile.map((_,i)=>i),tone},{name:'back',local:profile.map((_,i)=>2*n-1-i),tone:'back'}];
  for(let i=0;i<n;i++){const j=(i+1)%n,dy=profile[j][1]-profile[i][1],dx=profile[j][0]-profile[i][0];fs.push({name:`edge-${i}`,local:[n+i,n+j,j,i],tone:Math.abs(dx)>Math.abs(dy)?(dx>0?'soffit':'roof'):tone});}
  for(const f of fs){const p=f.local.map(i=>points[i]);model.faces.push({id:`${id}/${f.name}`,solid:id,indices:f.local.map(i=>i+offset),points:p,tone:f.tone,uv:f.name==='front'||f.name==='back'?p.map(([x,y])=>[(x-loX)/(hiX-loX),(y-loY)/(hiY-loY)]):[[0,0],[1,0],[1,1],[0,1]]});}
  model.solids.push({id,vertices:points,bounds:{min:[loX,loY,back],max:[hiX,hiY,front]}});
 };
 return{model,box,beam,panel,prism};
}
export const chamfer=(x0,y0,x1,y1,c=.4)=>[[x0+c,y0],[x1-c,y0],[x1,y0+c],[x1,y1-c],[x1-c,y1],[x0+c,y1],[x0,y1-c],[x0,y0+c]];
