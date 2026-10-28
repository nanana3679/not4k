import { describe, expect, it } from "vitest";
import { parseJudgmentCaseDesign, summarizeJudgmentCaseDesign } from "./judgmentCaseDesign";
import { renderJudgmentCaseDesignSvg as renderWithSkin } from "./renderJudgmentCaseDesignSvg";

import { makeTestSkin } from "./makeTestSkin";
import type { JudgmentCaseDesign } from "./judgmentCaseDesign";
import type { JudgmentCaseSkin } from "./judgmentCaseSkin";

function renderJudgmentCaseDesignSvg(designs: JudgmentCaseDesign[], options: { skin?: JudgmentCaseSkin; pxPerMs?: number } = {}) {
  return renderWithSkin(designs, { skin: makeTestSkin("classic"), ...options });
}

function design(fields: Record<string, unknown> = {}) {
  return parseJudgmentCaseDesign(JSON.stringify({ format: "judgment-case-design", title: "설계", notes: [{ kind: "tap", atMs: 2000 }], ...fields }));
}
function windowBounds(svg: string, index: number) {
  const group = svg.match(new RegExp(`<g data-design-window="${index}"[^>]*>(.*?)</g>`, "s"))![1];
  const rect = group.match(/<rect x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"/)!;
  return { top: Number(rect[2]), bottom: Number(rect[2]) + Number(rect[4]) };
}
function axisY(svg: string, ms: number) {
  return Number(svg.match(new RegExp(`<text x="70" y="([^"]+)"[^>]*>${ms}</text>`))![1]) - 4;
}

describe("설계 도식", () => {
  it("제목·본문·요약·메모는 텍스트 출력에만 남고 이미지에는 짧은 Miss 라벨만 표시", () => {
    const example = design({ title: "Point를 놓쳐도 뒤 바디를 유지할까?", summary: "논의 요약 문장", memo: "아직 확정 전인 결정",
      annotations: [{ note: "N1", atMs: 2000, label: "Miss", text: "창 안에 새 누름이 없다는 설명 본문", tone: "failure" }] });
    const { svg } = renderJudgmentCaseDesignSvg([example]);
    const caption = summarizeJudgmentCaseDesign(example);
    for (const content of [example.title, example.summary, example.memo, example.annotations[0].text]) {
      expect(svg).not.toContain(content);
      expect(caption).toContain(content);
    }
    expect(svg).toContain(">Miss</text>");
    expect(svg).toContain("엔진 미실행");
  });

  it("label 없는 설명을 90000ms에 추가해도 이미지 축과 크기는 변하지 않고 텍스트로만 출력", () => {
    const plain = design();
    const withProse = design({ annotations: [{ atMs: 90000, text: "추가 설명".repeat(100) }] });
    expect(renderJudgmentCaseDesignSvg([withProse])).toEqual(renderJudgmentCaseDesignSvg([plain]));
    expect(summarizeJudgmentCaseDesign(withProse)).toContain("@90000ms: 추가 설명");
  });

  it.each(["classic", "crystal", "simple"])("%s 설계의 double 바디·single Point·double release는 기존 PNG 에셋을 쓰고 Point 높이는 16px", id => {
    const skin = makeTestSkin(id);
    const { svg } = renderJudgmentCaseDesignSvg([design({ notes: [
      { kind: "body", count: 2, startMs: 1000, endMs: 2000 },
      { kind: "tap", atMs: 1000 },
      { kind: "release", count: 2, atMs: 2000 },
    ], annotations: [{ note: "N2", atMs: 1000, text: "Miss를 가정", tone: "failure" }] })], { skin });
    expect(svg).toContain('data-design-note="N1" data-note-part="body" data-skin-asset="bodyDouble"');
    expect(svg).toMatch(/data-design-note="N2" data-note-part="point" data-skin-asset="noteSingle"[^>]*width="80" height="16"/);
    expect(svg).toContain(`data-design-note="N3" data-note-part="terminal" data-skin-asset="${skin.terminal.double.key}"`);
    expect(svg).toContain('href="data:image/png;base64,bodyDouble"');
    expect(svg).toContain('href="data:image/png;base64,noteSingle"');
    expect(svg).toContain(`스킨 ${skin.name}`);
    expect(svg).not.toContain('data-design-placeholder="true"');
    expect(svg).not.toMatch(/data-skin-asset="[^"]*Failed/);
    const pointY = Number(svg.match(/data-note-part="point"[^>]* y="([^"]+)"/)![1]);
    expect(pointY + 8).toBeCloseTo(axisY(svg, 1000), 1);
    if (id === "classic") {
      expect(svg).toContain('<pattern id="jc-tile-0-0"');
      expect(svg).toContain('data-note-part="shadow" data-skin-asset="pointContactShadow"');
    } else {
      expect(svg).not.toContain("<pattern");
      expect(svg).toContain(`data-note-part="end" data-skin-asset="${skin.cap!.double.key}"`);
    }
  });

  it("Classic 설계 두 패널은 PNG 정의를 한 번만 넣고 바디 타일 id를 패널별로 분리", () => {
    const example = design({ notes: [{ kind: "body", startMs: 0, endMs: 1000 }] });
    const { svg } = renderJudgmentCaseDesignSvg([example, example]);
    expect(svg.match(/<image id="jc-skin-bodySingle"/g)).toHaveLength(1);
    expect(svg).toContain('fill="url(#jc-tile-0-0)"');
    expect(svg).toContain('fill="url(#jc-tile-1-0)"');
  });

  it("전용 에셋 없는 유지 노트와 3개 수량은 임시 표식으로 표시하고 기존 double 에셋으로 오인시키지 않음", () => {
    const { svg } = renderJudgmentCaseDesignSvg([design({ notes: [
      { kind: "tick", atMs: 1000 }, { kind: "body", count: 3, startMs: 1000, endMs: 2000 },
    ] })]);
    expect(svg.match(/data-design-placeholder="true"/g)).toHaveLength(2);
    expect(svg).toContain("임시 표식(전용 에셋 없음)");
    expect(svg).not.toContain('data-skin-asset="bodyDouble"');
  });

  it.each([undefined, 0.4])("배율 %s에서 N1 창 1880～2120ms는 경계 눈금과 일치하고 A↓1700은 창 아래", pxPerMs => {
    const { svg } = renderJudgmentCaseDesignSvg([design({ inputs: [{ key: "A", downMs: 1700, upMs: 3000 }],
      windows: [{ note: "N1", startMs: 1880, endMs: 2120, label: "Good" }] })], { pxPerMs });
    const window = windowBounds(svg, 1);
    expect(window.top).toBeCloseTo(axisY(svg, 2120));
    expect(window.bottom).toBeCloseTo(axisY(svg, 1880));
    expect(axisY(svg, 1700)).toBeGreaterThan(window.bottom);
    expect(axisY(svg, 2000)).toBeGreaterThan(window.top);
    expect(axisY(svg, 2000)).toBeLessThan(window.bottom);
  });

  it("같은 N1의 겹치는 비대칭 창 1600～2050·1950～2300을 각자 경계와 이름으로 표시", () => {
    const { svg } = renderJudgmentCaseDesignSvg([design({ windows: [
      { note: "N1", startMs: 1600, endMs: 2050, label: "시작 창" },
      { note: "N1", startMs: 1950, endMs: 2300, label: "종료 창", tone: "proposal" },
    ] })]);
    const first = windowBounds(svg, 1);
    const second = windowBounds(svg, 2);
    expect(second.top).toBeLessThan(first.top);
    expect(second.bottom).toBeGreaterThan(first.top);
    expect(second.bottom).toBeLessThan(first.bottom);
    expect(svg).toContain("W1 · N1 시작 창");
    expect(svg).toContain("W2 · N1 종료 창");
  });

  it("같은 2000ms 라벨 12개를 배치하면 서로 겹치지 않고 머리글·바닥글 안에 들어옴", () => {
    const { svg, height } = renderJudgmentCaseDesignSvg([design({ annotations: Array.from({ length: 12 }, (_, i) => ({ atMs: 2000, label: `확인할 조건 ${i}`, text: `조건 ${i}의 설명 본문` })) })]);
    const ys = [...svg.matchAll(/<text x="[^"]+" y="([^"]+)"[^>]*>확인할 조건 \d+<\/text>/g)].map(match => Number(match[1])).sort((a, b) => a - b);
    expect(ys).toHaveLength(12);
    expect(ys[0]).toBeGreaterThan(140);
    expect(ys[11]).toBeLessThan(height - 80);
    for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(42);
  });

  it("노트·키·창·라벨의 XML 문자는 텍스트로만 그려지고 script·image 태그가 되지 않음", () => {
    const attack = '<script>alert("x")</script>';
    const { svg } = renderJudgmentCaseDesignSvg([design({ title: attack,
      notes: [{ id: 'N"1', kind: "marker", name: attack, atMs: 0 }],
      inputs: [{ key: attack, downMs: 0 }], windows: [{ note: 'N"1', startMs: -1, endMs: 1, label: attack }],
      annotations: [{ atMs: 0, label: attack, text: attack }], memo: '<image href="https://example.com" />',
    })]);
    expect(svg).not.toMatch(/<script|<image href="https:/);
    expect(svg.match(/<image /g)).toHaveLength(Object.keys(makeTestSkin("classic").images).length);
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).toContain('data-design-note="N&quot;1"');
    expect(svg).not.toMatch(/NaN|Infinity/);
  });

  it("입력 없는 0ms 바디·release·유지 노트와 열린 키 입력도 점수 집계 없이 그림", () => {
    const first = design({ notes: [{ kind: "body", startMs: 0, endMs: 0 }, { kind: "release", atMs: 0 }, { kind: "tick", atMs: 0 }] });
    const second = design({ inputs: [{ key: "A", lane: 2, downMs: 0 }] });
    const { svg, height } = renderJudgmentCaseDesignSvg([first, second]);
    expect(svg.match(/엔진 미실행/g)).toHaveLength(2);
    expect(svg).toContain("A (계속)");
    expect(svg).toContain("유지 노트 ×1");
    expect(svg).not.toMatch(/NaN|Infinity|Full Combo|달성률/);
    expect(height).toBeGreaterThan(600);
  });
});
