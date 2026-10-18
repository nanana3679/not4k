// visibleLights의 출력 버퍼. 게임은 같은 버퍼를 매 프레임 넘겨 광원 객체·꼭짓점·경계 객체를 다시 쓴다.
// 버퍼를 넘기지 않은 호출은 새 버퍼를 만들어 쓰므로 이전처럼 매번 독립된 결과를 받는다.
// 재사용한 결과는 다음 호출에서 덮어쓰므로 프레임을 넘겨 보관하지 않는다.

const newPoint = () => ({ x:0, y:0, scale:0, depth:0 });

// 모든 광원 종류가 같은 필드 순서를 갖게 한다. 해당 없는 필드는 undefined로 둔다.
function newVisibleLight() {
  return {
    id:undefined, stableId:undefined, objectId:undefined, mask:undefined, part:undefined, geometry:undefined,
    rgb:undefined, colorIndex:undefined, tier:undefined, guide:undefined, kind:undefined, layer:undefined, elevation:0,
    x:0, y:0, a:null, b:null, base:null, size:0, alpha:0, surface:undefined, bounds:null, lod:undefined,
  };
}

function copyPoint(target, source) {
  target.x = source.x; target.y = source.y; target.scale = source.scale; target.depth = source.depth;
  return target;
}

class LightSlot {
  constructor() {
    this.light = newVisibleLight();
    this.base = newPoint();
    this.a = newPoint();
    this.b = newPoint();
    this.bounds = { left:0, right:0, top:0, bottom:0 };
    // surface는 정확한 길이의 배열이고 points는 줄어들어도 버리지 않는 꼭짓점 객체 보관함이다.
    this.surface = [];
    this.points = [];
  }
}

export class VisibleLightFrame {
  constructor() {
    this.lights = [];
    this.slots = [];
    this.count = 0;
    this.sources = [];
  }

  begin() { this.count = 0; }

  // 원본 광원 index의 캐시 칸. 회차별 ID 문자열과 panel 템플릿을 기억해 매 프레임 WeakMap을 찾지 않는다.
  source(index, light) {
    const source = this.sources[index];
    if (source && source.light === light) return source;
    return (this.sources[index] = { light, cycle:NaN, object:'', panel:'', point:'', templateKey:'', template:null });
  }

  // 다음 광원 슬롯을 꺼내 종류·층·투영 좌표를 채운다. a·b가 base와 같은 투영이면 같은 객체를 가리킨다.
  // elevation·size·alpha 같은 실수 필드는 호출한 쪽이 직접 쓴다.
  next(source, base, a, b) {
    const slot = this.slots[this.count] ?? (this.slots[this.count] = new LightSlot());
    const light = slot.light;
    light.id = undefined; light.stableId = undefined; light.objectId = undefined; light.mask = undefined;
    light.part = undefined; light.geometry = undefined; light.rgb = undefined; light.colorIndex = undefined;
    light.tier = undefined; light.guide = undefined; light.surface = undefined; light.lod = undefined;
    light.kind = source.kind;
    light.layer = source.layer ?? 'ground';
    light.base = copyPoint(slot.base, base);
    light.a = a === base ? light.base : copyPoint(slot.a, a);
    light.b = b === base ? light.base : copyPoint(slot.b, b);
    light.bounds = slot.bounds;
    this.lights[this.count++] = light;
    return slot;
  }

  // ScreenPolygon의 꼭짓점을 슬롯 소유의 {x,y,scale,depth} 객체로 옮기고 그 배열을 돌려준다.
  surface(slot, polygon) {
    const surface = slot.surface, points = slot.points, data = polygon.data;
    for (let i = 0; i < polygon.count; i++) {
      const point = points[i] ?? (points[i] = newPoint());
      point.x = data[i * 4]; point.y = data[i * 4 + 1]; point.scale = data[i * 4 + 2]; point.depth = data[i * 4 + 3];
      surface[i] = point;
    }
    surface.length = polygon.count;
    return surface;
  }

  end() {
    this.lights.length = this.count;
    return this.lights;
  }
}
