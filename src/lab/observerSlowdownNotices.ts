/**
 * 옵저버 감속 청음 비교 Lab이 Lab 정적 빌드에 함께 싣는 제삼자 코드의 고지.
 * 저작권 줄은 지어 쓰지 않고 패키지·상류 저장소에 적힌 그대로 옮긴다. 패키지를 올리면 버전·저작권·소스 주소를 함께 고친다.
 */

export interface ThirdPartyNotice {
  /** 방식 카드의 라이선스 표기가 연결하는 고지 절(#observer-slowdown-license-<id>). */
  id: "signalsmith" | "soundtouch";
  title: string;
  /** 빌드에 들어가는 npm 패키지와 정확한 버전. */
  packages: readonly { name: string; version: string }[];
  license: "MIT" | "MPL-2.0";
  copyrights: readonly string[];
  /** 저작권 줄을 옮겨 온 곳. */
  copyrightSource: string;
  licenseUrl: string;
  /** 페이지에 싣는 라이선스 전문. MPL-2.0은 길어 전문 주소로 대신한다. */
  licenseText?: string;
  sources: readonly { label: string; url: string }[];
  /** 같은 빌드에 함께 들어가는 하위 라이브러리. */
  bundled?: { name: string; license: "MIT"; copyright: string; licenseUrl: string };
}

const MIT_PERMISSION = `Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

/** npm signalsmith-stretch 1.3.2의 SignalsmithStretch.mjs는 상류 저장소 이 커밋의 web/release 파일과 바이트 단위로 같다. */
const SIGNALSMITH_RELEASE_COMMIT = "222093b4cc13ddb4d07c826bc3c1559326091731";
const SOUNDTOUCH_VERSION = "2.1.1";
const SOUNDTOUCH_PACKAGES = ["audio-worklet", "core", "worklet-base", "interpolation-strategy-lanczos"] as const;

export const OBSERVER_SLOWDOWN_NOTICES: readonly ThirdPartyNotice[] = [
  {
    id: "signalsmith",
    title: "Signalsmith Stretch 1.3.2",
    packages: [{ name: "signalsmith-stretch", version: "1.3.2" }],
    license: "MIT",
    copyrights: ["Copyright (c) 2022 Geraint Luff / Signalsmith Audio Ltd."],
    copyrightSource: `npm 패키지에는 LICENSE 파일이 없어, 같은 릴리스 파일을 담은 상류 저장소 커밋 ${SIGNALSMITH_RELEASE_COMMIT.slice(0, 7)}의 LICENSE.txt에서 옮깁니다.`,
    licenseUrl: `https://github.com/Signalsmith-Audio/signalsmith-stretch/blob/${SIGNALSMITH_RELEASE_COMMIT}/LICENSE.txt`,
    licenseText: `MIT License\n\nCopyright (c) 2022 Geraint Luff / Signalsmith Audio Ltd.\n\n${MIT_PERMISSION}`,
    sources: [
      { label: "npm signalsmith-stretch 1.3.2 패키지 묶음", url: "https://registry.npmjs.org/signalsmith-stretch/-/signalsmith-stretch-1.3.2.tgz" },
      {
        label: `상류 저장소 web/release (커밋 ${SIGNALSMITH_RELEASE_COMMIT.slice(0, 7)})`,
        url: `https://github.com/Signalsmith-Audio/signalsmith-stretch/tree/${SIGNALSMITH_RELEASE_COMMIT}/web/release`,
      },
    ],
    bundled: {
      name: "Signalsmith Linear (WASM 빌드에 포함된 FFT·STFT)",
      license: "MIT",
      copyright: "Copyright (c) 2025 Signalsmith Audio",
      licenseUrl: "https://github.com/Signalsmith-Audio/linear/blob/0.1.2/LICENSE.txt",
    },
  },
  {
    id: "soundtouch",
    title: `SoundTouchJS ${SOUNDTOUCH_VERSION}`,
    packages: SOUNDTOUCH_PACKAGES.map((name) => ({ name: `@soundtouchjs/${name}`, version: SOUNDTOUCH_VERSION })),
    license: "MPL-2.0",
    copyrights: [
      "Copyright (c) Olli Parviainen",
      "Copyright (c) Ryan Berdeen",
      "Copyright (c) Jakub Fiala",
      "Copyright (c) Steve 'Cutter' Blades",
    ],
    copyrightSource: "@soundtouchjs/audio-worklet·core 배포 파일 머리말에서 옮깁니다. Lab 빌드는 이 패키지들을 고치지 않고 묶어(압축해) 싣고, MPL-2.0에 따라 이 버전의 소스를 아래에서 받을 수 있게 합니다.",
    licenseUrl: "https://www.mozilla.org/en-US/MPL/2.0/",
    sources: [
      { label: `GitHub cutterbl/SoundTouchJS 태그 v${SOUNDTOUCH_VERSION} (packages/ 아래 네 패키지)`, url: `https://github.com/cutterbl/SoundTouchJS/tree/v${SOUNDTOUCH_VERSION}` },
      ...SOUNDTOUCH_PACKAGES.map((name) => ({
        label: `npm @soundtouchjs/${name} ${SOUNDTOUCH_VERSION} 소스 묶음`,
        url: `https://registry.npmjs.org/@soundtouchjs/${name}/-/${name}-${SOUNDTOUCH_VERSION}.tgz`,
      })),
    ],
  },
];
