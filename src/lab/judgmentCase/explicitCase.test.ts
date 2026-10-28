import { describe, expect, it } from "vitest";
import { beat } from "../../shared/types/beat";
import type { ChartDocument, DocumentNoteEntity } from "../../shared/types/chart";
import { chartToJson, serializeChart } from "../../shared/chart";
import { JUDGMENT_WINDOWS, MAINTENANCE_GRACE_MS } from "../../shared/constants/judgment";
import { validateChartDocument } from "../../shared/validation/documentValidation";
import { compileExplicitJudgmentChart } from "../../game/judgment/explicitCompiledChart";
import { ExplicitJudgmentSession } from "../../game/judgment/ExplicitJudgmentSession";
import { explicitFixtureBody as body, explicitFixtureTap as tap, explicitFixtureRelease as release,
  explicitFixtureTick as tick } from "../../game/judgment/explicitJudgmentTestHarness";
import { explicitCaseFromDocument, explicitCaseFromSource } from "./explicitChartCase";
import { explicitCaseLabels, runExplicitJudgmentCase, summarizeExplicitCase } from "./runExplicitJudgmentCase";
import { createExplicitCaseSkin, explicitCaseSkinAssetPaths } from "./explicitCaseSkin";
import { explicitCaseWindows, renderExplicitJudgmentCaseSvg } from "./renderExplicitJudgmentCaseSvg";
import { fakeSkinImages } from "./makeTestSkin";
import { judgmentCaseFromSource } from "./chartCase";

const engine = { compileExplicitJudgmentChart, ExplicitJudgmentSession, validateChartDocument, JUDGMENT_WINDOWS, MAINTENANCE_GRACE_MS };
type Hold = readonly [key: string, down: number, up: number, lane?: 1 | 2 | 3 | 4];
const document = (notes: DocumentNoteEntity[], holds: Hold[] = []): ChartDocument => ({
  meta: { title: "이미지 밖 제목", artist: "test", difficultyLabel: "NORMAL", difficultyLevel: 1,
    imageFile: "", audioFile: "", previewAudioFile: "", offsetMs: 0 },
  notes, trillZones: [], restZones: [], events: [{ type: "bpm", beat: beat(0), bpm: 120 },
    ...holds.map(([keyCode, down, up, lane = 1]) => ({ type: "tutorialInput" as const, keyCode, lane,
      beat: beat(down, 500), endBeat: beat(up, 500) }))],
});
const replay = (chart: ChartDocument) => {
  const example = explicitCaseFromSource(serializeChart(chart));
  return { example, run: runExplicitJudgmentCase(example, engine) };
};
const skin = createExplicitCaseSkin(fakeSkinImages(explicitCaseSkinAssetPaths()));
const tagOf = (svg: string, pattern: RegExp) => {
  const match = pattern.exec(svg);
  if (!match) throw new Error(`SVG에 ${pattern} 태그가 없습니다`);
  return match[0];
};
const numberAttr = (tag: string, name: string) => {
  const match = new RegExp(`\\s${name}="([^"]+)"`).exec(tag);
  if (!match) throw new Error(`${tag}에 ${name} 속성이 없습니다`);
  return Number(match[1]);
};
const bodyRect = (svg: string) => tagOf(svg, /<rect data-explicit-asset="body\.[^"]+"[^>]*>/);
/** 축 눈금 선의 y. 눈금 글자(font-size 11)가 바로 뒤에 붙는다. */
const axisLineY = (svg: string, label: string) =>
  numberAttr(tagOf(svg, new RegExp(`<line x1="70"[^>]*/>(?=<text x="14" y="[^"]+" fill="[^"]+" font-size="11">${label}</text>)`)), "y1");

describe("explicit 사례의 실제 compiler → session → ScoreManager", () => {
  it("싱글 Point1000·바디1000～2000·유지1500·릴리즈2000을 실제 down/up으로 처리하면 9/9점·콤보3", () => {
    const { example, run } = replay(document([tap(1000), body(1000, 2000), tick(1500), release(2000)], [["A", 1000, 2000]]));
    expect(run.error).toBeNull();
    expect(run.finalized).toBe(true);
    expect(run.result?.score).toMatchObject({ earnedScore: 9, totalNotes: 3, processedNotes: 3, finalDenominatorWeight: 9, isFullCombo: true });
    expect(run.result?.combo).toBe(3);
    expect(run.compiled?.bodyUnits.map(unit => unit.weight)).toEqual([0]);
    expect(run.result?.facts.filter(fact => fact.kind === "settlement").map(fact => fact.itemKind)).toEqual(["tap", "tick", "release"]);
    const summary = summarizeExplicitCase(example, run, "현재 엔진");
    expect(summary).toContain("explicit 실제 엔진 실행");
    expect(summary).toContain("N4 L1 release 2000ms");
    expect(summary).toContain("미정산 0 · 종속 0점 0");
    expect(summary).toContain("이미지 밖 제목");
  });

  it("바디1000～2000만 유지하면 점수 항목0·분모0·콤보0이며 자동 릴리즈를 만들지 않음", () => {
    const { run } = replay(document([body(1000, 2000)], [["A", 1000, 2200]]));
    expect(run.result?.score).toMatchObject({ earnedScore: 0, totalNotes: 0, finalDenominatorWeight: 0 });
    expect(run.result?.combo).toBe(0);
    expect(run.result?.facts.filter(fact => fact.kind === "settlement")).toEqual([]);
    expect(run.result?.snapshot.bodyUnits[0].state).toBe("complete");
  });

  it("이론 가중치0인 바디1000～2000 차트는 요약에 달성률 0.00% 대신 '달성률 없음(무점수 차트)'을 쓰고 PNG에도 달성률이 없음", () => {
    const { example, run } = replay(document([body(1000, 2000)], [["A", 1000, 1500]]));
    expect(run.compiled?.theoreticalWeight).toBe(0);
    const summary = summarizeExplicitCase(example, run, "실제");
    expect(summary).not.toMatch(/달성률 \d/);
    expect(summary).toContain("달성률 없음(무점수 차트)");
    // 바디 유지 실패의 무점수 Miss와 Full Combo 판단은 숨기지 않는다(RFD 0039 결정 4).
    expect(summary).toContain("Miss 1");
    expect(summary).toContain("Full Combo 아님");
    const { svg } = renderExplicitJudgmentCaseSvg([{ judgmentCase: example, run, engineLabel: "엔진" }], { skin });
    expect(svg).not.toMatch(/달성률|0\.00%/);
  });

  it("Point1000을 입력 없이 놓친 점수 차트는 분모3·획득0이며 요약에 달성률 0.00%를 그대로 표시", () => {
    const { example, run } = replay(document([tap(1000)]));
    expect(run.compiled?.theoreticalWeight).toBe(3);
    expect(summarizeExplicitCase(example, run, "실제")).toContain("점수 0/3 · 달성률 0.00%");
  });

  it("standalone 릴리즈2000은 실제 up2000 하나로 Perfect3점을 받음", () => {
    const { run } = replay(document([release(2000)], [["A", 500, 2000]]));
    expect(run.result?.score).toMatchObject({ earnedScore: 3, totalNotes: 1, processedNotes: 1 });
    expect(run.result?.facts.filter(fact => fact.kind === "settlement")).toMatchObject([{ itemKind: "release", grade: "perfect", rawDeltaMs: 0 }]);
  });

  it("double 바디에서 A만 누르면 한 몫 시작 실패·다른 몫 유지 성공이며 종속2개 포함 6/12점", () => {
    const { example, run } = replay(document([body(1000, 2000, 2), tick(1500, 2), release(2000, 2)], [["A", 1000, 2000]]));
    expect(run.result?.score).toMatchObject({ earnedScore: 6, totalNotes: 4, processedNotes: 4, finalDenominatorWeight: 12 });
    expect(run.result?.score.judgmentCounts).toMatchObject({ perfect: 2, miss: 1 });
    expect(run.result?.snapshot.bodyUnits.map(unit => unit.state)).toEqual(["complete", "failed"]);
    expect(run.result?.snapshot.items.filter(item => item.state === "dependentZero")).toHaveLength(2);
    expect(explicitCaseLabels(example, run).map(label => label.text).join("\n")).toContain("N1u2 시작 실패");
  });

  it("up1490 뒤 down1505로 유예 안에 회복하면 유지1500은 bodyRecovery 대기 뒤 Perfect이며 Miss0", () => {
    const { run } = replay(document([body(1000, 2000), tick(1500), release(2000)], [["A", 1000, 1490], ["B", 1505, 2000]]));
    expect(run.snapshots.some(snapshot => snapshot.items.some(item => item.waitingReason === "bodyRecovery"))).toBe(true);
    expect(run.result?.facts.filter(fact => fact.kind === "settlement" && fact.itemKind === "tick")).toMatchObject([{ grade: "perfect", confirmedAt: 1505, timingDeltaMs: null }]);
    expect(run.result?.score.judgmentCounts).toMatchObject({ perfect: 2, miss: 0 });
    expect(run.result?.combo).toBe(2);
  });

  it("up1490 뒤 down1525는 1510 유지 실패를 복구하지 못하고 표식·릴리즈 종속0점에 추가 Miss가 없음", () => {
    const { example, run } = replay(document([body(1000, 2000), tick(1500), release(2000)], [["A", 1000, 1490], ["B", 1525, 2000]]));
    expect(run.result?.score.judgmentCounts).toMatchObject({ perfect: 0, miss: 1 });
    expect(run.result?.snapshot.items.map(item => item.state)).toEqual(["dependentZero", "dependentZero"]);
    expect(summarizeExplicitCase(example, run, "실제")).toContain("N1 유지 실패");
    expect(run.result?.effects.filter(effect => effect.comboAction === "break")).toHaveLength(1);
  });

  it("같은 confirmedAt1500의 Good Point와 Perfect 유지는 session 대표 Good·실제오차100ms를 그대로 사용", () => {
    const { run } = replay(document([tap(1400), body(1000, 2000, 1, 2), tick(1500, 1, 2)], [["A", 1500, 1510], ["B", 500, 2200, 2]]));
    expect(run.displays.filter(display => display.confirmedAt === 1500)).toMatchObject([{ grade: "good", timingDeltaMs: 100, source: { noteIndex: 0, ordinal: 0 } }]);
    expect(run.displays.filter(display => display.confirmedAt === 1500)).toHaveLength(1);
  });

  it("A1000～2000으로 finalize까지 마친 사례는 timeline 완료 라벨에 (잠정)을 붙이지 않고 'N2 무점수 완료 @2000'", () => {
    const { example, run } = replay(document([tap(1000), body(1000, 2000), tick(1500), release(2000)], [["A", 1000, 2000]]));
    expect(run.finalized).toBe(true);
    expect(run.result?.facts.some(fact => (fact.kind === "bodyStarted" || fact.kind === "bodyCompleted") && fact.provisional)).toBe(true);
    const labels = explicitCaseLabels(example, run).map(label => label.text);
    expect(labels).toContain("N2 무점수 완료 @2000");
    expect(labels.join("\n")).not.toContain("(잠정)");
  });

  it("같은 사례가 finalize 전이면 무효화되지 않은 provisional 완료 라벨에 (잠정)을 유지", () => {
    const { example, run } = replay(document([tap(1000), body(1000, 2000), tick(1500), release(2000)], [["A", 1000, 2000]]));
    const labels = explicitCaseLabels(example, { ...run, finalized: false }).map(label => label.text);
    expect(labels).toContain("N2 무점수 완료 (잠정) @2000");
  });

  it("late up950/observed1001이 잠정 시작을 무효화하면 라벨도 시작을 제거하고 실제 snapshot 미시작을 보존", () => {
    const example = explicitCaseFromDocument(document([body(1000, 1060), tick(1030)]));
    const compiled = compileExplicitJudgmentChart(example.chart);
    const session = new ExplicitJudgmentSession(compiled);
    session.processBatch(500, [{ key: "A", lane: 1, type: "down" }]); session.advance(1001);
    session.processObservedBatch(950, [{ key: "A", lane: 1, type: "up" }], 1001);
    const run = { ...runExplicitJudgmentCase(example, engine), compiled, result: session.result(), snapshots: [session.snapshot], finalized: false };
    expect(run.result.snapshot.bodyUnits[0].actualStartMs).toBeNull();
    const labels = explicitCaseLabels(example, run).map(label => label.text);
    expect(labels.some(text => text.includes("진행 무효화"))).toBe(true);
    expect(labels.some(text => text.includes("N1 시작 @"))).toBe(false);
    expect(summarizeExplicitCase(example, run, "실제")).toContain("미정산 1");
    expect(summarizeExplicitCase(example, run, "실제")).toContain("판정 불가(finalize 전)");
  });

  it("1504ms advance에서 엔진 예외가 나면 실제 미정산2개와 finalize 전 상태를 남기고 Full Combo 확정을 하지 않음", () => {
    class InterruptedSession extends ExplicitJudgmentSession {
      override advance(at: number) { if (at >= 1504) throw new Error("재생 중단"); super.advance(at); }
    }
    const example = explicitCaseFromDocument(document([body(1000, 2000), tick(1500), release(2000)], [["A", 1000, 2000]]));
    const run = runExplicitJudgmentCase(example, { ...engine, ExplicitJudgmentSession: InterruptedSession });
    expect(run.error).toEqual({ message: "재생 중단", atMs: 1504 });
    expect(run.finalized).toBe(false);
    expect(run.result?.snapshot.items.filter(item => item.settlementFactId === null)).toHaveLength(2);
    expect(summarizeExplicitCase(example, run, "실제")).toContain("미정산 2");
    expect(summarizeExplicitCase(example, run, "실제")).toContain("판정 불가(finalize 전)");
  });

  it("같은 v4 사례를 두 번 실행하면 서로 다른 새 세션에서 9/9점·콤보3·효과3개를 각각 한 번 생성", () => {
    const example = explicitCaseFromDocument(document([tap(1000), body(1000, 2000), tick(1500), release(2000)], [["A", 1000, 2000]]));
    const first = runExplicitJudgmentCase(example, engine);
    const second = runExplicitJudgmentCase(example, engine);
    expect(first.result?.score).toEqual(second.result?.score);
    expect(first.result?.combo).toBe(3);
    expect(second.result?.combo).toBe(3);
    expect(first.result?.effects).toHaveLength(3);
    expect(second.result?.effects).toHaveLength(3);
    expect(first.result?.display?.groupId).not.toBe(second.result?.display?.groupId);
  });
});

describe("explicit 입력 경계와 legacy/design 보존", () => {
  it("v3 single과 legacy 텍스트는 --explicit에서 거부하고 v4 문서는 기본 legacy 경로에서 --explicit 안내", () => {
    expect(() => explicitCaseFromSource(serializeChart(document([{ type: "single", lane: 1, beat: beat(2) }])))).toThrow(/version: 4/);
    expect(() => explicitCaseFromSource("노트: head 1000")).toThrow(/v4/);
    expect(() => judgmentCaseFromSource(serializeChart(document([tap(1000)])))).toThrow(/--explicit/);
    expect(() => explicitCaseFromSource('{"format":"judgment-case-design","notes":[]}')).toThrow(/version: 4/);
  });

  it.each([false, true])("v4 main에 legacy가 남은 mixed=%s 문서는 컴파일을 거부하고 구형 입력을 변환하지 않음", mixed => {
    const chart = document([...(mixed ? [tap(1000)] : []), { type: "single", lane: 2, beat: beat(4) }]);
    const example = explicitCaseFromSource(JSON.stringify({ ...chartToJson(chart), version: 4 }));
    const run = runExplicitJudgmentCase(example, engine);
    expect(run.finalized).toBe(false);
    expect(run.compiled).toBeNull();
    expect(run.result).toBeNull();
    expect(run.validationErrors.some(issue => issue.rule === "legacyGameContent")).toBe(true);
    expect(run.error?.message).toContain("구형 게임 노트");
    expect(summarizeExplicitCase(example, run, "실제")).toContain("실행 거부(세션 미생성)");
    expect(summarizeExplicitCase(example, run, "실제")).toContain("미정산 계산 불가");
  });

  it("aux의 구형 single·holdOnly와 explicit point를 문서에 보존하고 main N1/N4만 정산", () => {
    const chart = document([tap(1000), { type: "single", lane: 5, beat: beat(2) },
      { type: "long", lane: 6, beat: beat(2), endBeat: beat(4), holdOnly: true }, tap(2000)], [["A", 1000, 1010], ["A", 2000, 2010]]);
    chart.notes.push(tap(2500, "single", 7));
    const { example, run } = replay(chart);
    expect(example.chart.notes).toEqual(chart.notes);
    expect(example.notes.map(note => note.id)).toEqual(["N1", "N4"]);
    expect(run.compiled?.scoreItems.map(item => item.source.noteIndex)).toEqual([0, 3]);
    expect(run.result?.score).toMatchObject({ totalNotes: 2, earnedScore: 6 });
  });

  it.each([1000, 1500, 2000])("같은 lane trillZone1000～2000의 release%d는 양 경계를 포함해 새 compiler가 거부", time => {
    const chart = document([release(time)]);
    chart.trillZones = [{ lane: 1, beat: beat(2), endBeat: beat(4) }];
    expect(runExplicitJudgmentCase(explicitCaseFromDocument(chart), engine).error).not.toBeNull();
  });

  it("trill Point와 바디 끝에는 명시 릴리즈를 추가하지 않아 Point1개만 분모3·콤보1", () => {
    const chart = document([tap(1000, "trill"), { type: "body", lane: 1, beat: beat(2), endBeat: beat(4), holdCount: 1, trill: true }], [["A", 1000, 2000]]);
    chart.trillZones = [{ lane: 1, beat: beat(2), endBeat: beat(4) }];
    const { run } = replay(chart);
    expect(run.error).toBeNull();
    expect(run.compiled?.scoreItems.map(item => item.kind)).toEqual(["tap"]);
    expect(run.result?.score).toMatchObject({ totalNotes: 1, earnedScore: 3, finalDenominatorWeight: 3 });
    expect(run.result?.combo).toBe(1);
  });

  it("BPM120 offset50에서 노트2박과 tutorialInput2박이 모두1050ms로 일치", () => {
    const chart = document([tap(1000)], [["KeyA", 1000, 1100]]);
    chart.meta.offsetMs = 50;
    const { example, run } = replay(chart);
    expect(example.notes[0].startMs).toBe(1050);
    expect(example.inputs[0]).toMatchObject({ label: "A", downMs: 1050, upMs: 1150 });
    expect(run.result?.score.earnedScore).toBe(3);
  });
});

describe("실제 explicit 사례의 정식 skin SVG", () => {
  it("Point/body/release/sustain을 승인 에셋으로 구분하고 body cap·숨은 끝점·제목 본문을 그리지 않음", () => {
    const { example, run } = replay(document([tap(1000), body(1000, 2000), tick(1500), release(2000)], [["A", 1000, 2000]]));
    const { svg } = renderExplicitJudgmentCaseSvg([{ judgmentCase: example, run, engineLabel: "엔진" }], { skin });
    for (const id of ["tap.single.pending", "body.single.idle", "tick.single.pending", "release.single.pending"]) expect(svg).toContain(`data-explicit-asset="${id}"`);
    expect(svg).toContain('data-body-cap="none"');
    expect(svg).not.toMatch(/terminal|endCap|설계 예시|이미지 밖 제목/);
    expect(svg).toContain("실제 엔진 실행");
    expect(svg).toContain("N4 release");
    expect(explicitCaseWindows(example, run)).toEqual([
      { noteIndex: 0, startMs: 880, endMs: 1120, label: "N1 tap Good" },
      { noteIndex: 3, startMs: 1880, endMs: 2120, label: "N4 release Good" },
    ]);
  });

  it("PNG 바닥글은 stdout처럼 대표 등급을 Perfect로 쓰고 세션 끝 콤보3을 '현재 콤보 3'으로 표기", () => {
    const { example, run } = replay(document([tap(1000), body(1000, 2000), tick(1500), release(2000)], [["A", 1000, 2000]]));
    const { svg } = renderExplicitJudgmentCaseSvg([{ judgmentCase: example, run, engineLabel: "엔진" }], { skin });
    expect(svg).toContain("대표 @1000: Perfect · N1");
    expect(svg).not.toMatch(/대표 @\d+: (perfect|great|good|miss)/);
    expect(svg).toContain("현재 콤보 3");
    expect(summarizeExplicitCase(example, run, "실제")).toContain("현재 콤보 3");
  });

  it("BPM120 길이0 바디1000～1000은 높이0으로 사라지지 않고 Point와 같은 높이로 1000ms 눈금 가운데에 그림", () => {
    const { example, run } = replay(document([tap(500), body(1000, 1000)], [["A", 500, 1250]]));
    expect(run.error).toBeNull();
    const { svg } = renderExplicitJudgmentCaseSvg([{ judgmentCase: example, run, engineLabel: "엔진" }], { skin });
    const rect = bodyRect(svg);
    const tapHeight = numberAttr(tagOf(svg, /<use data-explicit-asset="tap\.single\.pending"[^>]*>/), "height");
    expect(numberAttr(rect, "height")).toBeCloseTo(tapHeight, 6);
    expect(numberAttr(rect, "y") + numberAttr(rect, "height") / 2).toBeCloseTo(axisLineY(svg, "1000"), 6);
  });

  it("길이0 바디1000～1000 위의 유지1000은 바디 없이 홀로 그려지지 않고 같은 중심의 바디와 함께 그림", () => {
    const { example, run } = replay(document([body(1000, 1000), tick(1000)], [["A", 500, 1250]]));
    expect(run.error).toBeNull();
    const { svg } = renderExplicitJudgmentCaseSvg([{ judgmentCase: example, run, engineLabel: "엔진" }], { skin });
    const rect = bodyRect(svg);
    const marker = tagOf(svg, /<use data-explicit-asset="tick\.single\.pending"[^>]*>/);
    expect(numberAttr(rect, "height")).toBeGreaterThan(0);
    expect(numberAttr(rect, "y") + numberAttr(rect, "height") / 2)
      .toBeCloseTo(numberAttr(marker, "y") + numberAttr(marker, "height") / 2, 6);
  });

  it("바디1000～2000처럼 타일보다 긴 바디는 실제 경계 1000·2000ms 눈금 사이에 그대로 그림", () => {
    const { example, run } = replay(document([body(1000, 2000)], [["A", 1000, 2000]]));
    const { svg } = renderExplicitJudgmentCaseSvg([{ judgmentCase: example, run, engineLabel: "엔진" }], { skin });
    const rect = bodyRect(svg);
    expect(numberAttr(rect, "y")).toBeCloseTo(axisLineY(svg, "2000"), 6);
    expect(numberAttr(rect, "y") + numberAttr(rect, "height")).toBeCloseTo(axisLineY(svg, "1000"), 6);
  });

  it("double 유지 표식은 정식 left/right 에셋 두 개이며 sustain 독립 창은 없음", () => {
    const { example, run } = replay(document([body(1000, 2000, 2), tick(1500, 2)], [["A", 1000, 2000], ["B", 1000, 2000]]));
    const { svg } = renderExplicitJudgmentCaseSvg([{ judgmentCase: example, run, engineLabel: "엔진" }], { skin });
    expect(svg).toContain('data-explicit-asset="tick.double.pending.left"');
    expect(svg).toContain('data-explicit-asset="tick.double.pending.right"');
    expect(explicitCaseWindows(example, run)).toEqual([]);
  });

  it("classic-explicit PNG가 없거나 크기가 틀리면 legacy 에셋으로 대체하지 않고 오류", () => {
    expect(() => createExplicitCaseSkin({})).toThrow(/classic-explicit.*tap.single.pending/);
    const images = fakeSkinImages(explicitCaseSkinAssetPaths());
    images["tap.single.pending"].width = 1;
    expect(() => createExplicitCaseSkin(images)).toThrow(/PNG 크기/);
  });
});
