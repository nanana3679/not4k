import type { Container } from "pixi.js";

/**
 * Container의 자식을 모두 제거하고 각각 destroy한다.
 *
 * Pixi v8의 `destroy()`는 자신을 부모의 `children` 배열에서 splice하므로, 그 배열을 순회하며 destroy하면
 * 자식이 하나 걸러 하나씩만 destroy된다. 그래서 `removeChildren()`이 돌려주는 별도 배열을 순회한다.
 * 옵션 없이 destroy한다. 타임라인 레이어의 자식은 자식 없는 `Graphics`·`Text`뿐이고, `{ children: true }` 같은
 * 옵션 객체를 넘기면 `Graphics`가 자기 `GraphicsContext`를 destroy하지 않으며, `true`를 넘기면 렌더러가 소유한
 * 공유 `TextStyle`(마디 번호 라벨)까지 destroy한다.
 */
export function destroyChildren(container: Container): void {
  for (const child of container.removeChildren()) {
    child.destroy();
  }
}
