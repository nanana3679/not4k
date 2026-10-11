import { describe, expect, it, vi } from 'vitest';
import { Application, Container, Mesh, Sprite, Texture } from 'pixi.js';
import { GameRenderer } from './GameRenderer';
import { GameNoteRenderer } from './GameNoteRenderer';
import type { SkinManager } from '../skin';
import { beat, createChartTiming, type ChartEvent } from '../../shared';
import { body, point } from '../judgment/noteJudgmentTestHarness';

describe('GameRenderer 포인트와 바디·터미널 겹침', () => {
  it('트릴 하단 그림자는 같은62.5px 너비에서 꼭짓점보다3.75px(설계값 6) 아래까지 은은하게 퍼지고 프레임마다 재사용된다', () => {
    const noteLayer = new Container();
    const skinManager = {
      getTheme: () => ({ pointShadow: { offsetY: 19.6, height: 3.2 } }),
      getBodyWidthScale: () => 1,
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
    // 테마 offsetY 19.6·height 3.2(설계 px) × 0.625 → 꼭짓점 12.25, 옆 꼭짓점 6, 아래로 4 퍼짐.
    expect(bounds.minY).toBeCloseTo(pointSprite.y + 6);
    expect(bounds.maxY).toBeCloseTo(pointSprite.y + pointSprite.height + 3.75);
    expect(shadow.alpha).toBe(.75);

    noteLayer.removeChildren();
    renderer.renderPointNote(point(100, 'trill'), 0, 100, 10);
    expect(noteLayer.children[0]).toBe(shadow);
    // 그림자는 포인트 박스 위끝을 따라간다: 노트 가운데 410(#224) − 노트 반 칸 6.25.
    expect(shadow.y).toBe(403.75);
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
        getBodyWidthScale: () => 1,
        hasTexture: () => false,
        getTexture: (key: string) => {
          if (!textures.has(key)) textures.set(key, new Texture({ source: Texture.WHITE.source }));
          return textures.get(key)!;
        },
      } as unknown as SkinManager;
      const renderer = new GameRenderer({
        canvas: {} as HTMLCanvasElement, width: 400, height: 600, skinManager,
        showGear: false, showFlightBackground: false,
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
        // 노트·롱노트 레이어는 모두 레인 내용 컨테이너(laneContentLayer) 안에 있다.
        const laneContent = scene.noteLayer.parent!;
        for (const part of [...overlappingCaps, ...overlappingBodies]) {
          expect(part.parent!.parent).toBe(laneContent);
          expect(laneContent.getChildIndex(scene.noteLayer)).toBeGreaterThan(laneContent.getChildIndex(part.parent!));
        }
      }
      scene.app.stage.destroy({ children: true });
      for (const texture of textures.values()) texture.destroy(false);
    },
  );
});

describe('GameNoteRenderer 포인트 접촉 그림자', () => {
  // 레인 62.5(설계값 100 × 0.625). 테마의 접촉 그림자 5px도 같은 배율로 3.125px이 된다.
  const LANE = 62.5;
  const BODY_WIDTH = LANE * 100 / 106;
  function setup(theme: Record<string, unknown>, available: (key: string) => boolean = () => true) {
    const textures = new Map<string, Texture>();
    const noteLayer = new Container();
    const skinManager = {
      getTheme: () => theme,
      getBodyWidthScale: () => 200 / 212,
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

  it.each(['single', 'double'] as const)('pointContactShadow {above 5, below 5}(설계 px)이면 %s 포인트 위아래 3.125px에 바디 폭 58.96px 그림자를 포인트 아래 층에 그리고 기존 하단 그림자는 쓰지 않는다', type => {
    const { renderer, noteLayer, texture } = setup(contactTheme);
    renderer.renderPointNote(point(100, type), 0, 100, 0);
    expect(noteLayer.children).toHaveLength(3);
    const [above, below, pointSprite] = noteLayer.children as Sprite[];
    for (const shadow of [above, below]) {
      expect(shadow.texture).toBe(texture('pointContactShadow'));
      const bounds = shadow.getBounds();
      expect(bounds.minX).toBeCloseTo(pointSprite.x + (LANE - BODY_WIDTH) / 2);
      expect(bounds.maxX).toBeCloseTo(pointSprite.x + (LANE + BODY_WIDTH) / 2);
    }
    expect(above.getBounds().minY).toBeCloseTo(pointSprite.y - 3.125);
    expect(above.getBounds().maxY).toBeCloseTo(pointSprite.y);
    expect(above.scale.y).toBeLessThan(0);
    expect(below.getBounds().minY).toBeCloseTo(pointSprite.y + 12.5);
    expect(below.getBounds().maxY).toBeCloseTo(pointSprite.y + 15.625);
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

  it('pointContactShadow {above 5, below 5}와 pointContactShadowTrill 텍스처가 있으면 트릴 포인트 위 3.125px부터 아래 3.125px까지 포인트 폭 62.5×18.75 그림자 하나를 포인트 아래 층에 그리고 기존 마름모 하단 그림자 Mesh는 쓰지 않는다', () => {
    const { renderer, noteLayer, texture } = setup(contactTheme);
    renderer.renderPointNote(point(100, 'trill'), 0, 100, 0);
    expect(noteLayer.children).toHaveLength(2);
    const [shadow, pointSprite] = noteLayer.children as Sprite[];
    expect(shadow).not.toBeInstanceOf(Mesh);
    expect(shadow.texture).toBe(texture('pointContactShadowTrill'));
    const bounds = shadow.getBounds();
    expect(bounds.minX).toBeCloseTo(pointSprite.x);
    expect(bounds.maxX).toBeCloseTo(pointSprite.x + LANE);
    expect(bounds.minY).toBeCloseTo(pointSprite.y - 3.125);
    expect(bounds.maxY).toBeCloseTo(pointSprite.y + 15.625);

    noteLayer.removeChildren();
    renderer.renderPointNote(point(100, 'trill'), 0, 100, 10);
    expect(noteLayer.children[0]).toBe(shadow);
    expect(shadow.getBounds().minY).toBeCloseTo((noteLayer.children[1] as Sprite).y - 3.125);
    renderer.dispose();
  });

  it('pointContactShadowTrill 텍스처가 없으면 pointContactShadow가 있어도 트릴 포인트는 기존 마름모 하단 그림자 Mesh를 쓴다', () => {
    const { renderer, noteLayer } = setup(contactTheme, key => key !== 'pointContactShadowTrill');
    renderer.renderPointNote(point(100, 'trill'), 0, 100, 0);
    expect(noteLayer.children).toHaveLength(2);
    expect(noteLayer.children[0]).toBeInstanceOf(Mesh);
    renderer.dispose();
  });

  it('clearPools 후 같은 인덱스 트릴 포인트를 다시 그리면 트릴 접촉 그림자 스프라이트를 새로 만든다', () => {
    const { renderer, noteLayer } = setup(contactTheme);
    renderer.renderPointNote(point(100, 'trill'), 0, 100, 0);
    const [shadow] = noteLayer.children;
    noteLayer.removeChildren();
    renderer.clearPools();
    renderer.renderPointNote(point(100, 'trill'), 0, 100, 0);
    expect(noteLayer.children[0]).not.toBe(shadow);
    renderer.dispose();
  });

  it('pointContactShadow가 없는 기존 스킨의 싱글 포인트는 테마 19.6px·3.2px(설계값) × 0.625 = 바로 아래 12.25px에서 2px 높이의 기존 그림자 하나만 그린다', () => {
    const { renderer, noteLayer, texture } = setup({ pointShadow: { offsetY: 19.6, height: 3.2 } });
    renderer.renderPointNote(point(100, 'single'), 0, 100, 0);
    expect(noteLayer.children).toHaveLength(2);
    const [shadow, pointSprite] = noteLayer.children as Sprite[];
    expect(shadow.texture).toBe(texture('pointShadow'));
    expect(shadow.y).toBeCloseTo(pointSprite.y + 12.25);
    expect(shadow.height).toBeCloseTo(2);
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
