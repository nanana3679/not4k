import { describe, expect, it } from "vitest";
import { PRESET_BINDINGS } from "../stores";
import { DEFAULT_BINDINGS_TKL, InputSystem, type InputCallbacks, type KeyBinding } from "./InputSystem";

type Lane = KeyBinding["lane"];
type InputCall = readonly [kind: "press" | "release", lane: Lane, timestampMs: number, keyCode: string];

const LANES = [1, 2, 3, 4] as const;

/** 레인 1에는 KeyQ·KeyW 두 키, 레인 2~4에는 한 키씩 바인딩한다. */
const BINDINGS: KeyBinding[] = [
  { lane: 1, key: "KeyQ" },
  { lane: 1, key: "KeyW" },
  { lane: 2, key: "KeyE" },
  { lane: 3, key: "KeyP" },
  { lane: 4, key: "BracketLeft" },
];

/** node에는 KeyboardEvent가 없어 Event에 InputSystem이 읽는 KeyboardEvent 필드를 덧붙인다. */
function fireKey(
  target: EventTarget,
  type: "keydown" | "keyup",
  code: string,
  timeStamp: number,
  fields: Record<string, unknown> = {},
): void {
  const event = new Event(type);
  for (const [name, value] of Object.entries({ repeat: false, ...fields, code, timeStamp })) {
    Object.defineProperty(event, name, { value });
  }
  target.dispatchEvent(event);
}

function setupInput(bindings: KeyBinding[] = BINDINGS) {
  const target = new EventTarget();
  const calls: InputCall[] = [];
  const callbacks: InputCallbacks = {
    onLanePress: (lane, timestampMs, keyCode) => calls.push(["press", lane, timestampMs, keyCode]),
    onLaneRelease: (lane, timestampMs, keyCode) => calls.push(["release", lane, timestampMs, keyCode]),
  };
  const input = new InputSystem(bindings, callbacks);
  input.attach(target);
  return {
    input,
    target,
    calls,
    down: (code: string, timeStamp: number, fields?: Record<string, unknown>) =>
      fireKey(target, "keydown", code, timeStamp, fields),
    up: (code: string, timeStamp: number) => fireKey(target, "keyup", code, timeStamp),
  };
}

/** PlayScreen처럼 설정의 레인별 키 목록을 KeyBinding 배열로 편다. */
function toKeyBindings(preset: Record<`lane${Lane}`, string[]>): KeyBinding[] {
  return LANES.flatMap(lane => preset[`lane${lane}`].map(key => ({ lane, key })));
}

function pressedLanes(calls: readonly InputCall[]): Array<[keyCode: string, lane: Lane]> {
  return calls.filter(([kind]) => kind === "press").map(([, lane, , keyCode]) => [keyCode, lane]);
}

describe("InputSystem", () => {
  describe("반복 keydown 거르기", () => {
    it("레인 1의 KeyQ를 timeStamp 100에 누른 채 repeat이 true인 keydown이 130·160·190에 와도 onLanePress는 100의 1번뿐이다", () => {
      const { calls, down, up } = setupInput();
      down("KeyQ", 100);
      down("KeyQ", 130, { repeat: true });
      down("KeyQ", 160, { repeat: true });
      down("KeyQ", 190, { repeat: true });
      up("KeyQ", 200);
      expect(calls).toEqual([
        ["press", 1, 100, "KeyQ"],
        ["release", 1, 200, "KeyQ"],
      ]);
    });

    it("KeyQ를 떼기 전 repeat이 false인 keydown 150은 무시하고, 200에 뗀 뒤 keydown 300은 다시 onLanePress를 낸다", () => {
      const { calls, down, up } = setupInput();
      down("KeyQ", 100);
      down("KeyQ", 150);
      up("KeyQ", 200);
      down("KeyQ", 300);
      expect(calls).toEqual([
        ["press", 1, 100, "KeyQ"],
        ["release", 1, 200, "KeyQ"],
        ["press", 1, 300, "KeyQ"],
      ]);
    });

    it("attach 전부터 누르던 KeyQ의 repeat keydown 100·130과 keyup 200은 무시하고, 300에 다시 누른 keydown부터 onLanePress를 낸다", () => {
      const { calls, down, up } = setupInput();
      down("KeyQ", 100, { repeat: true });
      down("KeyQ", 130, { repeat: true });
      up("KeyQ", 200);
      down("KeyQ", 300);
      expect(calls).toEqual([["press", 1, 300, "KeyQ"]]);
    });

    it.todo("미정: KeyQ를 timeStamp 100에 누른 채 창이 blur되어 keyup을 받지 못하면, focus 복귀 뒤 다시 누른 keydown 5000을 onLanePress로 낼지 (현재 KeyQ가 held로 남아 그 keydown을 무시하고 keyup 5100에만 onLaneRelease를 낸다)");
  });

  describe("레인 press·release 전달", () => {
    it("레인 1~4의 KeyQ·KeyE·KeyP·BracketLeft를 timeStamp 1000에 함께 누르고 1100에 반대 순서로 떼면 onLanePress 4번 뒤 onLaneRelease 4번이 이벤트 순서대로 각 레인에 온다", () => {
      const { input, calls, down, up } = setupInput();
      for (const code of ["KeyQ", "KeyE", "KeyP", "BracketLeft"]) down(code, 1000);
      expect(LANES.map(lane => input.isLaneHeld(lane))).toEqual([true, true, true, true]);

      for (const code of ["BracketLeft", "KeyP", "KeyE", "KeyQ"]) up(code, 1100);
      expect(calls).toEqual([
        ["press", 1, 1000, "KeyQ"],
        ["press", 2, 1000, "KeyE"],
        ["press", 3, 1000, "KeyP"],
        ["press", 4, 1000, "BracketLeft"],
        ["release", 4, 1100, "BracketLeft"],
        ["release", 3, 1100, "KeyP"],
        ["release", 2, 1100, "KeyE"],
        ["release", 1, 1100, "KeyQ"],
      ]);
      expect(LANES.map(lane => input.isLaneHeld(lane))).toEqual([false, false, false, false]);
    });

    it("레인 1의 KeyQ·KeyW를 같은 timeStamp 1000에 누르면 키마다 onLanePress가 오고, KeyQ만 1100에 떼도 KeyW를 뗀 1200까지 isLaneHeld(1)은 true다", () => {
      const { input, calls, down, up } = setupInput();
      down("KeyQ", 1000);
      down("KeyW", 1000);
      up("KeyQ", 1100);
      expect(input.isLaneHeld(1)).toBe(true);

      up("KeyW", 1200);
      expect(input.isLaneHeld(1)).toBe(false);
      expect(calls).toEqual([
        ["press", 1, 1000, "KeyQ"],
        ["press", 1, 1000, "KeyW"],
        ["release", 1, 1100, "KeyQ"],
        ["release", 1, 1200, "KeyW"],
      ]);
    });

    it("keydown timeStamp 1234.567과 keyup timeStamp 1300.125를 반올림이나 GameClock.toInputTimeMs 변환 없이 onLanePress·onLaneRelease에 그대로 넘긴다", () => {
      const { calls, down, up } = setupInput();
      down("KeyE", 1234.567);
      up("KeyE", 1300.125);
      expect(calls).toEqual([
        ["press", 2, 1234.567, "KeyE"],
        ["release", 2, 1300.125, "KeyE"],
      ]);
    });

    it("레인 1의 KeyQ를 150에, KeyW를 180에 떼면 getLaneLastReleaseTime(1)은 둘 다 뗀 180이고, 떼기 전과 다시 누른 동안은 null이다", () => {
      const { input, down, up } = setupInput();
      expect(input.getLaneLastReleaseTime(1)).toBeNull();
      down("KeyQ", 100);
      down("KeyW", 120);
      up("KeyQ", 150);
      expect(input.getLaneLastReleaseTime(1)).toBeNull();

      up("KeyW", 180);
      expect(input.getLaneLastReleaseTime(1)).toBe(180);

      down("KeyQ", 300);
      expect(input.getLaneLastReleaseTime(1)).toBeNull();
    });
  });

  describe("키 → 레인 매핑", () => {
    it("DEFAULT_BINDINGS_TKL은 KeyW·KeyQ를 레인 1, KeyE·KeyC를 레인 2, KeyP·Comma를 레인 3, BracketLeft·BracketRight를 레인 4로 onLanePress한다", () => {
      const { calls, down, up } = setupInput(DEFAULT_BINDINGS_TKL);
      const codes = ["KeyW", "KeyQ", "KeyE", "KeyC", "KeyP", "Comma", "BracketLeft", "BracketRight"];
      codes.forEach((code, i) => {
        down(code, i * 10);
        up(code, i * 10 + 5);
      });
      expect(pressedLanes(calls)).toEqual([
        ["KeyW", 1], ["KeyQ", 1],
        ["KeyE", 2], ["KeyC", 2],
        ["KeyP", 3], ["Comma", 3],
        ["BracketLeft", 4], ["BracketRight", 4],
      ]);
    });

    it.each(["tkl", "numpad"] as const)("PRESET_BINDINGS.%s의 16키를 PlayScreen처럼 KeyBinding으로 넘기면 각 키 keydown이 그 키가 바인딩된 레인의 onLanePress가 된다", preset => {
      const bindings = toKeyBindings(PRESET_BINDINGS[preset]);
      expect(bindings).toHaveLength(16);
      const { calls, down, up } = setupInput(bindings);
      bindings.forEach(({ key }, i) => {
        down(key, i * 10);
        up(key, i * 10 + 5);
      });
      expect(pressedLanes(calls)).toEqual(bindings.map(({ lane, key }) => [key, lane]));
    });

    it.each([
      ["AZERTY 배열의 e.key 'a'", { key: "a" }],
      ["한글 IME 조합 중인 e.key 'Process'·isComposing true", { key: "Process", isComposing: true }],
    ])("%s인 KeyQ keydown도 e.code로 레인 1 onLanePress를 낸다", (_label, fields) => {
      const { calls, down } = setupInput();
      down("KeyQ", 100, fields);
      expect(calls).toEqual([["press", 1, 100, "KeyQ"]]);
    });

    it("바인딩되지 않은 KeyA(e.key 'q')·Space의 keydown·keyup은 콜백을 부르지 않는다", () => {
      const { calls, down, up } = setupInput();
      down("KeyA", 100, { key: "q" });
      up("KeyA", 200);
      down("Space", 300, { key: " " });
      up("Space", 400);
      expect(calls).toEqual([]);
    });

    it.each(["shiftKey", "ctrlKey", "altKey", "metaKey"])("%s가 true인 KeyQ keydown도 거르지 않고 레인 1 onLanePress를 낸다", modifier => {
      const { calls, down } = setupInput();
      down("KeyQ", 100, { [modifier]: true });
      expect(calls).toEqual([["press", 1, 100, "KeyQ"]]);
    });

    it("updateBindings([{ lane: 1, key: 'KeyA' }]) 뒤에는 KeyQ keydown은 무시하고 KeyA keydown이 레인 1 onLanePress를 낸다", () => {
      const { input, calls, down } = setupInput();
      input.updateBindings([{ lane: 1, key: "KeyA" }]);
      down("KeyQ", 100);
      down("KeyA", 200);
      expect(calls).toEqual([["press", 1, 200, "KeyA"]]);
    });
  });

  describe("attach·detach", () => {
    it("detach한 뒤 온 KeyQ keydown·keyup은 콜백을 부르지 않는다", () => {
      const { input, calls, down, up } = setupInput();
      input.detach();
      down("KeyQ", 100);
      up("KeyQ", 200);
      expect(calls).toEqual([]);
    });

    it("KeyQ를 누른 채 detach하면 onLaneRelease 없이 isLaneHeld(1)이 false가 되고, 다시 attach한 뒤 keyup 200은 무시하고 keydown 300은 onLanePress를 낸다", () => {
      const { input, target, calls, down, up } = setupInput();
      down("KeyQ", 100);
      input.detach();
      expect(input.isLaneHeld(1)).toBe(false);

      input.attach(target);
      up("KeyQ", 200);
      down("KeyQ", 300);
      expect(calls).toEqual([
        ["press", 1, 100, "KeyQ"],
        ["press", 1, 300, "KeyQ"],
      ]);
    });

    it("attach를 다른 target으로 다시 부르면 이전 target의 KeyQ keydown 100은 무시하고 새 target의 keydown 200만 onLanePress를 낸다", () => {
      const { input, target, calls } = setupInput();
      const nextTarget = new EventTarget();
      input.attach(nextTarget);
      fireKey(target, "keydown", "KeyQ", 100);
      fireKey(nextTarget, "keydown", "KeyQ", 200);
      expect(calls).toEqual([["press", 1, 200, "KeyQ"]]);
    });
  });
});
