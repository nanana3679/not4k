export function renderPixelRatio(deviceRatio=1,viewportWidth=Infinity){
 const ratio=Number.isFinite(deviceRatio)&&deviceRatio>0?deviceRatio:1;
 const mobile=Number.isFinite(viewportWidth)&&viewportWidth<=560;
 return Math.min(ratio,mobile?1:1.5);
}
