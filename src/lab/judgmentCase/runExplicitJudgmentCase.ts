import type { JudgmentWindows } from "../../shared/constants/judgment";
import type { compileExplicitJudgmentChart, ExplicitCompiledChart } from "../../game/judgment/explicitCompiledChart";
import type { ExplicitJudgmentSession, ExplicitSessionResult } from "../../game/judgment/ExplicitJudgmentSession";
import type { ExplicitJudgmentDisplayState, ExplicitJudgmentSnapshot } from "../../game/judgment/ExplicitJudgmentState";
import type { validateChartDocument } from "../../shared/validation/documentValidation";
import type { ExplicitChartCase } from "./explicitChartCase";
import { isMainLane } from "../../shared/chart/laneAxis";
import { formatMs } from "./judgmentCaseLayout";

/** --engine의 저장소가 소유하는 실제 compiler/session과 기본 설정. */
export interface ExplicitCaseEngine {
  compileExplicitJudgmentChart: typeof compileExplicitJudgmentChart;
  ExplicitJudgmentSession: typeof ExplicitJudgmentSession;
  validateChartDocument: typeof validateChartDocument;
  JUDGMENT_WINDOWS: JudgmentWindows;
  MAINTENANCE_GRACE_MS: number;
}

export interface ExplicitCaseRun {
  readonly mode: "explicit";
  readonly compiled: ExplicitCompiledChart | null;
  readonly result: ExplicitSessionResult | null;
  readonly snapshots: readonly ExplicitJudgmentSnapshot[];
  readonly displays: readonly ExplicitJudgmentDisplayState[];
  readonly finalized: boolean;
  readonly validationErrors: readonly { rule: string; message: string }[];
  readonly error: { message: string; atMs: number | null } | null;
  readonly frameMs: number;
  readonly defaults: { readonly windows: JudgmentWindows; readonly maintenanceGraceMs: number };
}

export function runExplicitJudgmentCase(example: ExplicitChartCase, engine: ExplicitCaseEngine,
  options: { frameMs?: number } = {}): ExplicitCaseRun {
  const frameMs = options.frameMs ?? 16;
  if (!Number.isFinite(frameMs) || frameMs <= 0) throw new Error("frameMs는 0보다 큰 유한한 수여야 합니다");
  const validation = engine.validateChartDocument(example.chart);
  const validationErrors = [...validation.structural, ...validation.semantic, ...validation.runtimeIncompatible]
    .map(({ rule, message }) => ({ rule, message }));
  const defaults = { windows: { ...engine.JUDGMENT_WINDOWS }, maintenanceGraceMs: engine.MAINTENANCE_GRACE_MS };
  let compiled: ExplicitCompiledChart | null = null;
  let session: ExplicitJudgmentSession | null = null;
  const snapshots: ExplicitJudgmentSnapshot[] = [];
  let finalized = false;
  let atMs: number | null = null;
  let error: ExplicitCaseRun["error"] = null;
  const capture = () => { if (session) snapshots.push(session.snapshot); };
  try {
    compiled = engine.compileExplicitJudgmentChart(example.chart);
    // 창·유예는 주입하지 않는다. 선택한 엔진의 기본 설정으로 실행한다.
    session = new engine.ExplicitJudgmentSession(compiled);
    const earliest = Math.min(0, ...example.actions.map(action => action.atMs), ...example.notes.map(note => note.startMs));
    let frame = Math.floor(earliest / frameMs) * frameMs;
    for (let i = 0; i < example.actions.length;) {
      const time = example.actions[i].atMs;
      while (frame < time) {
        atMs = frame; session.advance(frame); capture(); frame += frameMs;
      }
      const batch = [];
      while (i < example.actions.length && example.actions[i].atMs === time) {
        const { key, lane, type } = example.actions[i++];
        batch.push({ key, lane, type });
      }
      atMs = time; session.processBatch(time, batch); capture();
      // 다음 frame이 마지막 입력 이전으로 돌아가지 않도록 0ms 격자를 유지한다.
      while (frame <= time) frame += frameMs;
    }
    const tail = Math.max(session.latestJudgmentDeadlineMs, ...example.actions.map(action => action.atMs));
    while (frame <= tail + frameMs) {
      atMs = frame; session.advance(frame); capture(); frame += frameMs;
    }
    atMs = null; session.finalize(); capture(); finalized = true;
  } catch (caught) {
    error = { message: caught instanceof Error ? caught.message : String(caught), atMs };
  }
  const result = session?.result() ?? null;
  // 대표 판정을 다시 계산하지 않고 session이 확정한 같은 groupId의 최종 개정을 쓴다.
  const displayByGroup = new Map<string, ExplicitJudgmentDisplayState>();
  for (const effect of result?.effects ?? []) if (effect.displayUpdate) displayByGroup.set(effect.displayUpdate.groupId, effect.displayUpdate);
  return { mode: "explicit", compiled, result, snapshots, displays: [...displayByGroup.values()], finalized,
    validationErrors, error, frameMs, defaults };
}

export interface ExplicitCaseLabel { readonly atMs: number; readonly text: string; readonly failure: boolean }

export function explicitCaseNoteName(example: ExplicitChartCase, index: number, ordinal: number): string {
  const note = example.chart.notes[index];
  const count = note.type === "body" ? note.holdCount : note.type === "point" ? (note.kind === "double" ? 2 : 1)
    : "count" in note ? note.count : 1;
  return `N${index + 1}${count > 1 ? `u${ordinal + 1}` : ""}`;
}

const gradeLabel = (grade: string | null) => grade === "perfect" ? "Perfect" : grade === "great" ? "Great"
  : grade === "good" ? "Good" : grade === "goodTrill" ? "Good◇" : grade === "miss" ? "Miss" : "없음";

/** 무효화된 provisional 기록을 현재 시작·완료로 표시하지 않는다. */
export function explicitCaseLabels(example: ExplicitChartCase, run: ExplicitCaseRun): ExplicitCaseLabel[] {
  const facts = run.result?.facts ?? [];
  const invalidated = new Set(facts.flatMap(fact => fact.kind === "bodyProgressInvalidated" ? [...fact.invalidatedFactIds] : []));
  const itemById = new Map(run.compiled?.scoreItems.map(item => [item.id, item]) ?? []);
  const unitById = new Map(run.compiled?.bodyUnits.map(unit => [unit.id, unit]) ?? []);
  const itemName = (id: string) => {
    const item = itemById.get(id)!;
    return explicitCaseNoteName(example, item.source.noteIndex, item.ordinal);
  };
  return facts.flatMap((fact): ExplicitCaseLabel[] => {
    let text: string;
    let failure = false;
    if (fact.kind === "settlement") {
      failure = fact.outcome === "dependentZero" || fact.grade === "miss";
      text = `${itemName(fact.itemId)} ${fact.outcome === "dependentZero" ? "종속 0점" : gradeLabel(fact.grade)}`;
      if (fact.rawDeltaMs !== null) text += ` (${fact.rawDeltaMs >= 0 ? "+" : ""}${formatMs(fact.rawDeltaMs)}ms)`;
    } else if (fact.kind === "bodyProgressInvalidated") {
      const unit = unitById.get(fact.bodyUnitId)!;
      text = `${explicitCaseNoteName(example, unit.source.noteIndex, unit.ref.ordinal)} 진행 무효화 (${fact.invalidatedFactIds.join(", ")})`;
    } else if (fact.kind === "bodyStarted" || fact.kind === "bodyCompleted" || fact.kind === "bodyFailed") {
      if (invalidated.has(fact.id)) return [];
      const unit = unitById.get(fact.bodyUnitId)!;
      const unitName = explicitCaseNoteName(example, unit.source.noteIndex, unit.ref.ordinal);
      failure = fact.kind === "bodyFailed";
      text = `${unitName} ${fact.kind === "bodyStarted" ? "시작" : fact.kind === "bodyCompleted" ? "무점수 완료"
        : fact.reason === "startTimeout" ? "시작 실패" : fact.reason === "maintenance" ? "유지 실패" : "Point Miss 종속 실패"}`;
      if (fact.kind !== "bodyFailed" && fact.provisional) text += " (잠정)";
      if (fact.kind === "bodyFailed") text += fact.unscoredMiss ? " · 무점수 Miss" : " · 추가 Miss 없음";
    } else return [];
    return [{ atMs: fact.confirmedAt, text: `${text} @${formatMs(fact.confirmedAt)}`, failure }];
  });
}

export function summarizeExplicitCase(example: ExplicitChartCase, run: ExplicitCaseRun, engineLabel: string): string {
  const result = run.result;
  const score = result?.score;
  const counts = score?.judgmentCounts;
  const lines = [`[${example.title || "(제목 없음)"} | explicit ${result ? "실제 엔진 실행" : "실행 거부(세션 미생성)"} | ${engineLabel}]`,
    counts ? `Perfect ${counts.perfect} · Great ${counts.great} · Good ${counts.good} · Good◇ ${counts.goodTrill} · Miss ${counts.miss}` : "판정·점수 결과 없음(세션 미생성)",
    score ? `점수 ${score.earnedScore}/${score.finalDenominatorWeight} · 달성률 ${score.achievementRate.toFixed(2)}% · 콤보 ${result!.combo} · ${!run.finalized ? "판정 불가(finalize 전)" : score.isFullCombo ? "Full Combo" : "Full Combo 아님"}` : "점수·분모·콤보 계산 불가 · 판정 불가(finalize 전)",
    `점수 항목 ${run.compiled?.totalJudgments ?? "미컴파일"} · 바디 가중치 0 · 미정산 ${result?.snapshot.items.filter(item => item.settlementFactId === null).length ?? "계산 불가"} · 종속 0점 ${result?.snapshot.items.filter(item => item.state === "dependentZero").length ?? "계산 불가"}`,
    `엔진 기본창 Perfect ±${run.defaults.windows.PERFECT} / Great ±${run.defaults.windows.GREAT} / Good ±${run.defaults.windows.GOOD}ms · 유지 유예 ${run.defaults.maintenanceGraceMs}ms · 프레임 ${run.frameMs}ms`];
  lines.push(...example.notes.map(entry => `${entry.id} L${entry.note.lane} ${entry.note.type} ${formatMs(entry.startMs)}${entry.endMs === undefined ? "" : `～${formatMs(entry.endMs)}`}ms`));
  const visible = new Set(example.notes.map(note => note.index));
  lines.push(...example.chart.notes.flatMap((note, index) => visible.has(index) ? []
    : [`N${index + 1} L${note.lane} ${note.type} · ${isMainLane(note.lane) ? "구형 main: explicit 실행 거부" : "aux: 문서 보존·실행 제외"}`]));
  lines.push(...example.inputs.map(input => `L${input.lane}:${input.label} ↓${input.downMs} ↑${input.upMs ?? "계속"}`));
  lines.push(...explicitCaseLabels(example, run).map(label => label.text));
  const itemById = new Map(run.compiled?.scoreItems.map(item => [item.id, item]) ?? []);
  const waitingByItemAndReason = new Map<string, string>();
  for (const snapshot of run.snapshots) for (const item of snapshot.items) {
    if (!item.waitingReason) continue;
    const key = `${item.id}:${item.waitingReason}`;
    if (!waitingByItemAndReason.has(key)) waitingByItemAndReason.set(key,
      `${explicitCaseNoteName(example, item.sourceNoteIndex, item.ordinal)} 대기 ${item.waitingReason} 관측 @${snapshot.atMs}`);
  }
  lines.push(...waitingByItemAndReason.values());
  lines.push(...(result?.snapshot.items.filter(item => item.settlementFactId === null).map(item => {
    const source = itemById.get(item.id)!;
    return `${explicitCaseNoteName(example, source.source.noteIndex, source.ordinal)} 미정산 ${item.state} · ${item.waitingReason ?? "대기 사유 없음"}`;
  }) ?? []));
  lines.push(...(result?.snapshot.bodyUnits.map(unit => {
    const source = run.compiled!.bodyUnits.find(source => source.id === unit.id)!;
    return `${explicitCaseNoteName(example, source.source.noteIndex, source.ref.ordinal)} (${unit.id}) 현재 ${unit.state} · 실제 시작 ${unit.actualStartMs ?? "없음"} · 완료 ${unit.completedAtMs ?? "없음"} · 실패 ${unit.failedAtMs ?? "없음"}`;
  }) ?? []));
  lines.push(...run.displays.map(display => `대표 @${display.confirmedAt}: ${gradeLabel(display.grade)} · ${explicitCaseNoteName(example, display.source.noteIndex, display.source.ordinal)} · timing ${display.timingDeltaMs ?? "없음"}`));
  lines.push(...run.validationErrors.map(issue => `검증 오류 ${issue.rule}: ${issue.message}`));
  if (run.error) lines.push(`엔진 예외 ${run.error.atMs === null ? "컴파일/finalize" : `${run.error.atMs}ms`}: ${run.error.message}`);
  return lines.join("\n");
}
