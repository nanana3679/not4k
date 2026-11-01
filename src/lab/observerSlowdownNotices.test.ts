import { describe, expect, it, vi } from "vitest";
import { OBSERVER_SLOWDOWN_NOTICES } from "./observerSlowdownNotices";

// src의 브라우저 타입 검사에 Node 전역을 추가하지 않고 실제 fs·url 모듈만 읽는다.
const { existsSync, readFileSync, realpathSync } = await vi.importActual<{
  existsSync(path: URL): boolean;
  readFileSync(path: URL, encoding: "utf8"): string;
  realpathSync(path: URL): string;
}>("node:fs");
const { pathToFileURL } = await vi.importActual<{ pathToFileURL(path: string): URL }>("node:url");

const nodeModules = new URL("../../node_modules/", import.meta.url);

/**
 * 직접 설치한 패키지는 node_modules 바로 아래에서 읽는다.
 * @soundtouchjs/audio-worklet이 끌어온 의존성은 pnpm 가상 저장소에서 그 패키지 옆 디렉터리에 있다.
 */
function installedVersion(packageName: string): string {
  const direct = new URL(`${packageName}/`, nodeModules);
  const directory = existsSync(direct)
    ? direct
    : new URL(`../${packageName.replace("@soundtouchjs/", "")}/`, pathToFileURL(`${realpathSync(new URL("@soundtouchjs/audio-worklet/", nodeModules))}/`));
  return (JSON.parse(readFileSync(new URL("package.json", directory), "utf8")) as { version: string }).version;
}

describe("옵저버 감속 Lab 제삼자 고지", () => {
  it("고지한 패키지 버전은 설치된 signalsmith-stretch 1.3.2·@soundtouchjs 네 패키지 2.1.1의 package.json 버전과 같다", () => {
    const packages = OBSERVER_SLOWDOWN_NOTICES.flatMap((notice) => notice.packages);
    expect(packages.map(({ name, version }) => `${name}@${version}`)).toEqual([
      "signalsmith-stretch@1.3.2",
      "@soundtouchjs/audio-worklet@2.1.1",
      "@soundtouchjs/core@2.1.1",
      "@soundtouchjs/worklet-base@2.1.1",
      "@soundtouchjs/interpolation-strategy-lanczos@2.1.1",
    ]);
    for (const { name, version } of packages) expect(installedVersion(name)).toBe(version);
  });

  it("Signalsmith Stretch는 MIT 전문과 상류 LICENSE.txt의 저작권 줄 'Copyright (c) 2022 Geraint Luff / Signalsmith Audio Ltd.'를 싣는다", () => {
    const signalsmith = OBSERVER_SLOWDOWN_NOTICES.find((notice) => notice.id === "signalsmith");
    expect(signalsmith?.license).toBe("MIT");
    expect(signalsmith?.copyrights).toContain("Copyright (c) 2022 Geraint Luff / Signalsmith Audio Ltd.");
    expect(signalsmith?.licenseText).toContain("Permission is hereby granted, free of charge");
    expect(signalsmith?.licenseText).toContain('THE SOFTWARE IS PROVIDED "AS IS"');
  });

  it("SoundTouchJS는 MPL-2.0 전문 주소와 이 버전(v2.1.1) 소스 주소를 싣는다", () => {
    const soundtouch = OBSERVER_SLOWDOWN_NOTICES.find((notice) => notice.id === "soundtouch");
    expect(soundtouch?.license).toBe("MPL-2.0");
    expect(soundtouch?.licenseUrl).toBe("https://www.mozilla.org/en-US/MPL/2.0/");
    expect(soundtouch?.sources.map(({ url }) => url)).toContain("https://github.com/cutterbl/SoundTouchJS/tree/v2.1.1");
    expect(soundtouch?.sources.map(({ url }) => url)).toContain("https://registry.npmjs.org/@soundtouchjs/audio-worklet/-/audio-worklet-2.1.1.tgz");
  });
});
