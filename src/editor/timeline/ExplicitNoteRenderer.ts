import { Graphics, Sprite, TilingSprite } from 'pixi.js';
import type { Container } from 'pixi.js';
import type { ExplicitNoteEntity } from '../../shared';
import { getExplicitSkinAsset } from '../../game/skin/explicitSkin';
import { ExplicitSkinLoader } from '../../game/skin/ExplicitSkinLoader';
import type { ExplicitSkinAssetId } from '../../game/skin/explicitSkin';
import { NOTE_HEIGHT, COLORS } from './constants';

/** 승인된 도안을 편집 좌표에 놓는다. 바디에 시작·끝 점수 노트를 덧그리지 않는다. */
export class ExplicitNoteRenderer {
  private readonly loader = new ExplicitSkinLoader();
  private get skin() { return this.loader.view; }
  private readonly sprites: Sprite[] = [];
  private readonly bodies: TilingSprite[] = [];
  private readonly outlines: Graphics[] = [];
  private spriteIndex = 0;
  private bodyIndex = 0;
  private outlineIndex = 0;

  async load(): Promise<void> {
    await this.loader.load({ resolution: 1 });
  }

  beginRender(): void {
    this.spriteIndex = this.bodyIndex = this.outlineIndex = 0;
  }

  render(note: ExplicitNoteEntity, laneX: number, laneWidth: number, startY: number, endY: number,
    bodyLayer: Container, noteLayer: Container, selected: boolean): void {
    const scale = Math.min(NOTE_HEIGHT * 5 / 212, laneWidth * 0.9 / 212);
    const centerX = laneX + laneWidth / 2;
    const sprite = (id: ExplicitSkinAssetId) => {
      const texture = this.loader.getTexture(id);
      const graphic = this.sprites[this.spriteIndex] ?? new Sprite(texture);
      this.sprites[this.spriteIndex++] = graphic;
      graphic.texture = texture;
      graphic.anchor.set(0.5);
      graphic.position.set(centerX, startY);
      const asset = getExplicitSkinAsset(this.skin, id);
      graphic.width = asset.logicalSize.width * scale;
      graphic.height = asset.logicalSize.height * scale;
      noteLayer.addChild(graphic);
    };

    if (note.type === 'body') {
      const id = `body.${note.trill ? 'trill' : note.holdCount === 2 ? 'double' : 'single'}.idle` as ExplicitSkinAssetId;
      const texture = this.loader.getTexture(id);
      const width = this.skin.body.tileSize.width * scale;
      const height = startY === endY ? NOTE_HEIGHT * 1.5 : Math.abs(endY - startY);
      const top = startY === endY ? startY - height / 2 : Math.min(startY, endY);
      const graphic = this.bodies[this.bodyIndex] ?? new TilingSprite({ texture, width, height });
      this.bodies[this.bodyIndex++] = graphic;
      graphic.texture = texture;
      graphic.position.set(centerX - width / 2, top);
      graphic.width = width;
      graphic.height = height;
      graphic.tileScale.set(scale);
      bodyLayer.addChild(graphic);
      if (selected) this.outline(bodyLayer, centerX - width / 2, top, width, height);
      return;
    }
    if (note.type === 'tap') sprite(`tap.${note.kind}.pending`);
    else if (note.type === 'release') sprite(`release.${note.count === 2 ? 'double' : 'single'}.pending`);
    else if (note.count === 1) sprite('tick.single.pending');
    else {
      sprite('tick.double.pending.left');
      sprite('tick.double.pending.right');
    }
    if ('grace' in note && note.grace) sprite(`graceOverlay.${note.type === 'release' ? 'release' : note.type === 'tap' && note.kind === 'trill' ? 'trill' : 'tap'}.overlay`);
    if (selected) this.outline(noteLayer, centerX - 106 * scale, startY - 20 * scale, 212 * scale, 40 * scale);
  }

  private outline(layer: Container, x: number, y: number, width: number, height: number): void {
    const graphic = this.outlines[this.outlineIndex] ?? new Graphics();
    this.outlines[this.outlineIndex++] = graphic;
    graphic.clear().rect(x, y, width, height).stroke({ color: COLORS.SELECTED_OUTLINE, width: 2 });
    layer.addChild(graphic);
  }

  dispose(): void {
    for (const item of [...this.sprites, ...this.bodies, ...this.outlines]) if (!item.destroyed) item.destroy();
    this.sprites.length = this.bodies.length = this.outlines.length = 0;
    this.loader.dispose();
  }
}
