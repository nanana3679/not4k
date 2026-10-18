import { proceduralTrailAlpha, proceduralTrailWidth } from './procedural-trails.mjs';
import { hypot2 } from './hypot.mjs';

// 게임은 매 프레임 수천 개 정점을 쓰므로 정점 기록 경로는 배열·객체를 새로 만들지 않고 typed array에 바로 쓴다.
const FLOATS_PER_VERTEX = 6;
const clamp01 = value => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const safeRgb = (value, fallback) => Array.isArray(value) && value.length >= 3 ? value : fallback;
const WHITE = Object.freeze([255, 255, 255]);
const VERTICAL_SHADOW = Object.freeze([18, 36, 51]);
const DEFAULT_BACKDROP = Object.freeze([4, 11, 20]);
const NO_LIGHTS = Object.freeze([]);

export function hexRgb(value) {
  const match = /^#([\da-f]{6})$/i.exec(value ?? '');
  return match ? [0, 2, 4].map(offset => Number.parseInt(match[1].slice(offset, offset + 2), 16)) : [255, 255, 255];
}

// rect·line·유도등 번짐의 꼭짓점 작업 공간. 정점 기록 함수에는 실수 대신 이 객체를 넘긴다.
const corners = [{ x:0, y:0 }, { x:0, y:0 }, { x:0, y:0 }, { x:0, y:0 }];
const lineEnds = { x1:0, y1:0, x2:0, y2:0 };

export class LightVertexBatch {
  constructor(vertexCapacity = 4096) {
    this.data = new Float32Array(Math.max(3, vertexCapacity) * FLOATS_PER_VERTEX);
    this.vertexCount = 0;
    // 이후 기록할 정점의 정규화 색. 도형마다 한 번 정하고 그 도형의 모든 정점에 쓴다.
    this.r = 0; this.g = 0; this.b = 0; this.a = 0;
    // writeSegment가 쓸 선 굵기·밝기와 writeLightFrame의 잔광 강도. 실수를 함수 인자로 넘기지 않으려고 필드로 둔다.
    this.lineWidth = 0; this.lineAlpha = 0; this.trailStrength = 1; this.trailGlowAlpha = 0;
  }

  reset() { this.vertexCount = 0; }

  reserve(additionalVertices) {
    const required = (this.vertexCount + additionalVertices) * FLOATS_PER_VERTEX;
    if (required <= this.data.length) return;
    const next = new Float32Array(2 ** Math.ceil(Math.log2(required)));
    next.set(this.data.subarray(0, this.vertexCount * FLOATS_PER_VERTEX));
    this.data = next;
  }

  vertex(x, y, rgb, alpha) {
    this.reserve(1);
    this.color(rgb, alpha);
    const data = this.data, offset = this.vertexCount++ * FLOATS_PER_VERTEX;
    data[offset] = x;
    data[offset + 1] = y;
    data[offset + 2] = this.r;
    data[offset + 3] = this.g;
    data[offset + 4] = this.b;
    data[offset + 5] = this.a;
  }

  // vertex와 같은 clamp 규칙으로 이후 정점의 색을 정한다.
  color(rgb, alpha) {
    this.channels(rgb);
    this.a = clamp01(alpha);
  }

  channels(rgb) {
    this.r = clamp01(rgb[0] / 255); this.g = clamp01(rgb[1] / 255); this.b = clamp01(rgb[2] / 255);
  }

  // 현재 색으로 꼭짓점 p·q·s의 삼각형을 쓴다. 꼭짓점을 {x,y} 객체로 받아 data에 바로 기록한다.
  // (매 정점 실수를 함수 인자로 넘기면 V8이 숫자를 boxing해 프레임마다 수만 개의 객체가 생긴다.)
  writeTriangle(p, q, s) {
    this.reserve(3);
    const data = this.data, r = this.r, g = this.g, b = this.b, a = this.a;
    let offset = this.vertexCount * FLOATS_PER_VERTEX;
    this.vertexCount += 3;
    data[offset] = p.x; data[offset + 1] = p.y; data[offset + 2] = r; data[offset + 3] = g; data[offset + 4] = b; data[offset + 5] = a;
    offset += FLOATS_PER_VERTEX;
    data[offset] = q.x; data[offset + 1] = q.y; data[offset + 2] = r; data[offset + 3] = g; data[offset + 4] = b; data[offset + 5] = a;
    offset += FLOATS_PER_VERTEX;
    data[offset] = s.x; data[offset + 1] = s.y; data[offset + 2] = r; data[offset + 3] = g; data[offset + 4] = b; data[offset + 5] = a;
  }

  triangle(a, b, c, rgb, alpha) {
    this.color(rgb, alpha);
    this.writeTriangle(a, b, c);
  }

  polygon(points, rgb, alpha) {
    if (!points || points.length < 3 || alpha <= 0) return;
    this.color(rgb, alpha);
    this.writePolygon(points);
  }

  // 현재 색으로 points를 첫 꼭짓점 기준 부채꼴 삼각형으로 쓴다.
  writePolygon(points) {
    const first = points[0];
    for (let index = 1; index < points.length - 1; index++) this.writeTriangle(first, points[index], points[index + 1]);
  }

  rect(x, y, width, height, rgb, alpha) {
    if (!(width > 0) || !(height > 0) || alpha <= 0) return;
    this.color(rgb, alpha);
    const a = corners[0], b = corners[1], c = corners[2], d = corners[3];
    a.x = x; a.y = y; b.x = x + width; b.y = y; c.x = x + width; c.y = y + height; d.x = x; d.y = y + height;
    this.writeTriangle(a, b, c); this.writeTriangle(a, c, d);
  }

  line(x1, y1, x2, y2, width, rgb, alpha) {
    lineEnds.x1 = x1; lineEnds.y1 = y1; lineEnds.x2 = x2; lineEnds.y2 = y2;
    this.segment(lineEnds, width, rgb, alpha);
  }

  // 끝점 객체 {x1,y1,x2,y2}를 굵기 width의 사각형(삼각형 둘)으로 쓴다. line과 같은 계산이다.
  segment(ends, width, rgb, alpha) {
    this.channels(rgb);
    this.lineWidth = width; this.lineAlpha = alpha;
    this.writeSegment(ends);
  }

  // 지금 색 채널과 lineWidth·lineAlpha 필드로 선분을 쓴다. 길이·굵기·밝기가 0이면 쓰지 않는다.
  writeSegment(ends) {
    const width = this.lineWidth, alpha = this.lineAlpha;
    const x1 = ends.x1, y1 = ends.y1, x2 = ends.x2, y2 = ends.y2;
    const dx = x2 - x1, dy = y2 - y1, length = hypot2(dx, dy);
    if (!(length > .001) || !(width > 0) || alpha <= 0) return;
    this.a = clamp01(alpha);
    const ox = -dy / length * width / 2, oy = dx / length * width / 2;
    const a = corners[0], b = corners[1], c = corners[2], d = corners[3];
    a.x = x1 + ox; a.y = y1 + oy; b.x = x1 - ox; b.y = y1 - oy;
    c.x = x2 - ox; c.y = y2 - oy; d.x = x2 + ox; d.y = y2 + oy;
    this.writeTriangle(a, b, c); this.writeTriangle(a, c, d);
  }

  view() { return this.data.subarray(0, this.vertexCount * FLOATS_PER_VERTEX); }
}

// 유도등 바깥 번짐: 꼭짓점을 면 중심에서 pixels만큼 밀어낸 다각형. 밀어낸 꼭짓점은 재사용 객체에 쓴다.
const scaledPoints = [];
function writeGuideGlow(batch, light, color, alpha) {
  const points = light.surface, count = points.length;
  if (count < 3 || alpha <= 0) return;
  const pixels = Math.min(5, Math.max(1, light.size * 1.5));
  let centerX = 0, centerY = 0;
  for (let i = 0; i < count; i++) { centerX = centerX + points[i].x; centerY = centerY + points[i].y; }
  centerX /= count; centerY /= count;
  for (let i = 0; i < count; i++) {
    const point = points[i], scaled = scaledPoints[i] ?? (scaledPoints[i] = { x:0, y:0 });
    const dx = point.x - centerX, dy = point.y - centerY, distance = hypot2(dx, dy) || 1;
    scaled.x = point.x + dx / distance * pixels;
    scaled.y = point.y + dy / distance * pixels;
  }
  batch.color(color, alpha);
  const first = scaledPoints[0];
  for (let i = 1; i < count - 1; i++) batch.writeTriangle(first, scaledPoints[i], scaledPoints[i + 1]);
}

// 잔광 선분 하나를 바깥 번짐(굵기 3배)과 본선으로 쓴다. 강도·번짐 밝기는 writeLightFrame이 batch 필드에 둔다.
function writeTrail(batch, segment, fallbackRgb) {
  const width = proceduralTrailWidth(segment.size), alpha = proceduralTrailAlpha(segment.alpha) * batch.trailStrength;
  batch.channels(safeRgb(segment.rgb, fallbackRgb));
  if (batch.trailGlowAlpha > 0) { batch.lineWidth = width * 3; batch.lineAlpha = alpha * batch.trailGlowAlpha; batch.writeSegment(segment); }
  batch.lineWidth = width; batch.lineAlpha = alpha; batch.writeSegment(segment);
}

function writePoint(batch, light, fallbackRgb) {
  const color = safeRgb(light.rgb, fallbackRgb);
  const alpha = Math.max(.1, Math.round(clamp01(light.alpha) * 5) / 5);
  const size = Math.max(.5, Math.round((Number.isFinite(light.size) ? light.size : 1) * 2) / 2);
  batch.rect(light.x - size * .9, light.y - size * .9, size * 1.8, size * 1.8, color, alpha * .12);
  batch.rect(light.x - size / 2, light.y - size / 2, size, size, color, alpha * .78);
}

function writeSurface(batch, light, fallbackRgb) {
  const color = safeRgb(light.rgb, fallbackRgb), alpha = clamp01(light.alpha);
  if (light.guide) writeGuideGlow(batch, light, color, alpha * .09);
  const points = light.surface;
  if (points.length < 3) return;
  // 발광 면 내부는 밝기를 곱한 한 색으로 채운다. 색은 batch 필드에 바로 쓴다.
  const brightness = .90 * clamp01(alpha) ** .75;
  batch.r = clamp01(color[0] * brightness / 255);
  batch.g = clamp01(color[1] * brightness / 255);
  batch.b = clamp01(color[2] * brightness / 255);
  batch.a = 1;
  batch.writePolygon(points);
}

function writeLineLight(batch, light, fallbackRgb, coreRgb) {
  const color = safeRgb(light.rgb, fallbackRgb), alpha = clamp01(light.alpha);
  const a = light.a ?? { x:light.x, y:light.y }, b = light.b ?? a;
  const size = Math.max(.45, Number.isFinite(light.size) ? light.size : 1);
  if (light.kind === 'vertical') batch.line(a.x, a.y + 2, b.x, b.y - 2, Math.min(9, size * 5), VERTICAL_SHADOW, alpha);
  if (light.kind === 'point') {
    batch.rect(a.x - size * 3, a.y - size, size * 6, size * 2, color, alpha * .15);
    batch.rect(a.x - size * 1.4, a.y - size * .4, size * 2.8, Math.max(.8, size * .8), color, alpha * .72);
    batch.rect(a.x - size * .58, a.y - .4, size * 1.16, .8, coreRgb, alpha * .9);
    return;
  }
  batch.line(a.x, a.y, b.x, b.y, size * 4, color, alpha * .15);
  batch.line(a.x, a.y, b.x, b.y, Math.max(.7, size * 1.15), color, alpha * .72);
  batch.line(a.x, a.y, b.x, b.y, Math.max(.45, size * .4), coreRgb, alpha * .9);
}

export function writeLightFrame(batch, options = {}) {
  batch.reset();
  const lights = options.lights ?? NO_LIGHTS, trails = options.trails ?? NO_LIGHTS;
  const rgb = safeRgb(options.rgb, WHITE), core = safeRgb(options.core, WHITE);
  batch.trailStrength = clamp01(options.trailStrength ?? 1); batch.trailGlowAlpha = clamp01(options.trailGlowAlpha ?? .13);
  for (let i = 0; i < trails.length; i++) writeTrail(batch, trails[i], rgb);
  for (let i = 0; i < lights.length; i++) if (lights[i].lod === 'point') writePoint(batch, lights[i], rgb);
  for (let i = 0; i < lights.length; i++) {
    const light = lights[i];
    if (light.lod === 'point') continue;
    if (light.surface) writeSurface(batch, light, rgb);
    else writeLineLight(batch, light, rgb, core);
  }
  return { vertexCount:batch.vertexCount, triangleCount:batch.vertexCount / 3, lightCount:lights.length, trailCount:trails.length };
}

function shader(gl, type, source) {
  const value = gl.createShader(type); gl.shaderSource(value, source); gl.compileShader(value);
  if (!gl.getShaderParameter(value, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(value) || 'shader compile failed');
  return value;
}

function program(gl) {
  const value = gl.createProgram();
  gl.attachShader(value, shader(gl, gl.VERTEX_SHADER, `
    attribute vec2 position; attribute vec4 tint; uniform vec2 resolution; varying vec4 color;
    void main(){vec2 clip=position/resolution*2.0-1.0;gl_Position=vec4(clip.x,-clip.y,0.0,1.0);color=tint;}
  `));
  gl.attachShader(value, shader(gl, gl.FRAGMENT_SHADER, `
    precision mediump float; varying vec4 color; void main(){gl_FragColor=color;}
  `));
  gl.linkProgram(value);
  if (!gl.getProgramParameter(value, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(value) || 'program link failed');
  return value;
}

function groundProgram(gl) {
  const value = gl.createProgram();
  gl.attachShader(value, shader(gl, gl.VERTEX_SHADER, `
    attribute vec2 clipPosition; void main(){gl_Position=vec4(clipPosition,0.0,1.0);}
  `));
  gl.attachShader(value, shader(gl, gl.FRAGMENT_SHADER, `
    precision highp float;
    uniform sampler2D groundTexture;
    uniform vec2 resolution,textureSize;
    uniform float pixelRatio,focal,principalY,horizon,cameraHeight,sinPitch,cosPitch,travel,runwayAlpha;
    uniform vec3 backdrop;
    void main(){
      float x=gl_FragCoord.x/pixelRatio,y=resolution.y-gl_FragCoord.y/pixelRatio;
      float groundStart=max(0.0,horizon);
      if(y<groundStart)discard;
      float rayY=(y-principalY)/focal,rayDown=sinPitch+rayY*cosPitch;
      if(rayDown<=0.0)discard;
      float z=cameraHeight*(cosPitch-rayY*sinPitch)/rayDown;
      float depth=z*cosPitch+cameraHeight*sinPitch;
      float scale=focal/depth*180.0/textureSize.x;
      float u=((x-resolution.x*.5)/scale+textureSize.x*.5)/textureSize.x;
      float v=(z+travel)*textureSize.x/(180.0*textureSize.y);
      vec3 textureColor=texture2D(groundTexture,vec2(fract(u),fract(v))).rgb;
      float patternAlpha=clamp((y-horizon)/100.0,0.0,.56);
      vec3 color=mix(backdrop,textureColor,patternAlpha);
      float t=clamp((y-groundStart)/max(1.0,resolution.y-groundStart),0.0,1.0);
      float fadeAlpha=t<.6?mix(.16,.06,t/.6):mix(.06,.22,(t-.6)/.4);
      vec3 fadeColor=t<.6?vec3(3.0,7.0,13.0)/255.0:mix(vec3(3.0,7.0,13.0),vec3(1.0,4.0,9.0),(t-.6)/.4)/255.0;
      color=mix(color,fadeColor,fadeAlpha);
      float worldX=(x-resolution.x*.5)*depth/focal;
      if(runwayAlpha>0.0&&abs(worldX)<=83.0&&z>=0.0&&z<=2448.0)color=mix(color,vec3(3.0,9.0,16.0)/255.0,runwayAlpha);
      gl_FragColor=vec4(color,1.0);
    }
  `));
  gl.linkProgram(value);
  if (!gl.getProgramParameter(value, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(value) || 'ground program link failed');
  return value;
}

export function createGpuLightLayer(canvas) {
  let gl, gpuProgram, terrainProgram, buffers, batch, terrainBuffer;
  try {
    gl = canvas.getContext('webgl', { alpha:true, antialias:true, depth:false, stencil:false, premultipliedAlpha:false, powerPreference:'high-performance' });
    if (!gl) throw new Error('WebGL unavailable');
    gpuProgram = program(gl);terrainProgram=groundProgram(gl);buffers=[gl.createBuffer(),gl.createBuffer()];batch=new LightVertexBatch(32768);terrainBuffer=gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER,terrainBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
  } catch {
    canvas.hidden = true;
    canvas.dataset.renderer = 'canvas-2d';
    return { available:false, dispose(){}, resize(){}, setGround(){}, clear(){}, draw(){ return { vertexCount:0, triangleCount:0, lightCount:0, trailCount:0, drawCalls:0 }; } };
  }
  const position = gl.getAttribLocation(gpuProgram, 'position'), tint = gl.getAttribLocation(gpuProgram, 'tint');
  const resolution = gl.getUniformLocation(gpuProgram, 'resolution'), allocated = [0, 0];
  const terrainClip=gl.getAttribLocation(terrainProgram,'clipPosition');
  const terrainUniforms=Object.fromEntries(['groundTexture','resolution','textureSize','pixelRatio','focal','principalY','horizon','cameraHeight','sinPitch','cosPitch','travel','runwayAlpha','backdrop'].map(name=>[name,gl.getUniformLocation(terrainProgram,name)]));
  let bufferIndex = 0, width = 1, height = 1, pixelRatio = 1, lost = false, groundTexture, groundSize=[1,1];
  canvas.dataset.renderer = 'webgl-batch';
  const onContextLost = event => { event.preventDefault(); lost = true; canvas.hidden = true; };
  canvas.addEventListener('webglcontextlost', onContextLost);
  function resize(nextWidth, nextHeight, dpr = 1) {
    width = Math.max(1, nextWidth); height = Math.max(1, nextHeight);
    pixelRatio = Math.max(.5,dpr);
    const pixelWidth = Math.max(1, Math.round(width * dpr)), pixelHeight = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    gl.viewport(0, 0, pixelWidth, pixelHeight);
  }
  function setGround(image) {
    groundTexture=groundTexture??gl.createTexture();groundSize=[image.naturalWidth??image.width,image.naturalHeight??image.height];
    gl.bindTexture(gl.TEXTURE_2D,groundTexture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,image);
  }
  function clear() { if (!lost) { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); } }
  function drawGround(options) {
    if(!groundTexture||!options)return 0;
    const view=options.view,backdropRgb=safeRgb(options.backdrop,DEFAULT_BACKDROP),u=terrainUniforms;
    gl.useProgram(terrainProgram);gl.bindBuffer(gl.ARRAY_BUFFER,terrainBuffer);gl.disable(gl.BLEND);
    gl.enableVertexAttribArray(terrainClip);gl.vertexAttribPointer(terrainClip,2,gl.FLOAT,false,0,0);
    gl.uniform2f(u.resolution,width,height);gl.uniform2f(u.textureSize,groundSize[0],groundSize[1]);gl.uniform1f(u.pixelRatio,pixelRatio);gl.uniform1f(u.focal,view.focal);gl.uniform1f(u.principalY,view.principalY);
    gl.uniform1f(u.horizon,view.horizon);gl.uniform1f(u.cameraHeight,view.cameraHeight);gl.uniform1f(u.sinPitch,view.sinPitch);gl.uniform1f(u.cosPitch,view.cosPitch);gl.uniform1f(u.travel,options.travel);
    gl.uniform1f(u.runwayAlpha,options.runwayAlpha??0);gl.uniform3f(u.backdrop,backdropRgb[0]/255,backdropRgb[1]/255,backdropRgb[2]/255);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,groundTexture);gl.uniform1i(terrainUniforms.groundTexture,0);gl.drawArrays(gl.TRIANGLES,0,3);return 1;
  }
  function draw(options) {
    if (lost) return { vertexCount:0, triangleCount:0, lightCount:0, trailCount:0, drawCalls:0 };
    const metrics = writeLightFrame(batch, options); clear();const groundCalls=drawGround(options.ground);
    if (!metrics.vertexCount) { metrics.drawCalls = groundCalls; return metrics; }
    bufferIndex = (bufferIndex + 1) % buffers.length;
    gl.useProgram(gpuProgram); gl.bindBuffer(gl.ARRAY_BUFFER, buffers[bufferIndex]);
    if (allocated[bufferIndex] < batch.data.byteLength) {
      allocated[bufferIndex] = batch.data.byteLength;
      gl.bufferData(gl.ARRAY_BUFFER, allocated[bufferIndex], gl.DYNAMIC_DRAW);
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, batch.view());
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, FLOATS_PER_VERTEX * 4, 0);
    gl.enableVertexAttribArray(tint); gl.vertexAttribPointer(tint, 4, gl.FLOAT, false, FLOATS_PER_VERTEX * 4, 2 * 4);
    gl.uniform2f(resolution, width, height); gl.drawArrays(gl.TRIANGLES, 0, metrics.vertexCount);
    const drawCalls=groundCalls+1;
    canvas.dataset.vertices=String(metrics.vertexCount);canvas.dataset.triangles=String(metrics.triangleCount);canvas.dataset.drawCalls=String(drawCalls);
    metrics.drawCalls = drawCalls;
    return metrics;
  }
  function dispose() {
    if (disposed) return;
    disposed = true; lost = true;
    canvas.removeEventListener('webglcontextlost', onContextLost);
    for (const buffer of buffers) gl.deleteBuffer(buffer);
    gl.deleteBuffer(terrainBuffer);
    gl.deleteProgram(gpuProgram); gl.deleteProgram(terrainProgram);
    if (groundTexture) gl.deleteTexture(groundTexture);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
  let disposed = false;
  return { get available(){return !lost;}, resize, setGround, clear, draw, dispose };
}
