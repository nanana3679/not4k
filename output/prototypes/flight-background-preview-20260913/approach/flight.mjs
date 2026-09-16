import { depthAtRow, flowAtRow, stepAltitude, laneAt } from './projection.mjs';
import {initialView} from './settings.mjs';
import {skyBrightness, dimSky} from './sky-lighting.mjs';
import {liftoffLighting, visibleRunwayLights, runwayGround, liftoffObjectLights} from './runway.mjs';
import {setupControlPanel} from '../control-panel.mjs';
import { scenarios, scenarioKey, cameraAt, makeLights, visibleLights, advanceTrails, trailOpacity, speedMultiplier } from './motion.mjs';
import { heightMode } from './height.mjs';
import { shapeMode } from './surface.mjs';
import { layoutMode, faceColor } from './flow.mjs';
import { objectScale } from './triangles.mjs';
import { palettes, seedMode, secondaryRatio } from './palette.mjs';
import { advanceSurfaceTrails, surfaceTrailOpacity, surfaceTrailBatches } from './afterglow.mjs';
import { objectKind } from './objects.mjs';
import { convergenceStrength, coneDimension } from './convergence.mjs';
import { proceduralTrailBatchStyle, proceduralTrailGlowAlpha, proceduralTrailSegments, proceduralTrailStrength } from './procedural-trails.mjs';
import { skyAsset } from './sky-background.mjs';
import { adaptiveQualityState, advanceAdaptiveQuality, renderPixelRatio, renderQualityProfile } from './render-quality.mjs';
import { createGpuLightLayer, hexRgb } from './gpu-light-batch.mjs';
const $ = selector => document.querySelector(selector);
const canvas = $('#scene'), ctx = canvas.getContext('2d', { alpha: false });
const gpuCanvas = $('#gpu-lights'), hudCanvas = $('#hud-layer'), hudCtx = hudCanvas.getContext('2d');
const gpuLights = createGpuLightLayer(gpuCanvas);
const initial = initialView(location.search, matchMedia('(prefers-reduced-motion: reduce)').matches);
let key = initial.scenario;
let heights = heightMode(new URLSearchParams(location.search).get('height'));
let shape = shapeMode(new URLSearchParams(location.search).get('shape'));
let layout = layoutMode(new URLSearchParams(location.search).get('layout'));
let seed=seedMode(new URLSearchParams(location.search).get('seed'))??crypto.getRandomValues(new Uint32Array(1))[0];
let scale=objectScale(new URLSearchParams(location.search).get('scale'));
let secondary=secondaryRatio(new URLSearchParams(location.search).get('secondary'),key);
let convergence=convergenceStrength(new URLSearchParams(location.search).get('convergence'));
let coneHeight=coneDimension(new URLSearchParams(location.search).get('coneHeight'));
let coneDiameter=coneDimension(new URLSearchParams(location.search).get('coneDiameter'));
let scene = scenarios[key], lights = makeLights(key, heights, layout), rgb = scene.rgb.split(',').map(Number);
let target = initial.altitude, altitude = target, speed = speedMultiplier(new URLSearchParams(location.search).get('speed')), duration = scene.duration;
let running = initial.running;
let afterglow = true, showLanes = new URLSearchParams(location.search).get('lanes')!=='0', emission = true, automatic = 0;
let width = 800, height = 540, ground, skies = new Map(), pattern, terrain, terrainCtx;
let travel = 130, time = 0, noteTime = 0, lastTime = 0, frame = 0;
let trailFrames = [], proceduralSegments = [], previous = [], terrainDirty = true, terrainTime = -1;
let quality = adaptiveQualityState();
let hudHadContent = false, gpuMetrics = { vertexCount:0, triangleCount:0, drawCalls:0 };
const usesGpuLights = () => gpuLights.available && key !== 'breakthrough';
function clearTrails() { trailFrames = []; proceduralSegments = []; previous = []; }
function saveView() {
  const url=new URL(location.href);
  url.searchParams.set('variant',key);url.searchParams.set('altitude',String(target));url.searchParams.set('paused',running?'0':'1');
  history.replaceState({},'',url);
}
function load(src) { return new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = src; }); }
function syncControls() {
  $('#convergence-controls').hidden=key!=='breakthrough';
  $('#convergence').value=Math.round(convergence*100);$('#convergence-value').value=Math.round(convergence*100)+'%';
  $('#cone-height').value=Math.round(coneHeight*100);$('#cone-height-value').value=Math.round(coneHeight*100)+'%';
  $('#cone-diameter').value=Math.round(coneDiameter*100);$('#cone-diameter-value').value=Math.round(coneDiameter*100)+'%';
  document.querySelectorAll('[data-convergence]').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.convergence)===convergence)));
  $('#object-description').textContent=key==='breakthrough'?'돌파 · 작은 삼각형마다 자동 채움과 배색':key==='liftoff'?'이륙 · 지상 유도등과 고도에 따른 오브젝트':'침투 · 이전 발광 면에 자동 배색';
  $('#object-current').textContent=key==='breakthrough'?'삼각형 · 면의 흔적':key==='liftoff'?'유도등 · 노란색 고정':'발광 면 · 색상 혼합';
  $('#secondary-frequency').value=Math.round(secondary*100);$('#secondary-value').value=Math.round(secondary*100)+'%';
  for(const tier of ['primary','secondary']){
    const percent=Math.round((tier==='primary'?1-secondary:secondary)*100);
    $('#palette-'+tier+'-label').textContent=(tier==='primary'?'Primary ':'Secondary ')+percent+'%';
    const swatches=$('#palette-'+tier+'-colors');swatches.setAttribute('aria-label',palettes[key][tier].label);
    if(swatches.dataset.palette!==key){swatches.dataset.palette=key;swatches.replaceChildren();
      for(const color of palettes[key][tier].colors){const chip=document.createElement('span');chip.style.backgroundColor='rgb('+color.join(',')+')';chip.setAttribute('aria-hidden','true');swatches.append(chip);}
    }
  }
  $('#object-size').value=Math.round(scale*100);$('#object-size-value').value=`${Math.round(scale*100)}%`;
  document.documentElement.style.setProperty('--accent', scene.accent);
  document.querySelectorAll('button[data-variant]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.variant === key)));
  $('#scene-en').textContent = `${scene.number} / ${scene.english}`;
  $('#scene-name').textContent = scene.name;
  $('#scene-description').textContent = key === 'breakthrough' && heights === 'mixed' ? '지면 · 눈높이 · 머리 위로 스쳐 가는 빛' : scene.description;
  $('#height-controls').hidden = key !== 'breakthrough';
  document.querySelectorAll('button[data-height]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.height === heights)));
  document.querySelectorAll('button[data-shape]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.shape === shape)));
  $('#layout-controls').hidden = key !== 'breakthrough';
  document.querySelectorAll('button[data-layout]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.layout === layout)));
  $('#scene-stamp').textContent = `${key === 'liftoff' ? 'OPEN HORIZON' : key === 'infiltration' ? 'DESCENDING VIEW' : 'LOW FLIGHT'} / ${afterglow ? 'AFTERGLOW ON' : 'AFTERGLOW OFF'}`;
  $('#pause').textContent = running ? '일시정지' : '재생';
  $('#stage-pause').textContent = running ? '일시정지' : '재생';
  $('#afterglow').textContent = afterglow ? '잔광 켜짐' : '잔광 꺼짐'; $('#afterglow').setAttribute('aria-pressed', String(afterglow));
  $('#lanes').textContent = showLanes ? '레인 숨기기' : '레인 보이기'; $('#lanes').setAttribute('aria-pressed', String(showLanes));
  $('#emission').textContent = emission ? '광원 켜짐' : '광원 꺼짐'; $('#emission').setAttribute('aria-pressed', String(emission));
  $('#speed').value = Math.round(speed * 100); $('#speed-value').value = `${Math.round(speed * 100)}%`;
  $('#altitude').value = Math.round(target * 100); $('#altitude-value').value = `${Math.round(target * 100)}%`;
  $('#altitude').disabled = key === 'breakthrough'; $('#altitude-label').textContent = key === 'breakthrough' ? '비행 고도 · 저공 유지' : '비행 고도';
  for (const [id, direction] of [['descend', -1], ['ascend', 1]]) { $(`#${id}`).disabled = key === 'breakthrough'; $(`#${id}`).setAttribute('aria-pressed', String(automatic === direction)); }
  $('#duration').value = Math.round(duration * 1000); $('#duration-value').value = `${Math.round(duration * 1000)} ms`;
  $('#hint').textContent = key === 'infiltration' ? '「천천히 하강」을 누르면 지평선이 올라가고, 시선이 지면 쪽으로 기울어요. 잔광도 껐다 켜 보세요.' : key === 'liftoff' ? '고도 25%까지는 지면의 유도등만 켜져요. 25~65%에서 다른 오브젝트 조명이 서서히 돌아옵니다. 하늘은 고도가 높을수록 밝아지며 95%에서 기존 최대 밝기가 됩니다. 유도등은 노란색 고정이며 보조색·다시 섞기는 다른 오브젝트에만 적용돼요.' : heights === 'mixed' ? '눈높이의 빛은 옆으로, 높은 빛은 위로 스쳐 갑니다. 「지면만」과 바꿔 보거나 레인을 숨기고 비교해 보세요.' : '기존 지면 중심의 돌파 시연입니다. 「높이 혼합」으로 높이가 다른 빛의 흐름과 비교해 보세요.';
  $('#shape-hint').textContent = shape === 'surface' ? (key==='breakthrough'?'돌파에만 정삼각형 채움을 사용합니다.':'기존의 간단한 발광 면을 사용합니다.') : '가는 광원과 면 광원을 비교합니다.';
  $('#layout-hint').textContent = layout === 'flow' ? '멀리 모인 빛이 가까워지며 사방으로 벌어집니다.' : '앞선 시연의 일정한 줄과 정면을 보는 면 배치입니다.';
}
function choose(next) {
  key = scenarioKey(next); scene = scenarios[key]; lights = makeLights(key, heights, layout); rgb = scene.rgb.split(',').map(Number);
  target = altitude = scene.altitude; duration = scene.duration;
  automatic = 0; travel = 130; emission = true; clearTrails(); terrainDirty = true;
  const url = new URL(location.href); url.searchParams.set('variant', key); history.replaceState({}, '', url);
  writePaletteUrl();saveView();syncControls();
}
document.querySelectorAll('button[data-variant]').forEach(button => button.addEventListener('click', () => choose(button.dataset.variant)));
function writePaletteUrl(){
  const url=new URL(location.href);url.searchParams.set('seed',String(seed));url.searchParams.set('scale',String(scale));url.searchParams.set('shape',shape);url.searchParams.set('secondary',String(secondary));
  url.searchParams.set('convergence',String(convergence));
  url.searchParams.set('coneHeight',String(coneHeight));url.searchParams.set('coneDiameter',String(coneDiameter));url.searchParams.set('speed',String(speed));
  for(const name of ['fill','mask','family','object'])url.searchParams.delete(name);
  history.replaceState({},'',url);
}
function updateObjects(){shape='surface';clearTrails();writePaletteUrl();syncControls();}
$('#reshuffle').addEventListener('click',()=>{
  const next=crypto.getRandomValues(new Uint32Array(1))[0];seed=next===seed?(seed+1)>>>0:next;updateObjects();
});
$('#object-size').addEventListener('input',event=>{scale=objectScale(Number(event.target.value)/100);updateObjects();});
$('#secondary-frequency').addEventListener('input',event=>{secondary=secondaryRatio(Number(event.target.value)/100,key);updateObjects();});
$('#convergence').addEventListener('input',event=>{convergence=convergenceStrength(Number(event.target.value)/100);updateObjects();});
$('#cone-height').addEventListener('input',event=>{coneHeight=coneDimension(Number(event.target.value)/100);updateObjects();});
$('#cone-diameter').addEventListener('input',event=>{coneDiameter=coneDimension(Number(event.target.value)/100);updateObjects();});
$('#cone-reset').addEventListener('click',()=>{convergence=.85;coneHeight=1;coneDiameter=1;updateObjects();});
document.querySelectorAll('[data-convergence]').forEach(button=>button.addEventListener('click',()=>{convergence=Number(button.dataset.convergence);updateObjects();}));
document.querySelectorAll('button[data-height]').forEach(button => button.addEventListener('click', () => {
  heights = heightMode(button.dataset.height); lights = makeLights(key, heights, layout); clearTrails(); terrainDirty = true;
  const url = new URL(location.href); url.searchParams.set('height', heights); history.replaceState({}, '', url); syncControls();
}));
document.querySelectorAll('button[data-layout]').forEach(button => button.addEventListener('click', () => {
  layout = layoutMode(button.dataset.layout); lights = makeLights(key,heights,layout); clearTrails();
  const url = new URL(location.href);url.searchParams.set('layout',layout);history.replaceState({},'',url);syncControls();
}));
document.querySelectorAll('button[data-shape]').forEach(button => button.addEventListener('click', () => {
  shape = shapeMode(button.dataset.shape); clearTrails();
  const url = new URL(location.href); url.searchParams.set('shape',shape); history.replaceState({},'',url); syncControls();
}));
$('#pause').addEventListener('click', () => { running = !running; lastTime = 0; saveView();syncControls(); });
$('#stage-pause').addEventListener('click',()=>$('#pause').click());
$('.controls').append($('.object-dock'));
$('#afterglow').addEventListener('click', () => { afterglow = !afterglow; clearTrails(); syncControls(); });
$('#lanes').addEventListener('click', () => { showLanes = !showLanes; const url=new URL(location.href);url.searchParams.set('lanes',showLanes?'1':'0');history.replaceState({},'',url);syncControls(); });
$('#emission').addEventListener('click', () => { emission = !emission; previous = []; syncControls(); });
$('#reset').addEventListener('click', () => { afterglow = true; speed = 1; choose(key); });
$('#speed').addEventListener('input', event => { speed = speedMultiplier(Number(event.target.value) / 100); writePaletteUrl();syncControls(); });
$('#duration').addEventListener('input', event => { duration = Number(event.target.value) / 1000; syncControls(); });
$('#altitude').addEventListener('input', event => { target = Number(event.target.value) / 100; automatic = 0; if (!running) { altitude = target; clearTrails(); terrainDirty = true; } saveView();syncControls(); });
for (const [id, direction] of [['descend', -1], ['ascend', 1]]) $(`#${id}`).addEventListener('click', () => { automatic = automatic === direction ? 0 : direction; running = true; syncControls(); });
const controlPanel=setupControlPanel(document.body,$('#settings-toggle'),$('#controls'));
function sceneOnly(on) {
  document.body.classList.toggle('scene-only',on);
  controlPanel.reset();
  $('#fullscreen').textContent=on?'닫기':'화면만 보기';resize();
}
$('#fullscreen').addEventListener('click',()=>sceneOnly(!document.body.classList.contains('scene-only')));
document.addEventListener('keydown',event=>{if(event.key==='Escape')sceneOnly(false);});
document.addEventListener('visibilitychange', () => { lastTime = 0; clearTrails(); });

function resize() {
  width = Math.max(1, canvas.clientWidth); height = Math.max(1, canvas.clientHeight);
  syncCanvasResolution();
  terrain = document.createElement('canvas'); terrain.width = Math.ceil(width); terrain.height = Math.ceil(height);
  terrainCtx = terrain.getContext('2d', { alpha: false });
  if (ground) pattern = terrainCtx.createPattern(ground, 'repeat');
  clearTrails(); terrainDirty = true;
}
function syncCanvasResolution() {
  const dpr=renderPixelRatio(devicePixelRatio,quality.name),pixelWidth=Math.round(width*dpr),pixelHeight=Math.round(height*dpr);
  if(canvas.width!==pixelWidth)canvas.width=pixelWidth;
  if(canvas.height!==pixelHeight)canvas.height=pixelHeight;
  if(hudCanvas.width!==pixelWidth)hudCanvas.width=pixelWidth;
  if(hudCanvas.height!==pixelHeight)hudCanvas.height=pixelHeight;
  ctx.setTransform(dpr,0,0,dpr,0,0);hudCtx.setTransform(dpr,0,0,dpr,0,0);
  gpuLights.resize(width,height,dpr);canvas.dataset.renderPixelRatio=String(dpr);
}
new ResizeObserver(resize).observe(canvas);

function drawTerrain(view) {
  // 지면은 30fps, 광원과 레인은 화면의 갱신 빈도로 그린다.
  if (!terrainDirty && time - terrainTime < 1 / 30) {
    if (!usesGpuLights()) ctx.drawImage(terrain, 0, 0, width, height);
    return;
  }
  terrainTime = time; terrainDirty = false;
  const c = terrainCtx;
  c.fillStyle = scene.backdrop; c.fillRect(0, 0, width, height);
  const groundStart = Math.max(0, view.horizon);
  if (view.horizon > 0 && view.showSky) {
    const sky = skies.get(skyAsset(key));
    const skyHeight = height * .40;
    c.globalAlpha = .82; c.drawImage(sky, 0, 0, sky.width, sky.height, 0, view.horizon - skyHeight, width, skyHeight + 2); c.globalAlpha = 1;
    const glow = c.createLinearGradient(0, view.horizon - 12, 0, view.horizon + 30);
    glow.addColorStop(0, `rgba(${scene.rgb},0)`); glow.addColorStop(.30, `rgba(${scene.rgb},.13)`); glow.addColorStop(1, `rgba(${scene.rgb},0)`);
    c.fillStyle = glow; c.fillRect(0, view.horizon - 12, width, 42);
  }
  if(!usesGpuLights()){
    for (let y = Math.ceil(groundStart); y < height; y += 2) {
      const sampleY = y + 1, z = depthAtRow(sampleY, view);
      if (z === null) continue;
      const depth = z * view.cosPitch + view.cameraHeight * view.sinPitch;
      const scale = view.focal / depth * 180 / ground.width;
      const rayDown = view.sinPitch + (sampleY - view.principalY) / view.focal * view.cosPitch;
      const texY = (((z + travel) * ground.width / 180) % ground.height + ground.height) % ground.height;
      const verticalScale = -scale * rayDown;
      pattern.setTransform(new DOMMatrix([scale, 0, 0, verticalScale, width / 2 - ground.width * scale / 2, sampleY - texY * verticalScale]));
      c.globalAlpha = Math.min(.56, (y - view.horizon) / 100); c.fillStyle = pattern; c.fillRect(0, y, width, 2);
    }
    c.globalAlpha = 1;
    const fade = c.createLinearGradient(0, groundStart, 0, height);
    fade.addColorStop(0, 'rgba(3,7,13,.16)'); fade.addColorStop(.60, 'rgba(3,7,13,.06)'); fade.addColorStop(1, 'rgba(1,4,9,.22)');
    c.fillStyle = fade; c.fillRect(0, groundStart, width, height - groundStart);
  }
  if(key==='liftoff')dimSky(c,view);
  if(!usesGpuLights()&&key==='liftoff'){
    const points=runwayGround(view);
    if(points.length){c.save();c.beginPath();points.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();c.fillStyle='rgba(3,9,16,'+liftoffLighting(altitude).ground+')';c.fill();c.restore();}
  }
  ctx.drawImage(terrain, 0, 0, width, height);
}
const trailPaths=new WeakMap();
function surfaceTrailPath(batch){
  let path=trailPaths.get(batch);if(path)return path;path=new Path2D();
  for(const points of batch.surfaces){
    const area=points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p.x*q.y-q.x*p.y;},0);
    const ordered=area<0?[...points].reverse():points;
    ordered.forEach((p,i)=>i?path.lineTo(p.x,p.y):path.moveTo(p.x,p.y));path.closePath();
  }
  trailPaths.set(batch,path);return path;
}
function drawTrails() {
  ctx.save();ctx.lineCap='butt';
  for(const sample of trailFrames){
    if(sample.segments[0]?.surface){
      for(const batch of surfaceTrailBatches(sample)){
        const opacity=surfaceTrailOpacity(time-batch.time,duration,batch.interval,scene.strength)*batch.alpha;
        if(opacity<=0)continue;
        ctx.globalAlpha=opacity;ctx.fillStyle='rgb('+(batch.rgb??rgb).join(',')+')';ctx.fill(surfaceTrailPath(batch));
      }
      continue;
    }
    const fade=trailOpacity(time-sample.time,duration)*scene.strength;if(fade<.004)continue;
    for(const segment of sample.segments){
      ctx.globalAlpha=fade*segment.alpha;ctx.strokeStyle='rgb('+(segment.rgb??rgb).join(',')+')';ctx.lineWidth=segment.size;
      ctx.beginPath();ctx.moveTo(segment.x1,segment.y1);ctx.lineTo(segment.x2,segment.y2);ctx.stroke();
      ctx.globalAlpha*=.16;ctx.lineWidth=segment.size*3;ctx.stroke();
    }
  }
  ctx.restore();
}
function drawProceduralTrails(segments, qualityName) {
  const batches = new Map();
  for (const segment of segments) {
    const color = (segment.rgb ?? rgb).join(',');
    const style=proceduralTrailBatchStyle(segment),key=`${color}/${style.width}/${style.alpha}`;
    if (!batches.has(key)) batches.set(key, { color, ...style, path: new Path2D() });
    const batch=batches.get(key);
    const path = batch.path;
    path.moveTo(segment.x1, segment.y1); path.lineTo(segment.x2, segment.y2);
  }
  ctx.save(); ctx.lineCap = 'butt';
  const glowAlpha=proceduralTrailGlowAlpha(qualityName);
  for (const batch of batches.values()) {
    ctx.strokeStyle = `rgb(${batch.color})`; ctx.globalAlpha = batch.alpha * scene.strength; ctx.lineWidth = batch.width; ctx.stroke(batch.path);
    if(glowAlpha>0){ctx.globalAlpha *= glowAlpha; ctx.lineWidth = batch.width * 3; ctx.stroke(batch.path);}
  }
  ctx.restore();
}
function drawFarLights(current) {
  const batches=new Map();
  for(const light of current){
    if(light.lod!=='point')continue;
    const color=(light.rgb??rgb).join(','),alpha=Math.max(.1,Math.round(light.alpha*5)/5);
    const size=Math.max(.5,Math.round(light.size*2)/2),key=`${color}/${alpha}/${size}`;
    if(!batches.has(key))batches.set(key,{color,alpha,core:new Path2D(),glow:new Path2D()});
    const batch=batches.get(key),half=size/2,glow=size*1.8;
    batch.core.rect(light.x-half,light.y-half,size,size);
    batch.glow.rect(light.x-glow/2,light.y-glow/2,glow,glow);
  }
  ctx.save();
  for(const batch of batches.values()){
    ctx.fillStyle=`rgb(${batch.color})`;ctx.globalAlpha=batch.alpha*.12;ctx.fill(batch.glow);
    ctx.globalAlpha=batch.alpha*.78;ctx.fill(batch.core);
  }
  ctx.restore();
}
function drawLights(current) {
  drawFarLights(current);
  ctx.save(); ctx.lineCap = 'round';
  for (const light of current) {
    if(light.lod==='point')continue;
    const { a, b, size, alpha, kind } = light;
    if (light.surface) {
      const points = light.surface;
      // 작은 면의 색을 유지한다. 색 경계에 별도의 선·내부 광택을 그리지 않는다.
      ctx.beginPath(); points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y)); ctx.closePath();
      if(!light.rgb){ctx.strokeStyle = `rgb(${scene.rgb})`; ctx.globalAlpha = alpha * .12; ctx.lineWidth = 3; ctx.stroke();}
      if(light.guide){ctx.shadowColor='rgb('+light.rgb.join(',')+')';ctx.shadowBlur=Math.min(8,size*2);}
      ctx.fillStyle = faceColor(light.rgb??rgb,alpha); ctx.globalAlpha = 1; ctx.fill();
      ctx.shadowBlur=0;
      continue;
    }
    if (kind === 'vertical') {
      // 어두운 지지대와 얇은 발광 면을 그리고 밝은 중심을 남긴다.
      ctx.strokeStyle = '#122433'; ctx.lineWidth = Math.min(9, size * 5); ctx.globalAlpha = alpha;
      ctx.beginPath(); ctx.moveTo(a.x, a.y + 2); ctx.lineTo(b.x, b.y - 2); ctx.stroke();
    }
    ctx.strokeStyle = `rgb(${scene.rgb})`; ctx.fillStyle = `rgb(${scene.rgb})`;
    ctx.globalAlpha = alpha * .15;
    if (kind === 'point') { ctx.fillRect(a.x - size * 3, a.y - size, size * 6, size * 2); }
    else { ctx.lineWidth = size * 4; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    ctx.globalAlpha = alpha * .72;
    if (kind === 'point') { ctx.fillRect(a.x - size * 1.4, a.y - size * .40, size * 2.8, Math.max(.8, size * .8)); }
    else { ctx.lineWidth = Math.max(.7, size * 1.15); ctx.stroke(); }
    ctx.fillStyle = scene.core; ctx.strokeStyle = scene.core; ctx.globalAlpha = alpha * .90;
    if (kind === 'point') { ctx.fillRect(a.x - size * .58, a.y - .4, size * 1.16, .8); }
    else { ctx.lineWidth = Math.max(.45, size * .40); ctx.stroke(); }
  }
  ctx.restore();
}
function polygon(points, fill, stroke, c=ctx) {
  c.beginPath(); points.forEach(([x,y], i) => i ? c.lineTo(x,y) : c.moveTo(x,y)); c.closePath();
  c.fillStyle = fill; c.fill(); if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1; c.stroke(); }
}

function drawLanes() {
  if (!showLanes) {
    if(hudHadContent){hudCtx.clearRect(0,0,width,height);hudHadContent=false;}
    return;
  }
  hudCtx.clearRect(0,0,width,height);hudHadContent=true;
  const c=hudCtx;
  const lane = laneAt(width, height), left = lane.left, right = left + lane.width, unit = lane.width / 4;
  c.fillStyle = 'rgba(2,5,10,.96)'; c.fillRect(left, lane.top, lane.width, lane.hit - lane.top + 38);
  for (const side of [-1, 1]) {
    const edge = side < 0 ? left : right;
    polygon([[edge, lane.top], [edge + side * 13, lane.top + 9], [edge + side * 13, lane.hit + 33], [edge, lane.hit + 23]], '#0d1a2a', '#324859',c);
    for (let y = lane.top + 35; y < lane.hit - 20; y += 86) {
      polygon([[edge + side * 2, y], [edge + side * 11, y - 9], [edge + side * 11, y + 22], [edge + side * 2, y + 32]], '#16283a', '#354a5c',c);
      c.strokeStyle = '#458dad'; c.beginPath(); c.moveTo(edge + side * 3,y); c.lineTo(edge + side * 3,y+13); c.stroke();
    }
  }
  c.lineWidth = .7;
  for (let i = 0; i <= 4; i++) { c.strokeStyle = i === 0 || i === 4 ? '#4c7189' : '#253849'; c.beginPath(); c.moveTo(left + i * unit, lane.top); c.lineTo(left + i * unit, lane.hit); c.stroke(); }
  c.save(); c.beginPath(); c.rect(left, lane.top + 32, lane.width, lane.hit - lane.top - 32); c.clip();
  for (let i = 0; i < 10; i++) {
    const y = lane.top + 32 + ((noteTime * lane.noteSpeed + i * 97) % (lane.hit - lane.top - 32));
    const x = left + ((i * 3 + Math.floor(i / 4)) % 4) * unit + 5, w = unit - 10, cut = Math.min(5, w / 7);
    polygon([[x+cut,y],[x+w-cut,y],[x+w,y+4],[x+w-cut,y+8],[x+cut,y+8],[x,y+4]], '#d4effa', '#72bbdc',c);
  }
  c.restore();
  c.strokeStyle = '#a4e4ff'; c.lineWidth = 2; c.beginPath(); c.moveTo(left-4,lane.hit); c.lineTo(right+4,lane.hit); c.stroke();
  for (let i = 0; i < 4; i++) {
    const x = left+i*unit+3, w=unit-6, y=lane.hit+9;
    polygon([[x+4,y],[x+w-4,y],[x+w,y+22],[x,y+22]], '#172c43', '#577791',c);
  }
  c.fillStyle = '#b6d8e9'; c.font = 'italic 600 14px system-ui'; c.textAlign = 'center'; c.fillText('not4k',width/2,lane.top+22);
}

function render(now) {
  const frameMs=lastTime?now-lastTime:0;
  const dt = document.hidden ? 0 : Math.min(.05, Math.max(0, frameMs / 1000)); lastTime = now;
  if(key!=='breakthrough'&&!document.hidden&&frameMs>0){
    const previousQuality=quality.name;quality=advanceAdaptiveQuality(quality,frameMs);
    if(previousQuality!==quality.name)syncCanvasResolution();
  }
  if (running) {
    time += dt; noteTime += dt; travel += dt * scene.speed * speed;
    if (automatic) {
      target = Math.min(.95, Math.max(.03, target + automatic * dt * .08));
      if (target <= .03 || target >= .95) automatic = 0;
      syncControls();
    }
    altitude = stepAltitude(altitude, target, dt);
  }
  const view = cameraAt(key, altitude, width, height, speed, heights);
  const lightQuality=usesGpuLights()?'gpu':quality.name;
  const profile=renderQualityProfile(lightQuality);
  const objects = emission ? visibleLights(lights, travel, view, shape, {palette:key,scenario:key,seed,scale,secondary,convergence,coneHeight,coneDiameter,
    ...(key==='breakthrough'?{}:{quality:lightQuality})}) : [];
  const guides = key==='liftoff'&&emission ? visibleRunwayLights(travel,view,undefined,lightQuality) : [];
  const current = key==='liftoff' ? [...liftoffObjectLights(objects,altitude),...guides] : objects;
  if (running && dt > 0) {
    if (key !== 'breakthrough') {
      trailFrames = []; previous = [];
      proceduralSegments = afterglow ? proceduralTrailSegments(current, view, { altitude, maxSegments:profile.maxTrailSegments }) : [];
    } else {
      proceduralSegments = [];
      trailFrames = !afterglow?[]:shape==='surface'?advanceSurfaceTrails(trailFrames,previous,current,time,duration,dt):advanceTrails(trailFrames,previous,current,time,duration);
      previous = current;
    }
  } else if (key !== 'breakthrough') {
    proceduralSegments = [];
  }
  drawTerrain(view);
  if(usesGpuLights()){
    gpuMetrics=gpuLights.draw({lights:current,trails:afterglow?proceduralSegments:[],rgb,core:hexRgb(scene.core),trailStrength:scene.strength,trailGlowAlpha:proceduralTrailGlowAlpha(lightQuality),
      ground:{view,travel,backdrop:hexRgb(scene.backdrop),runwayAlpha:key==='liftoff'?liftoffLighting(altitude).ground:0}});
  }else{
    gpuLights.clear();gpuMetrics={vertexCount:0,triangleCount:0,drawCalls:0};
    if (afterglow) key !== 'breakthrough' ? drawProceduralTrails(proceduralSegments,quality.name) : drawTrails();
    drawLights(current);
  }
  drawLanes();
  if (frame++ % 6 === 0) {
    Object.assign(canvas.dataset, {
      ready: 'true', variant: key, altitude: altitude.toFixed(3), pitch: view.pitchDegrees.toFixed(2), horizon: view.horizon.toFixed(2),
      travel: travel.toFixed(3), time: time.toFixed(3), noteTime: noteTime.toFixed(3), noteSpeed: laneAt(width, height).noteSpeed.toFixed(2),
      visibleLights: String(current.length), topLights: String(current.filter(p => p.y >= 0 && p.y < height * .18).length),
      guideLights:String(guides.length), otherLights:String(current.length-guides.length),
      liftoffObjectStrength:String(key==='liftoff'?liftoffLighting(altitude).objects:1),
      verticalLights:String(current.filter(p=>p.kind==='vertical').length),
      trailFrames: String(key !== 'breakthrough' ? 0 : trailFrames.length), trailSegments: String(key !== 'breakthrough' ? proceduralSegments.length : trailFrames.reduce((sum, sample) => sum + sample.segments.length, 0)),
      trailStrength:String(key !== 'breakthrough' ? proceduralTrailStrength(altitude) : 0),
      topFlow: flowAtRow(0, view).toFixed(2), running: String(running), afterglow: String(afterglow),
      heights, sky: String(view.showSky && view.horizon > 0), skyBrightness:String(key==='liftoff'?skyBrightness(altitude):1),
      shape, surfaceLights: String(current.filter(p=>p.surface).length),
      layout,
      convergence:String(convergence), convergenceActive:String(key==='breakthrough'&&shape==='surface'), lanes:String(showLanes),
      coneHeight:String(coneHeight), coneDiameter:String(coneDiameter), speed:String(speed),
      geometry:objectKind(key), trailMode:key !== 'breakthrough'?'altitude':shape==='surface'?'surface':'line', secondary:String(secondary), primarySurfaces:String(current.filter(p=>p.tier==='primary').length), secondarySurfaces:String(current.filter(p=>p.tier==='secondary').length), fill:key==='breakthrough'?'all':'panel', mask:'mixed', seed:String(seed), palette:key, colorCount:String(new Set(current.map(p=>p.rgb?.join(','))).size), coloredSurfaces:String(current.filter(p=>p.rgb).length), objectScale:String(scale), objectCount:String(new Set(current.map(p=>p.objectId??p.id)).size),
      qualityProfile:quality.name,lightQualityProfile:lightQuality,lightRenderer:usesGpuLights()?'webgl-batch':'canvas-2d',trailBudget:String(key!=='breakthrough'?profile.maxTrailSegments:0),
      gpuVertices:String(gpuMetrics.vertexCount),gpuTriangles:String(gpuMetrics.triangleCount),gpuDrawCalls:String(gpuMetrics.drawCalls),
      detailedLights:String(current.filter(p=>p.lod!=='point').length),pointLights:String(current.filter(p=>p.lod==='point').length),
      raisedLights: String(current.filter(p => p.layer === 'raised').length), eyeLights: String(current.filter(p => p.layer === 'eye').length),
      overheadLights: String(current.filter(p => p.layer === 'overhead').length),
    });
  }
  requestAnimationFrame(render);
}
writePaletteUrl();
saveView();
syncControls();
try {
  const activeSkyPath = skyAsset(key);
  const [loadedGround, loadedSky] = await Promise.all([load('./ground.png'), load(activeSkyPath)]);
  ground = loadedGround;
  gpuLights.setGround(ground);
  skies = new Map([[activeSkyPath, loadedSky]]);
  resize(); $('#loading').hidden = true; requestAnimationFrame(render);
} catch { document.body.dataset.error = 'assets'; $('#loading').textContent = '배경을 불러오지 못했습니다. 페이지를 새로고침해 주세요.'; }
