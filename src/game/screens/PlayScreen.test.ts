import { describe, expect, it } from 'vitest';
import playScreenSource from './PlayScreen.tsx?raw';

// PlayScreen은 WebGL/DOM에 묶여 vitest에서 실행 불가라, 리소스 정리 계약(순서·대상)을
// 소스 순서 테스트로 고정한다. 자매 컴포넌트 TutorialPreviewPlayer.test.ts와 같은 방식.
// (들여쓰기 변경에 깨지지 않도록 exact 블록 대신 순서/정규식 매칭을 쓴다.)
describe('PlayScreen 리소스 정리 계약', () => {
  it('retry/이탈 cleanup에서 renderer 다음에 SkinManager를 dispose 해 스킨 텍스처 누수를 막음', () => {
    // SkinManager는 매 init에서 새로 만들어 스킨 텍스처를 Assets.load 한다. renderer.dispose()는
    // texture:false라 텍스처를 파괴하지 않으므로, cleanup이 SkinManager.dispose()(=Assets.unload)를
    // 부르지 않으면 retry마다 텍스처가 PIXI Assets 캐시에 남는다.
    expect(playScreenSource).toContain('skinManagerRef.current.dispose();');
    // renderer.dispose()가 skinManager.dispose()보다 먼저 와야 텍스처 참조 중 unload를 피한다.
    const rendererDisposeIdx = playScreenSource.indexOf('rendererRef.current.dispose();');
    const skinDisposeIdx = playScreenSource.indexOf('skinManagerRef.current.dispose();');
    expect(rendererDisposeIdx).toBeGreaterThan(-1);
    expect(skinDisposeIdx).toBeGreaterThan(rendererDisposeIdx);
  });

  it('init 완료 경로에서 SkinManager를 ref에 저장해 cleanup이 dispose 할 수 있게 함', () => {
    expect(playScreenSource).toContain('skinManagerRef.current = skinManager;');
  });

  it('loadSkin 도중 언마운트되면 방금 올린 스킨 텍스처를 dispose(다음 init이 await할 수 있게 ref에 저장)', () => {
    const guardIdx = playScreenSource.indexOf('await skinManager.loadSkin(settings.skinId);');
    const disposeIdx = playScreenSource.indexOf('pendingSkinUnloadRef.current = skinManager.dispose();');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(disposeIdx).toBeGreaterThan(guardIdx);
  });

  it('renderer.init() 도중 언마운트되면 renderer를 skinManager보다 먼저 dispose', () => {
    // await renderer.init(); 뒤 disposed 분기에서 renderer.dispose() → skinManager.dispose() 순.
    expect(playScreenSource).toMatch(
      /await renderer\.init\(\);[\s\S]*?if \(disposed\) \{\s*renderer\.dispose\(\);\s*pendingSkinUnloadRef\.current = skinManager\.dispose\(\);\s*return;/,
    );
  });

  it('cleanup 진입 시 disposed 플래그를 세워 in-flight init이 orphan 리소스를 남기지 않게 함', () => {
    expect(playScreenSource).toContain('let disposed = false;');
    expect(playScreenSource).toContain('disposed = true;');
  });
});

describe('PlayScreen 첫 판정 hitch 프리웜', () => {
  it('게임 시작 전 스킨 텍스처를 GPU로 프리웜(renderer.prewarm)해 첫 판정의 lazy 업로드 랙을 없앰', () => {
    expect(playScreenSource).toContain('renderer.prewarm();');
    // 프리웜이 게임 루프 시작(audioEngine.play)보다 앞서야 의미가 있다.
    const prewarmIdx = playScreenSource.indexOf('renderer.prewarm();');
    const playIdx = playScreenSource.indexOf('audioEngine.play(startTimeMs);');
    expect(prewarmIdx).toBeGreaterThan(-1);
    expect(playIdx).toBeGreaterThan(prewarmIdx);
  });

  it('판정 텍스트 폰트(Audiowide)를 게임 시작 전에 로드해 첫 판정 시 폰트 swap 리플로우를 없앰', () => {
    expect(playScreenSource).toContain('document.fonts.load(\'36px "Audiowide"\')');
  });

  it('폰트 로드가 느린/hang 네트워크에서 게임 시작을 막지 않도록 1.5s 타임아웃(Promise.race) 상한', () => {
    // M-2: 프리웜은 best-effort이므로 상한 초과 시 fallback로 진행.
    expect(playScreenSource).toContain('Promise.race([');
    expect(playScreenSource).toContain('setTimeout(resolve, 1500)');
  });

  it('폰트 로드(await) 도중 언마운트/retry 시 renderer·skinManager를 정리하고 중단', () => {
    // 폰트 await 뒤에도 disposed 가드가 있어야 orphan 리소스가 안 남는다.
    const fontIdx = playScreenSource.indexOf('const fontLoadMs = performance.now() - fontT0;');
    const prewarmIdx = playScreenSource.indexOf('renderer.prewarm();');
    const guardIdx = playScreenSource.indexOf('if (disposed) {', fontIdx);
    expect(fontIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeGreaterThan(fontIdx);
    expect(guardIdx).toBeLessThan(prewarmIdx);
  });

  it('debugMode일 때 fontLoad·textureUpload 소요를 콘솔에 찍어 첫 판정 비용을 측정 가능하게 함', () => {
    expect(playScreenSource).toContain('if (settings.debugMode) {');
    expect(playScreenSource).toContain('[PlayScreen prewarm]');
  });
});

describe('PlayScreen fable 리뷰 수정 (retry 경합·AudioContext 누수)', () => {
  it('H-1: 다음 init이 skin 재load 전에 직전 unload를 await 해 Assets.unload↔재load 경합을 막음', () => {
    // Assets.unload는 캐시삭제·texture.destroy를 microtask로 미룬다. 기다리지 않고 같은 스킨을
    // 재load하면 파괴 예정 텍스처를 재사용하게 되므로, loadSkin 전에 pending unload를 await 해야 한다.
    const awaitIdx = playScreenSource.indexOf('await pendingSkinUnloadRef.current;');
    const loadSkinIdx = playScreenSource.indexOf('await skinManager.loadSkin(settings.skinId);');
    expect(awaitIdx).toBeGreaterThan(-1);
    expect(loadSkinIdx).toBeGreaterThan(awaitIdx);
  });

  it('H-1: 모든 teardown(가드·cleanup)이 dispose Promise를 pendingSkinUnloadRef에 저장', () => {
    // 세 가드 + cleanup 총 4곳이 다음 init이 await할 수 있도록 promise를 남겨야 한다.
    const count = playScreenSource.split('pendingSkinUnloadRef.current = ').length - 1;
    expect(count).toBeGreaterThanOrEqual(4);
  });

  it('M-1: AudioEngine(AudioContext)을 모든 중단 가드 통과 후에 생성해 로딩 중 중단 시 누수를 막음', () => {
    // new AudioEngine()이 마지막 가드(prewarm) 뒤에 와야, 중단된 init이 running AudioContext를
    // refs에도 못 담고 흘리는 일이 없다.
    const prewarmIdx = playScreenSource.indexOf('renderer.prewarm();');
    const audioIdx = playScreenSource.indexOf('const audioEngine = new AudioEngine();');
    expect(prewarmIdx).toBeGreaterThan(-1);
    expect(audioIdx).toBeGreaterThan(prewarmIdx);
  });
});
