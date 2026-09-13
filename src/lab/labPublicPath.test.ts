import { describe, expect, it } from "vitest";
import { withLabPublicBase } from "./labPublicPath";

describe("withLabPublicBase", () => {
  it("개발 base=/에서 /lab 에셋 경로는 그대로 유지된다", () => {
    expect(withLabPublicBase("/lab/gear-light/gear-base.png", "/")).toBe("/lab/gear-light/gear-base.png");
  });

  it("GitHub Pages base=/not4k/에서 /lab 에셋 경로 앞에 저장소 이름이 붙는다", () => {
    expect(withLabPublicBase("/lab/gear-light/gear-base.png", "/not4k/")).toBe(
      "/not4k/lab/gear-light/gear-base.png",
    );
  });

  it("앞뒤 슬래시가 중복돼도 /not4k/__lab 경로를 한 번씩만 연결한다", () => {
    expect(withLabPublicBase("///__lab/flight-background-preview/", "//not4k//")).toBe(
      "/not4k/__lab/flight-background-preview/",
    );
  });
});
