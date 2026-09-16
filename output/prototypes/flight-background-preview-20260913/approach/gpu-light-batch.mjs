import { proceduralTrailBatchStyle } from './procedural-trails.mjs';

const FLOATS_PER_VERTEX = 6;
const clamp01 = value => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const safeRgb = (value, fallback) => Array.isArray(value) && value.length >= 3 ? value : fallback;

export function hexRgb(value) {
  const match = /^#([\da-f]{6})$/i.exec(value ?? '');
  return match ? [0, 2, 4].map(offset => Number.parseInt(match[1].slice(offset, offset + 2), 16)) : [255, 255, 255];
}

export class LightVertexBatch {
  constructor(vertexCapacity = 4096) {
    this.data = new Float32Array(Math.max(3, vertexCapacity) * FLOATS_PER_VERTEX);
    this.vertexCount = 0;
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
    const offset = this.vertexCount++ * FLOATS_PER_VERTEX;
    this.data[offset] = x;
    this.data[offset + 1] = y;
    this.data[offset + 2] = clamp01(rgb[0] / 255);
    this.data[offset + 3] = clamp01(rgb[1] / 255);
    this.data[offset + 4] = clamp01(rgb[2] / 255);
    this.data[offset + 5] = clamp01(alpha);
  }

  triangle(a, b, c, rgb, alpha) {
    this.reserve(3);
    for (const point of [a, b, c]) this.vertex(point.x, point.y, rgb, alpha);
  }

  polygon(points, rgb, alpha) {
    if (!points || points.length < 3 || alpha <= 0) return;
    for (let index = 1; index < points.length - 1; index++) this.triangle(points[0], points[index], points[index + 1], rgb, alpha);
  }

  rect(x, y, width, height, rgb, alpha) {
    if (!(width > 0) || !(height > 0) || alpha <= 0) return;
    const a = { x, y }, b = { x:x + width, y }, c = { x:x + width, y:y + height }, d = { x, y:y + height };
    this.triangle(a, b, c, rgb, alpha); this.triangle(a, c, d, rgb, alpha);
  }

  line(x1, y1, x2, y2, width, rgb, alpha) {
    const dx = x2 - x1, dy = y2 - y1, length = Math.hypot(dx, dy);
    if (!(length > .001) || !(width > 0) || alpha <= 0) return;
    const ox = -dy / length * width / 2, oy = dx / length * width / 2;
    const a = { x:x1 + ox, y:y1 + oy }, b = { x:x1 - ox, y:y1 - oy };
    const c = { x:x2 - ox, y:y2 - oy }, d = { x:x2 + ox, y:y2 + oy };
    this.triangle(a, b, c, rgb, alpha); this.triangle(a, c, d, rgb, alpha);
  }

  view() { return this.data.subarray(0, this.vertexCount * FLOATS_PER_VERTEX); }
}

function scaledPolygon(points, pixels) {
  const center = points.reduce((sum, point) => ({ x:sum.x + point.x, y:sum.y + point.y }), { x:0, y:0 });
  center.x /= points.length; center.y /= points.length;
  return points.map(point => {
    const dx = point.x - center.x, dy = point.y - center.y, distance = Math.hypot(dx, dy) || 1;
    return { x:point.x + dx / distance * pixels, y:point.y + dy / distance * pixels };
  });
}

function surfaceColor(rgb, alpha) {
  const brightness = .90 * clamp01(alpha) ** .75;
  return rgb.map(value => value * brightness);
}

function writeTrail(batch, segment, fallbackRgb, strength, glowAlpha) {
  const color = safeRgb(segment.rgb, fallbackRgb), style = proceduralTrailBatchStyle(segment);
  const alpha = style.alpha * strength;
  if (glowAlpha > 0) batch.line(segment.x1, segment.y1, segment.x2, segment.y2, style.width * 3, color, alpha * glowAlpha);
  batch.line(segment.x1, segment.y1, segment.x2, segment.y2, style.width, color, alpha);
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
  if (light.guide) batch.polygon(scaledPolygon(light.surface, Math.min(5, Math.max(1, light.size * 1.5))), color, alpha * .09);
  batch.polygon(light.surface, surfaceColor(color, alpha), 1);
}

function writeLineLight(batch, light, fallbackRgb, coreRgb) {
  const color = safeRgb(light.rgb, fallbackRgb), alpha = clamp01(light.alpha);
  const a = light.a ?? { x:light.x, y:light.y }, b = light.b ?? a;
  const size = Math.max(.45, Number.isFinite(light.size) ? light.size : 1);
  if (light.kind === 'vertical') batch.line(a.x, a.y + 2, b.x, b.y - 2, Math.min(9, size * 5), [18, 36, 51], alpha);
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
  const lights = options.lights ?? [], trails = options.trails ?? [];
  const rgb = safeRgb(options.rgb, [255, 255, 255]), core = safeRgb(options.core, [255, 255, 255]);
  const strength = clamp01(options.trailStrength ?? 1), glowAlpha = clamp01(options.trailGlowAlpha ?? .13);
  for (const segment of trails) writeTrail(batch, segment, rgb, strength, glowAlpha);
  for (const light of lights) if (light.lod === 'point') writePoint(batch, light, rgb);
  for (const light of lights) {
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
    return { available:false, resize(){}, setGround(){}, clear(){}, draw(){ return { vertexCount:0, triangleCount:0, lightCount:0, trailCount:0, drawCalls:0 }; } };
  }
  const position = gl.getAttribLocation(gpuProgram, 'position'), tint = gl.getAttribLocation(gpuProgram, 'tint');
  const resolution = gl.getUniformLocation(gpuProgram, 'resolution'), allocated = [0, 0];
  const terrainClip=gl.getAttribLocation(terrainProgram,'clipPosition');
  const terrainUniforms=Object.fromEntries(['groundTexture','resolution','textureSize','pixelRatio','focal','principalY','horizon','cameraHeight','sinPitch','cosPitch','travel','runwayAlpha','backdrop'].map(name=>[name,gl.getUniformLocation(terrainProgram,name)]));
  let bufferIndex = 0, width = 1, height = 1, pixelRatio = 1, lost = false, groundTexture, groundSize=[1,1];
  canvas.dataset.renderer = 'webgl-batch';
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); lost = true; canvas.hidden = true; });
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
    const view=options.view,backdropRgb=safeRgb(options.backdrop,[4,11,20]);
    gl.useProgram(terrainProgram);gl.bindBuffer(gl.ARRAY_BUFFER,terrainBuffer);gl.disable(gl.BLEND);
    gl.enableVertexAttribArray(terrainClip);gl.vertexAttribPointer(terrainClip,2,gl.FLOAT,false,0,0);
    const uniform=(name,...values)=>values.length===1?gl.uniform1f(terrainUniforms[name],values[0]):gl.uniform2f(terrainUniforms[name],...values);
    uniform('resolution',width,height);uniform('textureSize',...groundSize);uniform('pixelRatio',pixelRatio);uniform('focal',view.focal);uniform('principalY',view.principalY);
    uniform('horizon',view.horizon);uniform('cameraHeight',view.cameraHeight);uniform('sinPitch',view.sinPitch);uniform('cosPitch',view.cosPitch);uniform('travel',options.travel);
    uniform('runwayAlpha',options.runwayAlpha??0);gl.uniform3f(terrainUniforms.backdrop,...backdropRgb.map(value=>value/255));
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,groundTexture);gl.uniform1i(terrainUniforms.groundTexture,0);gl.drawArrays(gl.TRIANGLES,0,3);return 1;
  }
  function draw(options) {
    if (lost) return { vertexCount:0, triangleCount:0, lightCount:0, trailCount:0, drawCalls:0 };
    const metrics = writeLightFrame(batch, options); clear();const groundCalls=drawGround(options.ground);
    if (!metrics.vertexCount) return { ...metrics, drawCalls:groundCalls };
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
    const drawCalls=groundCalls+1;Object.assign(canvas.dataset,{vertices:String(metrics.vertexCount),triangles:String(metrics.triangleCount),drawCalls:String(drawCalls)});
    return { ...metrics, drawCalls };
  }
  return { get available(){return !lost;}, resize, setGround, clear, draw };
}
