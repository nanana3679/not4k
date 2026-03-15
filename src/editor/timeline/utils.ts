import type { Container } from "pixi.js";

/** Container의 자식을 모두 destroy하고 제거 */
export function destroyChildren(container: Container): void {
  for (const child of container.children) {
    child.destroy();
  }
  container.removeChildren();
}
