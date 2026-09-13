// 발광 면 자체에 폭과 깊이를 주고 세계 좌표에서 투영한다. 구조물 몸체는 그리지 않는다.
import { project } from './projection.mjs';
export const shapeMode = value => value === 'line' ? 'line' : 'surface';
const defaultOutline = [[-.38,-.5],[.5,-.5],[.5,.38],[.38,.5],[-.5,.5],[-.5,-.38]];
const defaultOutlineArea = .9856;

export function surfaceDimensions(light) {
  const elevation = light.elevation ?? .25;
  const flat = light.kind !== 'vertical' && (!light.layer || light.layer === 'ground' || light.layer === 'overhead');
  const vertical = light.kind === 'vertical';
  const width = vertical ? Math.max(1.6, light.extent * .20) : light.extent * (light.kind === 'point' ? .75 : 1);
  const length = vertical ? light.extent : light.extent * (flat ? .70 : .48);
  return { elevation, flat, vertical, width, length, centerHeight:elevation + (vertical ? light.extent / 2 : 0) };
}

export function surfaceVertices(light, z, outline = defaultOutline) {
  const {elevation,flat,width,length,centerHeight}=surfaceDimensions(light);
  if(light.basisU && light.basisV) {
    const center=[light.x,elevation,z];
    return outline.map(([u,v])=>center.map((value,axis)=>value+u*light.faceWidth*light.basisU[axis]+v*light.faceLength*light.basisV[axis]));
  }
  // 대각선으로 자른 두 모서리가 있는 얇은 발광 패널. 프레임·기둥은 붙이지 않는다.
  return outline.map(([u,v]) => flat ? [light.x + u*width, elevation, z + v*length] : [light.x + u*width, centerHeight + v*length, z]);
}

export function projectedSurfaceAreaEstimate(light, z, view) {
  if (light.basisU && light.basisV) {
    if(light.basisU[1]!==0||light.basisV[1]!==0)return Infinity;
    const elevation=light.elevation??.25,down=view.cameraHeight-elevation;
    const depth=z*view.cosPitch+down*view.sinPitch;
    if(!Number.isFinite(depth)||depth<2)return Infinity;
    const determinant=Math.abs(light.basisU[0]*light.basisV[2]-light.basisU[2]*light.basisV[0]);
    const screenScale=view.focal/depth;
    return light.faceWidth*light.faceLength*defaultOutlineArea*determinant*screenScale*screenScale*Math.abs(down)/depth;
  }
  if (light.basisU || light.basisV) return Infinity;
  const {vertical,width,length,centerHeight}=surfaceDimensions(light);
  const down=view.cameraHeight-centerHeight;
  const depth=z*view.cosPitch+down*view.sinPitch;
  if (!Number.isFinite(depth) || depth < 2) return Infinity;
  const screenScale=view.focal/depth;
  const planeFactor=vertical?Math.abs(z)/depth:Math.abs(down)/depth;
  return width*length*defaultOutlineArea*screenScale*screenScale*planeFactor;
}

export function projectSurface(light, z, view, outline) {
  return projectVertices(surfaceVertices(light,z,outline),view);
}

export function projectVertices(vertices, view) {
  const clipped = [];
  const depth = p => p[2] * view.cosPitch + (view.cameraHeight - p[1]) * view.sinPitch;
  for (let i=0;i<vertices.length;i++) {
    const a=vertices[i], b=vertices[(i+1)%vertices.length], da=depth(a), db=depth(b), near=2;
    if (da >= near) clipped.push(a);
    if ((da>=near)!==(db>=near)) {
      const t=(near-da)/(db-da);
      clipped.push(a.map((value,axis)=>value+(b[axis]-value)*t));
    }
  }
  if (clipped.length<3) return [];
  return clipped.map(([x,h,z])=>project(x,z,h,view));
}

export function surfaceBounds(points) {
  return { left:Math.min(...points.map(p=>p.x)), right:Math.max(...points.map(p=>p.x)), top:Math.min(...points.map(p=>p.y)), bottom:Math.max(...points.map(p=>p.y)) };
}

export function trailWidth(points, dx, dy) {
  const distance=Math.hypot(dx,dy);
  if (!points?.length || distance===0) return .7;
  const projected=points.map(p=>(p.x*-dy+p.y*dx)/distance);
  return Math.min(26,Math.max(.7,Math.max(...projected)-Math.min(...projected)));
}
