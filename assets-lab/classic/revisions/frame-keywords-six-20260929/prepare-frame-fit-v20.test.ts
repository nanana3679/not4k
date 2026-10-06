import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = new URL('../../../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root));

// 기어 그림은 생성기가 만든 한 벌만 둔다. 게임 렌더러·/lab/classic-gear·움직임 생성기가 모두 이 두 파일을 읽는다.
describe('Classic 기어 생성기 산출물 (RFD 0029)', () => {
  it('생성기는 게임 경로 public/gear/classic-gear.png와 src/game/renderer/classicGear.json에만 쓴다', () => {
    const script = read('assets-lab/classic/revisions/frame-keywords-six-20260929/prepare-frame-fit-v20.mjs').toString();
    expect(script).toContain("resolve(workspaceRoot, 'public/gear/classic-gear.png')");
    expect(script).toContain("resolve(workspaceRoot, 'src/game/renderer/classicGear.json')");
    expect(script).not.toContain('public/lab/classic-frame-fit');
  });

  it('Lab 복사본(public/lab/classic-frame-fit/frame-cutout.png·frame-fit.json)은 남아 있지 않다', () => {
    expect(existsSync(new URL('public/lab/classic-frame-fit/frame-cutout.png', root))).toBe(false);
    expect(existsSync(new URL('public/lab/classic-frame-fit/frame-fit.json', root))).toBe(false);
  });

  it('#231 이전 이름(public/gear/classic-frame.png·classic-frame-motion/, src/game/renderer/classicFrame.json)은 남아 있지 않다', () => {
    expect(existsSync(new URL('public/gear/classic-frame.png', root))).toBe(false);
    expect(existsSync(new URL('public/gear/classic-frame-motion', root))).toBe(false);
    expect(existsSync(new URL('src/game/renderer/classicFrame.json', root))).toBe(false);
  });

  it('움직임 생성기도 같은 기어 그림의 알파를 입력으로 읽는다', () => {
    const script = read('assets-lab/classic/revisions/frame-keywords-six-20260929/prepare-frame-motion-v21.mjs').toString();
    expect(script).toContain("const cutoutPath = resolve(workspaceRoot, 'public/gear/classic-gear.png');");
  });

  it('기어 그림은 측정값과 같은 1024×1536 PNG이고 승인된 Lab 컷아웃(PR #218)과 같은 바이트(sha256 194d6955…)다', () => {
    const geometry = JSON.parse(read('src/game/renderer/classicGear.json').toString());
    const png = read('public/gear/classic-gear.png');
    expect(geometry.image).toBe('public/gear/classic-gear.png');
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([geometry.width, geometry.height]);
    // 생성기를 다시 돌려 그림이 바뀌면 이 해시와 classicGearLayout.test.ts의 측정값을 함께 바꾼다.
    expect(createHash('sha256').update(png).digest('hex')).toBe('194d6955319b9aea3fab8e9d2c657c71d02bbb4e6b9574c7d0256ae56b5b1167');
  });
});
