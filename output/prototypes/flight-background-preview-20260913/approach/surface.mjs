// 발광 면 자체에 폭과 깊이를 주고 세계 좌표에서 투영한다. 구조물 몸체는 그리지 않는다.
// 게임은 매 프레임 수백 개 면을 투영하므로 계산 본체는 재사용 typed array에 쓰고,
// 배열·객체를 돌려주는 기존 함수는 그 결과를 새 객체로 옮겨 같은 값을 유지한다.
import { hypot2 } from './hypot.mjs';
export const shapeMode = value => value === 'line' ? 'line' : 'surface';
const defaultOutline = [[-.38,-.5],[.5,-.5],[.5,.38],[.38,.5],[-.5,.5],[-.5,-.38]];
const defaultOutlineArea = .9856;
const NEAR = 2;

function dimensionsInto(target, light) {
  const elevation = light.elevation ?? .25;
  const flat = light.kind !== 'vertical' && (!light.layer || light.layer === 'ground' || light.layer === 'overhead');
  const vertical = light.kind === 'vertical';
  target.elevation = elevation;
  target.flat = flat;
  target.vertical = vertical;
  target.width = vertical ? Math.max(1.6, light.extent * .20) : light.extent * (light.kind === 'point' ? .75 : 1);
  target.length = vertical ? light.extent : light.extent * (flat ? .70 : .48);
  target.centerHeight = elevation + (vertical ? light.extent / 2 : 0);
  return target;
}
const dimensions = dimensionsInto({}, { extent:1 });

export function surfaceDimensions(light) {
  return dimensionsInto({}, light);
}

// 재사용 작업 버퍼. 한 호출 안에서만 쓰고 값을 밖으로 넘길 때는 복사한다.
let worldScratch = new Float64Array(48);
let clipScratch = new Float64Array(96);
function ensureWorldScratch(count) {
  if (worldScratch.length < count * 3) worldScratch = new Float64Array(count * 3);
  if (clipScratch.length < count * 6) clipScratch = new Float64Array(count * 6);
  return worldScratch;
}

// 면 꼭짓점의 세계 좌표를 [x, 높이, z] 순서로 coords에 기록하고 꼭짓점 수를 돌려준다.
function surfaceCoordsInto(coords, light, z, outline) {
  const {elevation,flat,width,length,centerHeight}=dimensionsInto(dimensions, light);
  const count = outline.length;
  if(light.basisU && light.basisV) {
    for (let i = 0; i < count; i++) {
      const u = outline[i][0], v = outline[i][1];
      coords[i * 3] = light.x+u*light.faceWidth*light.basisU[0]+v*light.faceLength*light.basisV[0];
      coords[i * 3 + 1] = elevation+u*light.faceWidth*light.basisU[1]+v*light.faceLength*light.basisV[1];
      coords[i * 3 + 2] = z+u*light.faceWidth*light.basisU[2]+v*light.faceLength*light.basisV[2];
    }
    return count;
  }
  // 대각선으로 자른 두 모서리가 있는 얇은 발광 패널. 프레임·기둥은 붙이지 않는다.
  // 눕힌 면과 세운 면을 다른 반복문으로 쓴다. 한 식에서 인자 z와 계산값을 고르면 V8이 계산값을 boxing해 할당이 생긴다.
  if (flat) {
    for (let i = 0; i < count; i++) {
      const u = outline[i][0], v = outline[i][1];
      coords[i * 3] = light.x + u*width; coords[i * 3 + 1] = elevation; coords[i * 3 + 2] = z + v*length;
    }
  } else {
    for (let i = 0; i < count; i++) {
      const u = outline[i][0], v = outline[i][1];
      coords[i * 3] = light.x + u*width; coords[i * 3 + 1] = centerHeight + v*length; coords[i * 3 + 2] = z;
    }
  }
  return count;
}

export function surfaceVertices(light, z, outline = defaultOutline) {
  const coords = ensureWorldScratch(outline.length), count = surfaceCoordsInto(coords, light, z, outline);
  return Array.from({ length:count }, (_, i) => [coords[i * 3], coords[i * 3 + 1], coords[i * 3 + 2]]);
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
  const {vertical,width,length,centerHeight}=dimensionsInto(dimensions, light);
  const down=view.cameraHeight-centerHeight;
  const depth=z*view.cosPitch+down*view.sinPitch;
  if (!Number.isFinite(depth) || depth < 2) return Infinity;
  const screenScale=view.focal/depth;
  const planeFactor=vertical?Math.abs(z)/depth:Math.abs(down)/depth;
  return width*length*defaultOutlineArea*screenScale*screenScale*planeFactor;
}

/**
 * 화면 다각형 작업 버퍼. data에 꼭짓점마다 x·y·scale·depth를 연속으로 담고 count개만 유효하다.
 * 게임 경로는 이 버퍼 하나를 매 프레임 다시 써서 투영 결과용 배열과 객체를 만들지 않는다.
 */
export class ScreenPolygon {
  constructor(capacity = 16) {
    this.data = new Float64Array(capacity * 4);
    this.count = 0;
  }

  reserve(count) {
    if (this.data.length < count * 4) this.data = new Float64Array(count * 8);
  }

  toPoints() {
    const data = this.data;
    return Array.from({ length:this.count }, (_, i) => ({ x:data[i * 4], y:data[i * 4 + 1], scale:data[i * 4 + 2], depth:data[i * 4 + 3] }));
  }
}

// coords의 꼭짓점을 깊이 2에서 자르고 투영해 polygon에 기록한다. 남은 꼭짓점이 3개 미만이면 count는 0이다.
function projectCoordsInto(coords, count, view, polygon) {
  const clipped = clipScratch;
  let clippedCount = 0;
  for (let i=0;i<count;i++) {
    const a=i*3, b=((i+1)%count)*3;
    const da=coords[a+2]*view.cosPitch+(view.cameraHeight-coords[a+1])*view.sinPitch;
    const db=coords[b+2]*view.cosPitch+(view.cameraHeight-coords[b+1])*view.sinPitch;
    if (da >= NEAR) {
      clipped[clippedCount*3]=coords[a]; clipped[clippedCount*3+1]=coords[a+1]; clipped[clippedCount*3+2]=coords[a+2];
      clippedCount++;
    }
    if ((da>=NEAR)!==(db>=NEAR)) {
      const t=(NEAR-da)/(db-da);
      for (let axis=0;axis<3;axis++) clipped[clippedCount*3+axis]=coords[a+axis]+(coords[b+axis]-coords[a+axis])*t;
      clippedCount++;
    }
  }
  if (clippedCount<3) { polygon.count = 0; return 0; }
  polygon.reserve(clippedCount);
  const data = polygon.data;
  for (let i=0;i<clippedCount;i++) {
    // project()와 같은 식을 꼭짓점마다 인라인으로 계산한다. 함수에 실수 인자를 넘기면 V8이 숫자를 boxing해 할당이 생긴다.
    // 잘린 꼭짓점의 깊이는 2 이상이라 project가 null을 돌려주는 경우(깊이 0.1 이하)는 없다.
    const x=clipped[i*3], h=clipped[i*3+1], z=clipped[i*3+2];
    const down = view.cameraHeight - h;
    const depth = z * view.cosPitch + down * view.sinPitch;
    data[i*4] = view.center + x * view.focal / depth;
    data[i*4+1] = view.principalY + (down * view.cosPitch - z * view.sinPitch) * view.focal / depth;
    data[i*4+2] = view.focal / depth;
    data[i*4+3] = depth;
  }
  polygon.count = clippedCount;
  return clippedCount;
}

// 발광 면을 polygon에 투영하고 유효한 꼭짓점 수를 돌려준다. 새 객체를 만들지 않는다.
export function projectSurfaceInto(light, z, view, polygon, outline = defaultOutline) {
  const coords = ensureWorldScratch(outline.length);
  return projectCoordsInto(coords, surfaceCoordsInto(coords, light, z, outline), view, polygon);
}

export function projectSurface(light, z, view, outline) {
  const polygon = new ScreenPolygon();
  projectSurfaceInto(light, z, view, polygon, outline);
  return polygon.toPoints();
}

export function projectVertices(vertices, view) {
  const coords = ensureWorldScratch(vertices.length);
  for (let i = 0; i < vertices.length; i++) {
    coords[i * 3] = vertices[i][0]; coords[i * 3 + 1] = vertices[i][1]; coords[i * 3 + 2] = vertices[i][2];
  }
  const polygon = new ScreenPolygon(vertices.length * 2);
  projectCoordsInto(coords, vertices.length, view, polygon);
  return polygon.toPoints();
}

export function surfaceBounds(points) {
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    left = Math.min(left, p.x); right = Math.max(right, p.x); top = Math.min(top, p.y); bottom = Math.max(bottom, p.y);
  }
  return { left, right, top, bottom };
}

// ScreenPolygon의 경계를 out에 기록한다. surfaceBounds와 같은 값을 만든다.
export function polygonBoundsInto(polygon, out) {
  const data = polygon.data;
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  for (let i = 0; i < polygon.count; i++) {
    const x = data[i * 4], y = data[i * 4 + 1];
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  out.left = left; out.right = right; out.top = top; out.bottom = bottom;
  return out;
}

export function trailWidth(points, dx, dy) {
  const distance=hypot2(dx,dy);
  if (!points?.length || distance===0) return .7;
  let low = Infinity, high = -Infinity;
  for (let i = 0; i < points.length; i++) {
    const projected=(points[i].x*-dy+points[i].y*dx)/distance;
    low = Math.min(low, projected); high = Math.max(high, projected);
  }
  return Math.min(26,Math.max(.7,high-low));
}
