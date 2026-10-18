// Fixed surface UVs: a fine bilinear grid for quads, a center fan for convex caps.
export function surfaceData(points,uv) {
  const positions=[],texcoords=[],indices=[];
  if(points.length===4){
    const steps=8;
    for(let j=0;j<=steps;j++)for(let i=0;i<=steps;i++){
      const u=i/steps,v=j/steps;
      for(let axis=0;axis<3;axis++)positions.push((1-v)*((1-u)*points[0][axis]+u*points[1][axis])+v*((1-u)*points[3][axis]+u*points[2][axis]));
      for(let axis=0;axis<2;axis++)texcoords.push((1-v)*((1-u)*uv[0][axis]+u*uv[1][axis])+v*((1-u)*uv[3][axis]+u*uv[2][axis]));
      if(i<steps&&j<steps){const k=j*(steps+1)+i;indices.push(k,k+1,k+steps+2,k,k+steps+2,k+steps+1);}
    }
  }else{
    for(let axis=0;axis<3;axis++)positions.push(points.reduce((sum,p)=>sum+p[axis],0)/points.length);
    for(let axis=0;axis<2;axis++)texcoords.push(uv.reduce((sum,p)=>sum+p[axis],0)/uv.length);
    positions.push(...points.flat());texcoords.push(...uv.flat());
    for(let i=0;i<points.length;i++)indices.push(0,i+1,(i+1)%points.length+1);
  }
  return {positions,texcoords,indices};
}
