import { describe, expect, it, vi } from "vitest";
import { beat } from "../../shared/types/beat";
import type { ChartDocument, DocumentNoteEntity } from "../../shared/types/chart";
import { createChartTiming } from "../../shared/timing/chartTiming";
import { ExplicitChartCompileError, compileExplicitJudgmentChart } from "./explicitCompiledChart";
import type { CompiledJudgmentChart } from "./compiledJudgmentChart";
import { explicitEnjFixtures } from "./explicitEnjFixtures";
import { explicitHcFixtures } from "./explicitHcFixtures";
import { explicitFixtureBody as b, explicitFixturePoint as p, explicitFixtureRelease as r, explicitFixtureSustain as s,
  makeExplicitReplayFixture, replayExplicitFixture } from "./explicitJudgmentTestHarness";

const chart = (notes: DocumentNoteEntity[]): ChartDocument => ({ ...explicitEnjFixtures[0].chart, notes });

describe("명시적 점수 항목과 무점수 바디 컴파일", () => {
  it("double Point2+body2+sustain2+release1은 점수5개·가중치15와 바디2몫을 만든다", () => {
    const compiled = compileExplicitJudgmentChart(chart([p(1000, "double"), b(1000, 2000, 2), s(1500, 2), r(2000)]));
    expect(compiled.format).toBe("explicit");
    expect(compiled.scoreItems.map(item => item.kind)).toEqual(["point", "point", "sustain", "sustain", "release"]);
    expect(compiled.totalJudgments).toBe(5);
    expect(compiled.theoreticalWeight).toBe(15);
    expect(compiled.bodyUnits).toHaveLength(2);
    expect(compiled.bodyUnits.map(unit => unit.weight)).toEqual([0, 0]);
    expect(new Set([...compiled.scoreItems, ...compiled.bodyUnits].map(item => item.id)).size).toBe(7);
    // @ts-expect-error explicit 결과는 구형 core/session 입력으로 조용히 넘길 수 없다.
    const legacy: CompiledJudgmentChart = compiled;
    expect(legacy).toBe(compiled);
  });

  it("2→1 감소·끝·길이0 body에 명시 노트가 없으면 점수항목0·가중치0이다", () => {
    const compiled = compileExplicitJudgmentChart(chart([b(1000, 2000, 2), b(2000, 3000), b(4000, 4000)]));
    expect(compiled.scoreItems).toEqual([]);
    expect(compiled.theoreticalWeight).toBe(0);
    expect(compiled.totalJudgments).toBe(0);
    expect(compiled.bodyUnits).toHaveLength(4);
    expect(compiled.bodies).toHaveLength(3);
    expect(compiled.connections).toHaveLength(1);
  });

  it("경계 2000 릴리즈로 이어진 같은 수 body 두 개는 실제 경계 2000ms와 독립 body unit ID를 보존하고 릴리즈는 앞 body 끝에 속한다", () => {
    const compiled = compileExplicitJudgmentChart(chart([b(1000, 2000), b(2000, 3000), r(2000)]));
    expect(compiled.bodies.map(body => [body.source.noteIndex, body.startMs, body.endMs])).toEqual([[0, 1000, 2000], [1, 2000, 3000]]);
    expect(compiled.bodyUnits.map(unit => unit.id)).toEqual(["b0:hold:0", "b1:hold:0"]);
    expect(compiled.connections[0]).toMatchObject({ predecessorIndex: 0, successorIndex: 1, boundaryMs: 2000, predecessorHoldCount: 1, successorHoldCount: 1 });
    expect(compiled.scoreItems).toMatchObject([{ kind: "release", bodyIndex: 0, boundaryKind: "end", timeMs: 2000 }]);
  });

  it("single body의 Grace double release는 같은 Grace 두 항목과 가중치6을 보존한다", () => {
    const compiled = compileExplicitJudgmentChart(chart([b(1000, 2000), r(2000, 2, 1, true)]));
    expect(compiled.scoreItems).toHaveLength(2);
    for (const item of compiled.scoreItems) expect(item).toMatchObject({ kind: "release", grace: true, bodyIndex: 0, weight: 3 });
    expect(compiled.theoreticalWeight).toBe(6);
  });

  it("2→1 경계 release는 앞 body 감소 끝, 같은 경계 sustain은 뒤 body 몫을 가리킨다", () => {
    const release = compileExplicitJudgmentChart(chart([b(1000, 2000, 2), b(2000, 3000), r(2000)]));
    expect(release.scoreItems[0]).toMatchObject({ source: { noteIndex: 2 }, bodyIndex: 0, boundaryKind: "decrease" });
    const sustain = compileExplicitJudgmentChart(chart([b(1000, 2000, 2), b(2000, 3000), s(2000)]));
    expect(sustain.scoreItems[0]).toMatchObject({ source: { noteIndex: 2 }, bodyIndex: 1, bodyUnit: { bodyIndex: 1, ordinal: 0 } });
    expect(sustain.bodies[0].sustainIndices).toEqual([]);
    expect(sustain.bodies[1].sustainIndices).toEqual([2]);
  });

  it("바디 밖 release는 standalone이며 몸통·시작 Point나 자동 owner를 만들지 않는다", () => {
    const compiled = compileExplicitJudgmentChart(chart([r(1000, 2)]));
    expect(compiled.bodies).toEqual([]);
    expect(compiled.scoreItems.map(item => item.kind === "release" && [item.bodyIndex, item.boundaryKind])).toEqual([[undefined, "standalone"], [undefined, "standalone"]]);
  });

  it("BPM120→60과 offset100은 ChartTiming에서만 파생하고 legacy judgmentCounts를 호출하지 않는다", () => {
    const document = chart([b(0, 3000), s(1500), r(3000)]);
    document.meta = { ...document.meta, offsetMs: 100 };
    document.events.push({ type: "bpm", beat: beat(2), bpm: 60 });
    const timing = createChartTiming(document);
    const counts = vi.spyOn(timing, "judgmentCounts").mockImplementation(() => { throw new Error("구형 집계 금지"); });
    const compiled = compileExplicitJudgmentChart(document, timing);
    expect(compiled.bodies[0]).toMatchObject({ startMs: 100, endMs: 5100 });
    expect(compiled.scoreItems.map(item => item.timeMs)).toEqual([2100, 5100]);
    expect(counts).not.toHaveBeenCalled();
  });

  it("main/aux가 섞여도 main 원본 index1·3을 유지하고 aux legacy는 실행 항목에서 제외한다", () => {
    const compiled = compileExplicitJudgmentChart(chart([
      { type: "single", lane: 5, beat: beat(0) }, b(1000, 2000), s(1500, 1, 6), r(2000), b(1000, 2000, 1, 6),
    ]));
    expect(compiled.bodies.map(body => body.source.noteIndex)).toEqual([1]);
    expect(compiled.scoreItems.map(item => item.source.noteIndex)).toEqual([3]);
    expect(compiled.relations.sustainBodyByNote.get(2)).toBe(4);
  });

  it.each(["single", "long"] as const)("게임 레인에 남은 구형 %s는 변환 없이 compiler에서 거부한다", type => {
    const note: DocumentNoteEntity = type === "single" ? { type, lane: 1, beat: beat(0) }
      : { type, lane: 1, beat: beat(0), endBeat: beat(1), holdOnly: true };
    expect(() => compileExplicitJudgmentChart(chart([note]))).toThrow(ExplicitChartCompileError);
    try { compileExplicitJudgmentChart(chart([note])); } catch (error) {
      expect((error as ExplicitChartCompileError).validation.runtimeIncompatible[0].refs).toEqual([{ kind: "note", index: 0 }]);
    }
  });

  it("바디 밖 sustain 의미 위반·lane0 구조 오류는 각 버킷으로 컴파일을 거부한다", () => {
    for (const [notes, bucket] of [[[s(1000)], "semantic"], [[p(1000, "single", 0)], "structural"]] as const) {
      expect(() => compileExplicitJudgmentChart(chart([...notes]))).toThrow(ExplicitChartCompileError);
      try { compileExplicitJudgmentChart(chart([...notes])); } catch (error) {
        expect((error as ExplicitChartCompileError).validation[bucket]).not.toHaveLength(0);
      }
    }
  });

  it("차트 순서 역전과 Beat 4/2=2/1 표현 변경에도 논리 항목 시각·종류·관계는 같다", () => {
    const source = [p(1000), b(1000, 2000), b(2000, 3000, 2), s(2000, 2), r(3000, 2)];
    const reversed = [...source].reverse().map(note => ({ ...note, beat: { n: note.beat.n * 4, d: note.beat.d * 4 } }));
    const one = compileExplicitJudgmentChart(chart(source));
    const two = compileExplicitJudgmentChart(chart(reversed));
    const logical = (compiled: typeof one) => ({
      items: compiled.scoreItems.map(item => [item.kind, item.lane, item.timeMs, item.ordinal, item.weight]),
      bodies: compiled.bodies.map(body => [body.startMs, body.endMs, body.holdCount]),
      connections: compiled.connections.map(c => [c.boundaryMs, c.predecessorHoldCount, c.successorHoldCount]),
    });
    expect(logical(two)).toEqual(logical(one));
    expect(two.scoreItems[0].source.noteIndex).toBe(4);
  });

  it("유지 표식 추가·제거는 바디와 Point·release 항목 및 경계를 바꾸지 않는다", () => {
    const base = compileExplicitJudgmentChart(chart([p(1000), b(1000, 2000), r(2000)]));
    const marked = compileExplicitJudgmentChart(chart([p(1000), b(1000, 2000), r(2000), s(1500)]));
    expect(marked.bodyUnits).toEqual(base.bodyUnits);
    expect(marked.connections).toEqual(base.connections);
    expect(marked.scoreItems.filter(item => item.kind !== "sustain")).toEqual(base.scoreItems);
  });

  it("trill Point·무점수 body는 zone index1을 보존하며 끝 release·holdOnly 점수를 자동 생성하지 않는다", () => {
    const document = chart([p(1000, "trill"), { type: "body", lane: 1, beat: beat(2), endBeat: beat(4), holdCount: 1, trill: true }]);
    document.trillZones = [{ lane: 2, beat: beat(0), endBeat: beat(4) }, { lane: 1, beat: beat(0), endBeat: beat(4) }];
    const compiled = compileExplicitJudgmentChart(document);
    expect(compiled.bodies[0].trillZoneIndex).toBe(1);
    expect(compiled.scoreItems[0]).toMatchObject({ kind: "point", pointKind: "trill", trillZoneIndex: 1 });
    expect(compiled.scoreItems.map(item => item.kind)).toEqual(["point"]);
    expect(compiled.theoreticalWeight).toBe(3);
    expect(compiled.bodyUnits.map(unit => unit.weight)).toEqual([0]);
  });

  const zoneReleases = [0, 1000, 2000].flatMap(at => ([1, 2] as const).flatMap(count =>
    [false, true].flatMap(grace => [false, true].map(attached => ({ at, count, grace, attached })))));
  it.each(zoneReleases)("zone [0,2000ms]의 release $at·count$count·Grace=$grace·바디끝=$attached는 compile을 거부한다", ({ at, count, grace, attached }) => {
    const before: DocumentNoteEntity[] = !attached ? [] : at === 0 ? [p(-1000), b(-1000, 0)] : [
      p(0, "trill"), { type: "body", lane: 1, beat: beat(0), endBeat: beat(at, 500), holdCount: 1, trill: true }];
    const document = chart([...before, r(at, count, 1, grace)]);
    document.trillZones = [{ lane: 1, beat: beat(0), endBeat: beat(4) }];
    expect(() => compileExplicitJudgmentChart(document)).toThrow(ExplicitChartCompileError);
    try { compileExplicitJudgmentChart(document); } catch (error) {
      const validation = (error as ExplicitChartCompileError).validation;
      expect(validation.semantic).toEqual([expect.objectContaining({ rule: "trillExclusive", refs: [{ kind: "note", index: before.length }] })]);
      expect(validation.runtimeIncompatible).toEqual([]);
    }
  });
});

describe("ENJ17·HC81 실행 fixture의 컴파일 단계 증거", () => {
  it("독립 fixture는 삭제한 ENJ-10을 뺀 ENJ-01～18 17건과 HC001～081 81건 ID를 빠짐없이 보존한다", () => {
    expect(explicitEnjFixtures.map(f => f.id)).toEqual(Array.from({ length: 18 }, (_, i) => `ENJ-${String(i + 1).padStart(2, "0")}`)
      .filter(id => id !== "ENJ-10"));
    expect(explicitHcFixtures.map(f => f.id)).toEqual(Array.from({ length: 81 }, (_, i) => `HC${String(i + 1).padStart(3, "0")}`));
    expect(explicitHcFixtures[0].source).toContain("noteJudgmentBodyHeldCountCases.test.ts:74");
    expect(explicitHcFixtures.filter(f => f.expected.scope === "partial").map(f => [f.id, f.expected.assertionNoteIndices]))
      .toEqual([["HC027", [1, 2, 3]]]);
  });
  it.each([...explicitEnjFixtures, ...explicitHcFixtures])("$id의 승인 실행 차트는 명시 항목 수와 이론 가중치가 일치한다 (세션 미실행)", fixture => {
    const compiled = compileExplicitJudgmentChart(fixture.chart);
    expect(compiled.totalJudgments).toBe(fixture.expected.scoreItemCount);
    expect(compiled.theoreticalWeight).toBe(fixture.expected.theoreticalWeight);
    expect(compiled.bodyUnits.every(unit => unit.weight === 0)).toBe(true);
  });

  it("재생 driver는 실제 compiler를 호출하고 동일 raw시각 입력 묶음·관측 시각을 세션 seam에 전달한다", () => {
    const fixture = makeExplicitReplayFixture("ENJ-driver", "driver-contract", [r(1000, 2)],
      [["A", 500, 1000], ["B", 500, 1000]], { scoreItemCount: 2, theoreticalWeight: 6, earnedScore: 6, scope: "whole" });
    const observed = { ...fixture, batches: fixture.batches.map(batch => ({ ...batch, observedAtMs: batch.rawAtMs + 50 })) };
    const processObservedBatch = vi.fn();
    const advance = vi.fn();
    const factory = vi.fn(() => ({ processObservedBatch, advance, result: () => "driver-only" }));
    const output = replayExplicitFixture(observed, factory);
    expect(factory.mock.calls[0]).toEqual([output.compiled, observed]);
    expect(processObservedBatch.mock.calls.map(call => [call[0], call[1].length, call[2]])).toEqual([[500, 2, 550], [1000, 2, 1050]]);
    expect(advance).toHaveBeenCalledWith(fixture.finishAtMs);
    expect(output.result).toBe("driver-only");
  });
});
