// 원근 흐름 탐색. 규칙적인 행·열 대신 연속적인 위치와 높이에 광원을 분포시킨다.
export const layoutMode = value => value === 'aligned' ? 'aligned' : 'flow';
const random = n => { const v=Math.sin(n*127.1+311.7)*43758.5453123;return v-Math.floor(v); };
const cameraHeight = 67.6;

export function makeFlowLights(heights) {
  const lights=[];
  for(let i=0;i<1900;i++) {
    const seed=7919+i*23, angle=(random(seed+1)-.5)*.55;
    const side=random(seed+2)<.5?-1:1;
    lights.push({
      id:`flow/ground/${i}`, kind:'point', layer:'ground', elevation:.25,
      x:side*(6+704*random(seed+3)**2.2), z:random(seed+4)*2448,
      extent:1.3+random(seed+5)*1.8, bright:.58+random(seed+6)*.42,
      faceWidth:.9+random(seed+7)*1.3, faceLength:3.5+random(seed+8)*5,
      basisU:[Math.cos(angle),0,-Math.sin(angle)], basisV:[Math.sin(angle),0,Math.cos(angle)],
    });
  }
  if(heights!=='mixed') return lights;
  for(let i=0;i<840;i++) {
    const seed=1000003+i*47, theta=random(seed+1)*Math.PI*2;
    const radius=15+185*random(seed+2)**1.7;
    const x=radius*Math.cos(theta)*1.25, elevation=cameraHeight+radius*Math.sin(theta)*.76;
    if(elevation<8 || Math.abs(x)<7) continue;
    const layer=elevation>cameraHeight+12?'overhead':elevation<cameraHeight-12?'raised':'eye';
    const twist=(random(seed+3)-.5)*.3;
    lights.push({
      id:`flow/air/${i}`, kind:'point', layer, elevation, x, z:random(seed+4)*2448,
      extent:2+random(seed+5)*2, bright:.57+random(seed+6)*.43,
      faceWidth:1.2+random(seed+7)*1.8, faceLength:4+random(seed+8)*7,
      // 긴 변은 진행 방향을 따른다. 짧은 변은 시선 주위에서 방향을 달리한다.
      basisU:[-Math.sin(theta),Math.cos(theta),0],
      basisV:[Math.cos(theta)*Math.sin(twist),Math.sin(theta)*Math.sin(twist),Math.cos(twist)],
    });
  }
  return lights;
}

// 발광 면의 내부를 한 색으로 채워 하이라이트나 뒤쪽 잔광이 내부 선으로 보이지 않게 한다.
export function faceColor(rgb, alpha) {
  const brightness=.90*Math.max(0,Math.min(1,alpha))**.75;
  return `rgb(${rgb.map(v=>Math.round(v*brightness)).join(',')})`;
}
