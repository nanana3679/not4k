import { Container, Rectangle, Sprite, Texture, TilingSprite } from "pixi.js";
import type { ExplicitCompiledChart } from "../judgment/explicitCompiledChart";
import type { ExplicitJudgmentSnapshot } from "../judgment/ExplicitJudgmentState";
import type { ExplicitSkinTextures } from "../skin/ExplicitSkinLoader";
import { getExplicitSkinAsset } from "../skin/explicitSkin";
import { ExplicitNotePresenter } from "./ExplicitNotePresenter";
import type { ExplicitPresentedNote, ExplicitRenderLayout } from "./ExplicitNotePresenter";

/** 기본 GameRenderer를 바꾸지 않는 별도 Pixi 표시 경로. parent와 텍스처의 소유자는 호출자다. */
export class ExplicitNoteRenderer {
  readonly root = new Container();
  private readonly layers = { body: new Container(), release: new Container(), sustain: new Container(), point: new Container() };
  private readonly spritesByKey = new Map<string, Sprite | TilingSprite>();
  private readonly croppedTexturesById = new Map<string, Texture>();
  private presenter: ExplicitNotePresenter | null = null;
  private disposed = false;

  constructor(parent: Container, private readonly skin: ExplicitSkinTextures, private layout: ExplicitRenderLayout) {
    this.root.label = "explicit-notes";
    for (const [name, layer] of Object.entries(this.layers)) {
      layer.label = `explicit-${name}`;
      this.root.addChild(layer);
    }
    parent.addChild(this.root);
  }

  setChart(chart: ExplicitCompiledChart): void {
    this.assertOpen();
    const presenter = new ExplicitNotePresenter(chart, this.skin.view);
    this.clear();
    this.presenter = presenter;
  }

  resize(layout: ExplicitRenderLayout): void {
    this.assertOpen();
    this.layout = layout;
  }

  render(snapshot: ExplicitJudgmentSnapshot, visualTimeMs = snapshot.atMs): readonly ExplicitPresentedNote[] {
    this.assertOpen();
    if (!this.presenter) throw new Error("ExplicitNoteRenderer: no compiled chart");
    const notes = this.presenter.present(snapshot, this.layout, visualTimeMs);
    const visibleKeys = new Set<string>();
    for (const note of notes) for (const model of note.layers) {
      if (!model.visible || !model.inViewport) continue;
      visibleKeys.add(model.key);
      const original = this.skin.getTexture(model.assetId);
      let texture = original;
      if (model.crop) {
        const cropId = `${model.assetId}:${model.crop}`;
        let cropped = this.croppedTexturesById.get(cropId);
        if (!cropped) {
          const frame = original.frame;
          cropped = new Texture({ source: original.source, frame: new Rectangle(
            frame.x + (model.crop === "right" ? frame.width / 2 : 0), frame.y, frame.width / 2, frame.height) });
          this.croppedTexturesById.set(cropId, cropped);
        }
        texture = cropped;
      }
      let sprite = this.spritesByKey.get(model.key);
      if (!sprite) {
        sprite = model.layer === "body" ? new TilingSprite({ texture }) : new Sprite(texture);
        sprite.label = model.key;
        this.spritesByKey.set(model.key, sprite);
      }
      // 상태 전환으로 Point 절반이 새로 생겨도 Grace와 각 원본의 순서를 매 프레임 보존한다.
      this.layers[model.layer].addChild(sprite);
      sprite.texture = texture;
      sprite.position.set(model.x, model.y);
      sprite.width = model.width;
      sprite.height = model.height;
      sprite.alpha = model.alpha;
      if (sprite instanceof TilingSprite) {
        const metadata = getExplicitSkinAsset(this.skin.view, model.assetId);
        // Texture의 resolution/원본 픽셀 수와 무관하게 같은 논리 200×40 타일을 반복한다.
        sprite.tileScale.set(model.tileScaleX * metadata.logicalSize.width / texture.width,
          model.tileScaleY * metadata.logicalSize.height / texture.height);
        sprite.tilePosition.set(0, 0);
      }
    }
    for (const [key, sprite] of this.spritesByKey) if (!visibleKeys.has(key)) {
      sprite.destroy({ texture: false, textureSource: false });
      this.spritesByKey.delete(key);
    }
    return notes;
  }

  /** 완료·화면 밖 Sprite는 즉시 반환하므로 pool 크기는 현재 표시 수를 넘지 않는다. */
  get pooledSpriteCount(): number { return this.spritesByKey.size; }

  dispose(): void {
    if (this.disposed) return;
    this.clear();
    for (const texture of this.croppedTexturesById.values()) texture.destroy(false);
    this.croppedTexturesById.clear();
    this.root.destroy({ children: true });
    this.presenter = null;
    this.disposed = true;
  }

  private clear(): void {
    for (const sprite of this.spritesByKey.values()) sprite.destroy({ texture: false, textureSource: false });
    this.spritesByKey.clear();
  }

  private assertOpen(): void { if (this.disposed) throw new Error("ExplicitNoteRenderer is disposed"); }
}
