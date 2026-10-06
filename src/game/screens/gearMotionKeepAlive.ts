import { acquireGearMotionAssets, type GearMotionAssetLease } from '../renderer/classicGearMotionAssets';

/**
 * 게임 설정 `Gear Motion`이 켜져 있는 동안 기어 움직임 자료(약 2MB, GPU 약 16.8MiB)를 한 벌 붙잡아 둔다(RFD 0029).
 *
 * 플레이 렌더러는 곡마다·재시도마다 새로 만들어지고 정리할 때 자기 임대를 놓는다. 이 임대가 없으면 마지막 임대가 놓일 때마다 unload되어
 * 재시도·다음 곡마다 곡 시작 전에 다시 받고 디코드해야 한다. 플레이 화면이 처음 열릴 때 잡아 스킨 읽기와 함께 기다리고(움직임 자료는 스킨처럼
 * 필수), 설정을 끄면(게임 루트의 설정 구독) 또는 움직임 줄이기면 놓는다. 읽기에 실패한 임대는 붙잡아 두지 않아 다음 플레이가 다시 빌린다.
 * 게임 화면(PlayScreen·GameApp)만 쓴다. Lab 미리보기와 렌더러 단위 테스트는 이 모듈을 거치지 않는다.
 */
let held: GearMotionAssetLease | null = null;

/** wanted가 true면 붙잡은 임대(없으면 새로 빌림)를, false면 붙잡은 임대를 놓고 null을 돌려준다. */
export function keepGearMotionAssets(
  wanted: boolean,
  acquire: () => GearMotionAssetLease = () => acquireGearMotionAssets(),
): GearMotionAssetLease | null {
  if (!wanted) {
    held?.release();
    held = null;
    return null;
  }
  if (held) return held;
  const lease = acquire();
  held = lease;
  lease.ready.catch(() => {
    if (held !== lease) return;
    held = null;
    lease.release();
  });
  return lease;
}
