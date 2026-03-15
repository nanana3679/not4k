import { Assets, Texture } from "pixi.js";
import type { SkinManifest, SkinTheme } from "./types";
import { getSkinManifest } from "./skins";

/**
 * 스킨 에셋 로더 + 텍스처 캐시 관리
 *
 * 사용:
 *   const sm = new SkinManager();
 *   await sm.loadSkin("crystal");
 *   const tex = sm.getTexture("noteSingle");
 */
export class SkinManager {
  private manifest: SkinManifest | null = null;
  private textures = new Map<string, { texture: Texture; path: string }>();
  private bombTextures: Texture[] = [];
  private loaded = false;

  /** 현재 로드된 스킨 ID */
  get skinId(): string | null {
    return this.manifest?.theme.id ?? null;
  }

  /** 스킨의 모든 에셋을 로드 */
  async loadSkin(skinId: string): Promise<void> {
    // 같은 스킨이면 스킵
    if (this.loaded && this.manifest?.theme.id === skinId) return;

    // 기존 텍스처 해제
    this.dispose();

    const manifest = getSkinManifest(skinId);
    this.manifest = manifest;

    const { assets } = manifest;

    // 개별 에셋 로드
    const entries: [string, string][] = [
      ["noteSingle", assets.noteSingle],
      ["noteDouble", assets.noteDouble],
      ["terminalSingle", assets.terminalSingle],
      ["terminalDouble", assets.terminalDouble],
      ["bodySingle", assets.bodySingle],
      ["bodyDouble", assets.bodyDouble],
      ["bodySingleHeld", assets.bodySingleHeld],
      ["bodyDoubleHeld", assets.bodyDoubleHeld],
      // 실패 에셋
      ["noteSingleFailed", assets.noteSingleFailed],
      ["noteDoubleFailed", assets.noteDoubleFailed],
      ["bodySingleFailed", assets.bodySingleFailed],
      ["bodyDoubleFailed", assets.bodyDoubleFailed],
      ["terminalSingleFailed", assets.terminalSingleFailed],
      ["terminalDoubleFailed", assets.terminalDoubleFailed],
      // 부분 실패 에셋
      ["bodyDoublePartialFailedLeft", assets.bodyDoublePartialFailedLeft],
      ["bodyDoublePartialFailedRight", assets.bodyDoublePartialFailedRight],
      ["terminalDoublePartialFailedLeft", assets.terminalDoublePartialFailedLeft],
      ["terminalDoublePartialFailedRight", assets.terminalDoublePartialFailedRight],
      ["noteDoublePartialFailedLeft", assets.noteDoublePartialFailedLeft],
      ["noteDoublePartialFailedRight", assets.noteDoublePartialFailedRight],
    ];

    // 봄 프레임
    for (let i = 0; i < assets.bomb.length; i++) {
      entries.push([`bomb${i}`, assets.bomb[i]]);
    }

    // 버튼 (idle + pressed × 4)
    for (let i = 0; i < assets.buttonIdle.length; i++) {
      entries.push([`buttonIdle${i}`, assets.buttonIdle[i]]);
    }
    for (let i = 0; i < assets.buttonPressed.length; i++) {
      entries.push([`buttonPressed${i}`, assets.buttonPressed[i]]);
    }

    // 모든 텍스처를 병렬 로드
    const loadPromises = entries.map(async ([key, path]) => {
      const texture = await Assets.load<Texture>(path);
      this.textures.set(key, { texture, path });
    });

    await Promise.all(loadPromises);

    // 봄 텍스처 배열 구성
    this.bombTextures = [];
    for (let i = 0; i < assets.bomb.length; i++) {
      this.bombTextures.push(this.textures.get(`bomb${i}`)!.texture);
    }

    this.loaded = true;
  }

  /** 개별 텍스처 조회 */
  getTexture(key: string): Texture {
    if (!this.loaded) {
      throw new Error("SkinManager: no skin loaded");
    }
    const entry = this.textures.get(key);
    if (!entry) {
      throw new Error(`SkinManager: unknown texture key "${key}"`);
    }
    return entry.texture;
  }

  /** 봄 AnimatedSprite용 16프레임 텍스처 배열 */
  getBombTextures(): Texture[] {
    if (!this.loaded) {
      throw new Error("SkinManager: no skin loaded");
    }
    return this.bombTextures;
  }

  /** 런타임 테마 (키빔, 글로우 등 동적 색상) */
  getTheme(): SkinTheme {
    if (!this.manifest) {
      throw new Error("SkinManager: no skin loaded");
    }
    return this.manifest.theme;
  }

  /** 텍스처 메모리 해제 */
  dispose(): void {
    for (const [key, { path }] of this.textures) {
      Assets.unload(path).catch((e) => console.warn('SkinManager: failed to unload', key, e));
    }
    this.textures.clear();
    this.bombTextures = [];
    this.manifest = null;
    this.loaded = false;
  }
}
