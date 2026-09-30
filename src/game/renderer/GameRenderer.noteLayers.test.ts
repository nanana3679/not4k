import { describe, expect, it, vi } from 'vitest';
import { Application, Container, Mesh, Sprite, Texture } from 'pixi.js';
import { GameRenderer } from './GameRenderer';
import { GameNoteRenderer } from './GameNoteRenderer';
import type { SkinManager } from '../skin';
import { beat, createChartTiming, type ChartEvent } from '../../shared';
import { body, point } from '../judgment/noteJudgmentTestHarness';

describe('GameRenderer 포인트와 바디·터미널 겹침', () => {
  it('트릴 하단 그림자는 같은100px 너비에서 꼭짓점보다6px 아래까지 은은하게 퍼지고 프레임마다 재사용된다', () => {
    const noteLayer = new Container();
    const skinManager = {
      getTheme: () => ({ pointShadow: { offsetY: 19.6, height: 3.2 } }),
      hasTexture: () => true,
      getTexture: () => Texture.WHITE,
    } as unknown as SkinManager;
    const renderer = new GameNoteRenderer(new Container(), new Container(), new Container(), noteLayer, skinManager, 500, 1000, 0, 600);
    renderer.renderPointNote(point(100, 'trill'), 0, 100, 0);
    const shadow = noteLayer.children[0] as Mesh;
    const pointSprite = noteLayer.children[1] as Sprite;
    expect(shadow).toBeInstanceOf(Mesh);
    const bounds = shadow.getBounds();
    expect(bounds.minX).toBe(pointSprite.x);
    expect(bounds.maxX).toBe(pointSprite.x + pointSprite.width);
    expect(bounds.minY).toBeCloseTo(pointSprite.y + 9.6);
    expect(bounds.maxY).toBeCloseTo(pointSprite.y + pointSprite.height + 6);
    expect(shadow.alpha).toBe(.75);

    noteLayer.removeChildren();
    renderer.renderPointNote(point(100, 'trill'), 0, 100, 10);
    expect(noteLayer.children[0]).toBe(shadow);
    expect(shadow.y).toBe(410);
    renderer.renderPointNote(point(200, 'trill'), 1, 200, 10);
    expect((noteLayer.children[2] as Mesh).geometry).toBe(shadow.geometry);
    const destroyGeometry = vi.spyOn(shadow.geometry, 'destroy');
    renderer.dispose();
    renderer.dispose();
    expect(destroyGeometry).toHaveBeenCalledTimes(1);
    noteLayer.destroy({ children: true });
  });

  it.each(['single', 'double', 'trill'] as const)(
    '%s 포인트를 롱노트보다 먼저/나중에 처리해도 실제 Pixi 장면에서 포인트가 바디·시작·끝 캡 위에 놓인다',
    async type => {
      const textures = new Map<string, Texture>();
      const skinManager = {
        getTheme: () => ({ bg: 0, longNoteTerminalMode: 'full-height' }),
        hasTexture: () => false,
        getTexture: (key: string) => {
          if (!textures.has(key)) textures.set(key, new Texture({ source: Texture.WHITE.source }));
          return textures.get(key)!;
        },
      } as unknown as SkinManager;
      const renderer = new GameRenderer({
        canvas: {} as HTMLCanvasElement, width: 400, height: 600, skinManager,
        showGearFrame: false, showFlightBackground: false,
      });
      const scene = renderer as unknown as {
        app: Application; noteLayer: Container; longNoteBodyLayer: Container; longNoteEndLayer: Container;
        longNoteHeadLayer: Container; buildKeyBeams(): void;
      };
      // GPU 초기화만 생략하고 실제 Container/Sprite와 init/renderFrame을 사용한다.
      vi.spyOn(scene.app, 'init').mockResolvedValue(undefined);
      vi.spyOn(scene, 'buildKeyBeams').mockImplementation(() => {});
      await renderer.init();
      scene.app.renderer = {} as Application['renderer'];
      vi.spyOn(scene.app, 'render').mockImplementation(() => {});
      const events: ChartEvent[] = [{ type: 'bpm', beat: beat(0), bpm: 120 }];
      const rangeType = type === 'double' ? 'doubleLong' : 'long';
      const notes = [point(1, type), body(0, 1, rangeType), body(1, 2, rangeType)];

      for (const ordered of [notes, [...notes].reverse()]) {
        const timing = createChartTiming({ notes: ordered, events, trillZones: [], meta: { offsetMs: 0 } });
        renderer.setChart(ordered, [], [], events, timing);
        renderer.renderFrame(300);

        const sprite = scene.noteLayer.children[0] as Sprite;
        const caps = [...scene.longNoteEndLayer.children, ...scene.longNoteHeadLayer.children] as Sprite[];
        const pointBounds = sprite.getBounds();
        const overlapsPoint = (part: Sprite) => {
          const bounds = part.getBounds();
          return bounds.minY < pointBounds.maxY && bounds.maxY > pointBounds.minY;
        };
        const overlappingCaps = caps.filter(overlapsPoint);
        const overlappingBodies = (scene.longNoteBodyLayer.children as Sprite[]).filter(overlapsPoint);
        expect(overlappingCaps.length).toBeGreaterThanOrEqual(2);
        expect(overlappingBodies).toHaveLength(2);
        expect(sprite.texture).toBe(textures.get(type === 'trill' ? 'noteTrill' : type === 'double' ? 'noteDouble' : 'noteSingle'));
        for (const part of [...overlappingCaps, ...overlappingBodies]) {
          expect(scene.app.stage.getChildIndex(scene.noteLayer)).toBeGreaterThan(scene.app.stage.getChildIndex(part.parent!));
        }
      }
      scene.app.stage.destroy({ children: true });
      for (const texture of textures.values()) texture.destroy(false);
    },
  );
});

describe('GameNoteRenderer 싱글·더블 포인트 접촉 그림자', () => {
  const BODY_WIDTH = 100 * 100 / 106;
  function setup(theme: Record<string, unknown>, available: (key: string) => boolean = () => true) {
    const textures = new Map<string, Texture>();
    const noteLayer = new Container();
    const skinManager = {
      getTheme: () => ({ pointNoteOverhangPx: 3, ...theme }),
      hasTexture: available,
      getTexture: (key: string) => {
        if (!textures.has(key)) textures.set(key, new Texture({ source: Texture.WHITE.source }));
        return textures.get(key)!;
      },
    } as unknown as SkinManager;
    const renderer = new GameNoteRenderer(new Container(), new Container(), new Container(), noteLayer, skinManager, 500, 1000, 0, 600);
    return { renderer, noteLayer, texture: (key: string) => skinManager.getTexture(key) };
  }
  const contactTheme = { pointShadow: { offsetY: 19.6, height: 3.2 }, pointContactShadow: { above: 5, below: 5 } };

  it.each(['single', 'double'] as const)('pointContactShadow {above 5, below 5}이면 %s 포인트 위아래 5px에 바디 폭 94.34px 그림자를 포인트 아래 층에 그리고 기존 하단 그림자는 쓰지 않는다', type => {
    const { renderer, noteLayer, texture } = setup(contactTheme);
    renderer.renderPointNote(point(100, type), 0, 100, 0);
    expect(noteLayer.children).toHaveLength(3);
    const [above, below, pointSprite] = noteLayer.children as Sprite[];
    for (const shadow of [above, below]) {
      expect(shadow.texture).toBe(texture('pointContactShadow'));
      const bounds = shadow.getBounds();
      expect(bounds.minX).toBeCloseTo(pointSprite.x + (100 - BODY_WIDTH) / 2);
      expect(bounds.maxX).toBeCloseTo(pointSprite.x + (100 + BODY_WIDTH) / 2);
    }
    expect(above.getBounds().minY).toBeCloseTo(pointSprite.y - 5);
    expect(above.getBounds().maxY).toBeCloseTo(pointSprite.y);
    expect(above.scale.y).toBeLessThan(0);
    expect(below.getBounds().minY).toBeCloseTo(pointSprite.y + 20);
    expect(below.getBounds().maxY).toBeCloseTo(pointSprite.y + 25);
    expect(below.scale.y).toBeGreaterThan(0);
    expect(noteLayer.children.some(child => (child as Sprite).texture === texture('pointShadow'))).toBe(false);

    noteLayer.removeChildren();
    renderer.renderPointNote(point(100, type), 0, 100, 10);
    expect(noteLayer.children[0]).toBe(above);
    expect(noteLayer.children[1]).toBe(below);
    expect(above.getBounds().maxY).toBeCloseTo((noteLayer.children[2] as Sprite).y);
    renderer.dispose();
  });

  it('clearPools 후 같은 인덱스 포인트를 다시 그리면 접촉 그림자 스프라이트를 새로 만든다', () => {
    const { renderer, noteLayer } = setup(contactTheme);
    renderer.renderPointNote(point(100, 'single'), 0, 100, 0);
    const [above, below] = noteLayer.children;
    noteLayer.removeChildren();
    renderer.clearPools();
    renderer.renderPointNote(point(100, 'single'), 0, 100, 0);
    expect(noteLayer.children[0]).not.toBe(above);
    expect(noteLayer.children[1]).not.toBe(below);
    renderer.dispose();
  });

  it('pointContactShadow가 있어도 트릴 포인트는 기존 마름모 하단 그림자 Mesh를 쓴다', () => {
    const { renderer, noteLayer } = setup(contactTheme);
    renderer.renderPointNote(point(100, 'trill'), 0, 100, 0);
    expect(noteLayer.children).toHaveLength(2);
    expect(noteLayer.children[0]).toBeInstanceOf(Mesh);
    renderer.dispose();
  });

  it('pointContactShadow가 없는 기존 스킨의 싱글 포인트는 바로 아래 19.6px에서 3.2px 높이의 기존 그림자 하나만 그린다', () => {
    const { renderer, noteLayer, texture } = setup({ pointShadow: { offsetY: 19.6, height: 3.2 } });
    renderer.renderPointNote(point(100, 'single'), 0, 100, 0);
    expect(noteLayer.children).toHaveLength(2);
    const [shadow, pointSprite] = noteLayer.children as Sprite[];
    expect(shadow.texture).toBe(texture('pointShadow'));
    expect(shadow.y).toBeCloseTo(pointSprite.y + 19.6);
    expect(shadow.height).toBeCloseTo(3.2);
    renderer.dispose();
  });

  it('pointContactShadow 설정만 있고 텍스처가 없으면 기존 하단 그림자로 돌아간다', () => {
    const { renderer, noteLayer, texture } = setup(contactTheme, key => key !== 'pointContactShadow');
    renderer.renderPointNote(point(100, 'double'), 0, 100, 0);
    expect(noteLayer.children).toHaveLength(2);
    expect((noteLayer.children[0] as Sprite).texture).toBe(texture('pointShadow'));
    renderer.dispose();
  });
});
