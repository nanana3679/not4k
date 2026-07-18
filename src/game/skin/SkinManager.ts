import { Assets, Texture, Rectangle } from "pixi.js";
import type { SkinManifest, SkinTheme } from "./types";
import { getSkinManifest } from "./skins";

/**
 * 롱노트 캡 텍스처 키 매핑: terminal texKey → 전용 endCap texKey.
 * 전용 캡 에셋이 로드된 스킨이면 이 키의 텍스처를 사용하고, 없으면 crop fallback한다.
 * partial-failed 캡은 윗부분 색이 double과 같아 endCapDouble을 재사용한다.
 */
const CAP_TEXTURE_KEY: Record<string, string> = {
  terminalSingle: "endCapSingle",
  terminalDouble: "endCapDouble",
  terminalSingleFailed: "endCapSingleFailed",
  terminalDoubleFailed: "endCapDoubleFailed",
  terminalDoublePartialFailedLeft: "endCapDouble",
  terminalDoublePartialFailedRight: "endCapDouble",
};

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
  /** terminal 텍스처에서 잘라낸 캡 텍스처 캐시 (texKey → 윗부분 절반) */
  private capTextures = new Map<string, Texture>();
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
      // 부분 충족 held 에셋
      ["bodyDoublePartialHeldLeft", assets.bodyDoublePartialHeldLeft],
      ["bodyDoublePartialHeldRight", assets.bodyDoublePartialHeldRight],
      // 트릴 에셋
      ["noteTrill", assets.noteTrill],
      ["terminalTrill", assets.terminalTrill],
      ["bodyTrill", assets.bodyTrill],
      ["bodyTrillHeld", assets.bodyTrillHeld],
      ["noteTrillFailed", assets.noteTrillFailed],
      ["bodyTrillFailed", assets.bodyTrillFailed],
      ["terminalTrillFailed", assets.terminalTrillFailed],
      // 기어 프레임 + 기둥 게이지
      ["gearFrame", assets.gearFrame],
      ["gearGaugeLeft", assets.gearGaugeLeft],
      ["gearGaugeRight", assets.gearGaugeRight],
    ];

    // 롱노트 전용 캡 에셋 (있는 스킨만 — 없으면 getHalfCapTexture가 terminal crop으로 fallback)
    if (assets.endCapSingle) entries.push(["endCapSingle", assets.endCapSingle]);
    if (assets.endCapDouble) entries.push(["endCapDouble", assets.endCapDouble]);
    if (assets.endCapSingleFailed) entries.push(["endCapSingleFailed", assets.endCapSingleFailed]);
    if (assets.endCapDoubleFailed) entries.push(["endCapDoubleFailed", assets.endCapDoubleFailed]);

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

  /**
   * 롱노트 캡 텍스처. 전용 캡 에셋(endCap*)이 로드된 스킨은 그것을 사용하고,
   * 없는 스킨은 terminal 텍스처의 윗부분 절반(=캡 모양)을 런타임 crop해 fallback한다.
   * 시작 캡(상하반전)·끝 캡 양쪽에서 같은 텍스처를 공유한다.
   *
   * TODO(assets-lab): crystal 외 스킨(prism/classic)은 아직 crop fallback을 쓴다.
   * 추후 해당 스킨에도 전용 캡 에셋(assets-lab의 EndCap)을 추가하면 crop 경로를 제거할 수 있다.
   */
  getHalfCapTexture(key: string): Texture {
    // 전용 캡 에셋 우선
    const dedicatedKey = CAP_TEXTURE_KEY[key];
    if (dedicatedKey) {
      const entry = this.textures.get(dedicatedKey);
      if (entry) return entry.texture;
    }

    // fallback: terminal 텍스처의 윗부분 절반을 런타임 crop
    const cached = this.capTextures.get(key);
    if (cached) return cached;

    const base = this.getTexture(key);
    const f = base.frame;
    const cap = new Texture({
      source: base.source,
      frame: new Rectangle(f.x, f.y, f.width, f.height / 2),
    });
    this.capTextures.set(key, cap);
    return cap;
  }

  /** 봄 AnimatedSprite용 16프레임 텍스처 배열 */
  getBombTextures(): Texture[] {
    if (!this.loaded) {
      throw new Error("SkinManager: no skin loaded");
    }
    return this.bombTextures;
  }

  /**
   * 로드된 모든 텍스처 (GPU 프리웜용). 노트/바디/터미널/실패/held + bomb 프레임.
   * cap 텍스처는 base source를 공유하므로 별도로 넣지 않는다 (base 업로드 시 함께 워밍됨).
   * 첫 판정/첫 실패에서야 처음 그려지는 텍스처(bomb·failed 등)의 GPU 업로드를 게임 시작 전으로
   * 앞당겨 첫 판정 프레임의 hitch를 없애는 데 쓴다.
   */
  getAllTextures(): Texture[] {
    const all: Texture[] = [];
    for (const { texture } of this.textures.values()) {
      all.push(texture);
    }
    all.push(...this.bombTextures);
    return all;
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
    // 캡 텍스처는 base의 source를 공유하므로 unload 없이 캐시만 비운다
    this.capTextures.clear();
    this.bombTextures = [];
    this.manifest = null;
    this.loaded = false;
  }
}
