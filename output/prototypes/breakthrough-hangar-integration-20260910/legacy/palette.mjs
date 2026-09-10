// 주조색은 자주, 다른 색상 계열의 보조색은 드물게 섞는 시연용 제안.
export const palettes={
  liftoff:{
    primary:{label:'청록 · 청색',colors:[[24,125,163],[55,191,194],[137,218,234]]},
    secondary:{label:'호박색 · 살구색',colors:[[205,125,79],[251,184,106],[250,218,162]]},secondaryFrequency:.2,
  },
  infiltration:{
    primary:{label:'남보라 · 청보라',colors:[[88,78,170],[134,117,235],[189,173,245]]},
    secondary:{label:'민트 · 연녹색',colors:[[35,168,151],[102,222,191],[193,246,224]]},secondaryFrequency:.2,
  },
  breakthrough:{
    primary:{label:'주홍 · 산호색',colors:[[184,49,55],[248,76,46],[255,130,83]]},
    secondary:{label:'청록 · 청백색',colors:[[40,176,215],[100,218,228],[195,237,239]]},secondaryFrequency:.2,
  },
};
for(const palette of Object.values(palettes))palette.colors=[...palette.primary.colors,...palette.secondary.colors];
const weights=[.25,.60,.15];
export const paletteKey=value=>Object.hasOwn(palettes,value)?value:'breakthrough';
export const seedMode=value=>/^\d{1,10}$/.test(String(value))&&Number(value)<=4294967295?Number(value):null;
export const secondaryRatio=(value,key='breakthrough')=>value===undefined||value===null||value===''||!Number.isFinite(Number(value))?palettes[paletteKey(key)].secondaryFrequency:Math.max(0,Math.min(.5,Number(value)));
export function random01(value){
  let hash=2166136261;for(const c of value)hash=Math.imul(hash^c.charCodeAt(0),16777619);
  hash=Math.imul(hash^(hash>>>16),2246822507);hash=Math.imul(hash^(hash>>>13),3266489909);
  return ((hash^(hash>>>16))>>>0)/4294967296;
}
function colorChoice(id,unit,key,seed=0,secondary){
  const palette=palettes[paletteKey(key)],base=`${seedMode(seed)??0}/${id}/unit-${unit}`;
  const tier=random01(base+'/tier')<secondaryRatio(secondary,key)?'secondary':'primary';
  const n=random01(base+'/shade');let limit=0,index=weights.length-1;
  for(let i=0;i<weights.length;i++){limit+=weights[i];if(n<limit){index=i;break;}}
  return {tier,colorIndex:index+(tier==='secondary'?3:0),rgb:palette[tier].colors[index]};
}
export const cellColorIndex=(id,bit,seed=0,key='breakthrough',secondary)=>colorChoice(id,bit,key,seed,secondary).colorIndex;
export const objectColor=(id,key,seed=0,secondary)=>colorChoice(id,'panel',key,seed,secondary);
export function cellColors(id,mask,key,seed=0,secondary){
  return [1,2,4,8].filter(bit=>mask&bit).map(bit=>({bit,...colorChoice(id,bit,key,seed,secondary)}));
}
export function colorGroups(id,mask,key,seed=0,secondary){
  const groups=new Map();
  for(const cell of cellColors(id,mask,key,seed,secondary)){
    if(!groups.has(cell.colorIndex))groups.set(cell.colorIndex,{mask:0,colorIndex:cell.colorIndex,rgb:cell.rgb,tier:cell.tier});
    groups.get(cell.colorIndex).mask|=cell.bit;
  }
  return [...groups.values()];
}
