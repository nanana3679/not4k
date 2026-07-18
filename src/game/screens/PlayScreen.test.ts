import { describe, expect, it } from 'vitest';
import playScreenSource from './PlayScreen.tsx?raw';

// PlayScreen은 WebGL/DOM에 묶여 vitest에서 실행 불가라, 리소스 정리 계약(순서·대상)을
// 소스 순서 테스트로 고정한다. 자매 컴포넌트 TutorialPreviewPlayer.test.ts와 같은 방식.
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

  it('loadSkin 도중 언마운트되면 방금 올린 스킨 텍스처를 즉시 dispose', () => {
    // await skinManager.loadSkin(...) 직후의 disposed 가드 — orphan 텍스처 방지.
    const guardIdx = playScreenSource.indexOf('await skinManager.loadSkin(settings.skinId);');
    const disposeIdx = playScreenSource.indexOf('skinManager.dispose();');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(disposeIdx).toBeGreaterThan(guardIdx);
    expect(playScreenSource).toContain('if (disposed) {\n          skinManager.dispose();\n          return;\n        }');
  });

  it('renderer.init() 도중 언마운트되면 renderer를 skinManager보다 먼저 dispose', () => {
    expect(playScreenSource).toContain(
      [
        '        if (disposed) {',
        '          renderer.dispose();',
        '          skinManager.dispose();',
        '          return;',
        '        }',
      ].join('\n'),
    );
  });

  it('cleanup 진입 시 disposed 플래그를 세워 in-flight init이 orphan 리소스를 남기지 않게 함', () => {
    expect(playScreenSource).toContain('let disposed = false;');
    expect(playScreenSource).toContain('disposed = true;');
  });
});
