import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Container, Sprite, TilingSprite } from 'pixi.js';
import { ExplicitNoteRenderer } from './ExplicitNoteRenderer';
import { beat } from '../../shared';

const calls = vi.hoisted(() => ({ ids: [] as string[], dispose: vi.fn() }));
vi.mock('../../game/skin/ExplicitSkinLoader', async () => {
  const { Texture } = await import('pixi.js');
  const { buildExplicitSkinView } = await import('../../game/skin/explicitSkin');
  return { ExplicitSkinLoader: class {
    view = buildExplicitSkinView();
    async load() {}
    getTexture(id: string) { calls.ids.push(id); return Texture.EMPTY; }
    dispose() { calls.dispose(); }
  } };
});

describe('에디터 명시 도안 배치', () => {
  beforeEach(() => { calls.ids.length = 0; calls.dispose.mockClear(); });

  it('릴리즈 없는 양수 바디는 실제 시작～끝 반복 타일 하나만 그리고 시작·끝 노트를 합성하지 않는다', async () => {
    const renderer = new ExplicitNoteRenderer(); await renderer.load();
    const bodyLayer = new Container(); const noteLayer = new Container();
    renderer.render({ type: 'body', holdCount: 2, lane: 1, beat: beat(0), endBeat: beat(4) }, 0, 60, 500, 100, bodyLayer, noteLayer, false);
    expect(calls.ids).toEqual(['body.double.idle']);
    expect(bodyLayer.children).toHaveLength(1); expect(noteLayer.children).toHaveLength(0);
    const tile = bodyLayer.children[0] as TilingSprite;
    expect(tile).toBeInstanceOf(TilingSprite); expect(tile.y).toBe(100); expect(tile.height).toBe(400);
    renderer.dispose(); expect(calls.dispose).toHaveBeenCalledTimes(1);
  });

  it('Grace 더블 릴리즈는 pending 도안 하나와 별도 외곽을 같은 중심에 그린다', async () => {
    const renderer = new ExplicitNoteRenderer(); await renderer.load();
    const layer = new Container();
    renderer.render({ type: 'release', count: 2, grace: true, lane: 7, beat: beat(2) }, 360, 60, 300, 300, new Container(), layer, false);
    expect(calls.ids).toEqual(['release.double.pending', 'graceOverlay.release.overlay']);
    expect(layer.children).toHaveLength(2);
    const [base, grace] = layer.children as Sprite[];
    expect([base.x, base.y, grace.x, grace.y]).toEqual([390, 300, 390, 300]);
    expect(grace.width).toBeGreaterThan(base.width); expect(grace.height).toBeGreaterThan(base.height);
    renderer.dispose();
  });

  it('더블 유지는 좌·우 표식 도안 둘을 같은 캔버스 중심에 놓으며 다음 렌더에서 Sprite를 재사용한다', async () => {
    const renderer = new ExplicitNoteRenderer(); await renderer.load();
    const layer = new Container(); const body = new Container();
    const note = { type: 'sustain' as const, count: 2 as const, lane: 1, beat: beat(2) };
    renderer.render(note, 0, 60, 300, 300, body, layer, false);
    const original = [...layer.children];
    expect(calls.ids).toEqual(['sustain.double.pending.left', 'sustain.double.pending.right']);
    layer.removeChildren(); renderer.beginRender();
    renderer.render(note, 0, 60, 200, 200, body, layer, false);
    expect(layer.children).toEqual(original); expect(layer.children.map(child => child.y)).toEqual([200, 200]);
    renderer.dispose();
  });

  it('길이 0 바디는 Point보다 큰 18px 영역을 그리고 명시 Point 도안을 덧붙이지 않는다', async () => {
    const renderer = new ExplicitNoteRenderer(); await renderer.load();
    const body = new Container(); const notes = new Container();
    renderer.render({ type: 'body', holdCount: 1, lane: 1, beat: beat(2), endBeat: beat(2) }, 0, 60, 300, 300, body, notes, false);
    expect(body.children[0].height).toBe(18); expect(body.children[0].y).toBe(291); expect(notes.children).toHaveLength(0);
    renderer.dispose();
  });
});
