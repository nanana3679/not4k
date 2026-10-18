// 돌파 시각 탐색: 먼 광원의 중심을 소실점으로 모아 원뿔처럼 벌어지는 흐름을 비교한다.
export const convergenceStrength=value=>value===null||value===undefined||value===''||!Number.isFinite(Number(value)) ? .85 : Math.max(0,Math.min(1,Number(value)));
export const coneDimension=value=>value===null||value===undefined||value===''||!Number.isFinite(Number(value)) ? 1 : Math.max(.25,Math.min(3,Number(value)));

export function convergenceOffset(base,view,strength,dimensions={}){
  if(!base)return {x:0,y:0};
  const height=coneDimension(dimensions.coneHeight),diameter=coneDimension(dimensions.coneDiameter);
  // 높이는 앞뒤 길이, 지름은 중심 주위에 펼쳐지는 폭이다. 면 자체의 크기는 유지한다.
  const t=Math.max(0,Math.min(1,(base.depth-100)/(800*height)));
  const taper=Math.max(0,Math.min(1,Number(strength)||0))*t*t*(3-2*t);
  const amount=1-diameter*(1-taper);
  if(amount===0)return {x:0,y:0};
  return {x:(view.center-base.x)*amount,y:(view.horizon-base.y)*amount};
}

export function shiftProjection(points,offset){
  if(offset.x===0&&offset.y===0)return points;
  return points.map(p=>({...p,x:p.x+offset.x,y:p.y+offset.y}));
}
