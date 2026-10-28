import type { Beat } from "../types/beat";
import type { DocumentNoteEntity, NoteEntity } from "../types/chart";
import { isExplicitNote } from "../types/chart";
import { beatEq, beatGt, beatLt, beatLte, isWellFormedBeat } from "../types/beat";
import { isMainLane } from "../chart/laneAxis";
import { deriveExplicitNoteRelations } from "../chart/explicitNoteRelations";
import { parseDocumentNote } from "../chart/noteDocument";
import type { ExplicitNoteRelations } from "../chart/explicitNoteRelations";
import type { ChartValidationInput, ValidationError, ValidationRef } from "./index";
import {
  validateChartStructural, validateNoDuplicates, validateNoLongOverlap,
  validateNoteJudgmentConstraints, validateTrillExclusive, validateTrillLong,
  validateNoTrillZoneOverlap, validateNoRestZoneOverlap, validateRestZoneExclusive,
  validateNoEventDuplicate, validateNoEventOverlap, validateNoTutorialInputOverlap,
  validateStopZones, validateTimeSigAtMeasureStart,
} from "./index";

export interface ChartDocumentValidationInput extends Omit<ChartValidationInput, "notes"> {
  readonly notes: readonly DocumentNoteEntity[];
}

export interface ExplicitRuntimeCompatibilityError {
  readonly rule: "legacyGameContent";
  readonly message: string;
  readonly refs: readonly ValidationRef[];
}

const noteRef = (index: number): ValidationRef => ({ kind: "note", index });

/** 위치만 읽는 기존 검사로 1:1 투영한다. 저장·판정·구형 제약에는 사용하지 않는다. */
function geometryNotes(notes: readonly DocumentNoteEntity[]): NoteEntity[] {
  return notes.map(note => {
    if (note.type === "body") return { type: note.trill ? "trillLong" : "long", lane: note.lane,
      beat: note.beat, endBeat: note.endBeat };
    if (note.type === "tap") return { type: note.kind, lane: note.lane, beat: note.beat };
    if (note.type === "release" || note.type === "tick") return { type: "single", lane: note.lane, beat: note.beat };
    return note;
  });
}

/**
 * 구형 범위가 소유한 제약(holdOnly 끝·길이 0 head·같은 unit 연결 head·트릴 head)을 위한 보기.
 * 구형 항목은 그대로 두고 탭 노트만 같은 kind의 구형 Point로 인식한다. 명시 바디·릴리즈·틱은
 * 구형 의미로 다시 해석하지 않으므로 넣지 않는다. indices는 문서 원본 index다.
 */
function legacyRangeConstraintView(notes: readonly DocumentNoteEntity[]): { notes: NoteEntity[]; indices: number[] } {
  const view: NoteEntity[] = [];
  const indices: number[] = [];
  notes.forEach((note, index) => {
    if (!isExplicitNote(note)) view.push(note);
    else if (note.type === "tap") view.push({ type: note.kind, lane: note.lane, beat: note.beat });
    else return;
    indices.push(index);
  });
  return { notes: view, indices };
}

function remapErrors(errors: ValidationError[], indices: readonly number[]): ValidationError[] {
  return errors.map(error => ({ ...error,
    message: error.message.replace(/notes (\d+), (\d+)/g, (_, a: string, b: string) => `notes ${indices[Number(a)]}, ${indices[Number(b)]}`),
    refs: error.refs?.map(ref => ref.kind === "note" ? noteRef(indices[ref.index]) : ref),
  }));
}

export function validateChartDocumentStructural(input: ChartDocumentValidationInput): ValidationError[] {
  const errors: ValidationError[] = [];
  const safeIndices: number[] = [];
  input.notes.forEach((note, index) => {
    if (!note || typeof note !== "object" || Array.isArray(note)) {
      errors.push({ rule: "noteMalformed", message: "노트가 객체가 아닙니다", refs: [noteRef(index)] });
      return;
    }
    // 소수 분자는 저장 문자열 왕복에서 다른 박으로 바뀌므로 codec 검사 전에 거부한다.
    if (!isWellFormedBeat(note.beat) || ("endBeat" in note && !isWellFormedBeat(note.endBeat))) {
      errors.push({ rule: "beatMalformed", message: "노트의 시작·끝 Beat가 유효하지 않습니다", refs: [noteRef(index)] });
      return;
    }
    // C1 codec의 종류별 허용 필드·속성을 그대로 검사한다. 반환값으로 원본을 교체하지 않는다.
    // body.holdOnly/grace·tick.grace 등도 저장 시 조용히 유실되기 전에 거부한다.
    try {
      parseDocumentNote({ ...note, beat: `${note.beat.n}/${note.beat.d}`,
        ...("endBeat" in note ? { endBeat: `${note.endBeat.n}/${note.endBeat.d}` } : {}) }, 4);
    } catch {
      errors.push({ rule: "noteMalformed", message: "노트의 종류·수량·속성이 파일 형식과 맞지 않습니다", refs: [noteRef(index)] });
      // 레인 오류의 기존 구체 진단도 유지한다.
      if (typeof note.lane !== "number" || !Number.isFinite(note.lane)) {
        errors.push({ rule: "laneMalformed", message: "노트의 레인이 유효하지 않습니다", refs: [noteRef(index)] });
      }
      return;
    }
    safeIndices.push(index);
  });
  errors.push(...remapErrors(validateChartStructural({ ...input,
    notes: geometryNotes(safeIndices.map(index => input.notes[index])) }), safeIndices));
  return errors;
}

/** 구형 존재 자체는 저장 위반이 아니다. 보조 레인은 새 게임 실행 대상에서도 제외한다. */
export function validateExplicitRuntimeCompatibility(input: Pick<ChartDocumentValidationInput, "notes">): ExplicitRuntimeCompatibilityError[] {
  return input.notes.flatMap((note, index) => note && typeof note === "object" && !isExplicitNote(note) && isMainLane(note.lane)
    ? [{ rule: "legacyGameContent" as const, message: "새 재생 전에 구형 게임 노트를 수리해야 합니다", refs: [noteRef(index)] }] : []);
}

export function validateChartDocumentSemantic(
  input: ChartDocumentValidationInput,
  relations: ExplicitNoteRelations = deriveExplicitNoteRelations(input.notes),
): ValidationError[] {
  const { notes, trillZones, events } = input;
  const restZones = input.restZones ?? [];
  const legacyIndices = notes.flatMap((note, index) => !isExplicitNote(note) ? [index] : []);
  const legacy = legacyIndices.map(index => notes[index]).filter((note): note is NoteEntity => !isExplicitNote(note));
  // 혼합 쌍의 중복·겹침·zone 배타는 아래 명시 쌍 검사가 맡으므로 구형 부분집합만 넘긴다.
  const errors = remapErrors([
    ...validateNoDuplicates(legacy), ...validateNoLongOverlap(legacy),
    ...validateTrillExclusive(legacy, trillZones),
  ], legacyIndices);
  // 구형 범위의 Point 관련 제약은 탭 노트로 바꾼 항목도 Point로 보고 검사한다.
  const legacyRangeView = legacyRangeConstraintView(notes);
  errors.push(...remapErrors([
    ...validateTrillLong(legacyRangeView.notes), ...validateNoteJudgmentConstraints(legacyRangeView.notes),
  ], legacyRangeView.indices));
  const geometry = geometryNotes(notes);
  errors.push(...validateNoTrillZoneOverlap(trillZones), ...validateNoRestZoneOverlap(restZones),
    ...validateRestZoneExclusive(geometry, trillZones, restZones), ...validateStopZones(geometry, events),
    ...validateNoEventDuplicate(events), ...validateNoEventOverlap(events),
    ...validateNoTutorialInputOverlap(events), ...validateTimeSigAtMeasureStart(events));
  // RFD 0038: 명시 릴리즈도 같은 레인 zone 양 끝을 포함한 일반 노트 배타를 따른다.
  const explicitZoneIndices = notes.flatMap((note, index) => isExplicitNote(note) ? [index] : []);
  errors.push(...remapErrors(validateTrillExclusive(explicitZoneIndices.map(index => geometry[index]), trillZones), explicitZoneIndices));

  const add = (rule: ValidationError["rule"], message: string, ...indices: number[]) =>
    errors.push({ rule, message, refs: indices.map(noteRef) });
  for (let i = 0; i < notes.length; i++) {
    const a = notes[i];
    for (let j = i + 1; j < notes.length; j++) {
      const b = notes[j];
      if (a.lane !== b.lane || (!isExplicitNote(a) && !isExplicitNote(b))) continue;
      if (!("endBeat" in a) && !("endBeat" in b) && beatEq(a.beat, b.beat)) {
        const meaning = (note: DocumentNoteEntity) => note.type === "release" || note.type === "tick" ? note.type : "tap";
        add(meaning(a) === meaning(b) ? "duplicate" : "scoreOverlap", "같은 위치에 점수 노트를 겹칠 수 없습니다", i, j);
      }
      if ("endBeat" in a && "endBeat" in b) {
        if (beatEq(a.beat, b.beat) || (!beatEq(a.beat, a.endBeat) && !beatEq(b.beat, b.endBeat) && beatEq(a.endBeat, b.endBeat))) {
          add("duplicate", "같은 레인 바디의 시작 또는 끝이 중복됩니다", i, j);
        } else if (beatLt(a.beat, b.endBeat) && beatLt(b.beat, a.endBeat)) {
          add("longOverlap", "같은 레인의 바디 구간이 겹칩니다", i, j);
        }
      }
      // 구형 바디의 내부 금지는 혼합 문서에서도 구형 의미로 보존한다.
      for (const [range, other] of [[a, b], [b, a]]) {
        if (!isExplicitNote(range) && "endBeat" in range) {
          const positions = "endBeat" in other ? [other.beat, other.endBeat] : [other.beat];
          if (positions.some(at => beatGt(at, range.beat) && beatLt(at, range.endBeat))) {
            add("longOverlap", "구형 롱노트 바디 내부에 다른 노트가 있습니다", i, j);
          }
        }
      }
    }

    if (a.type === "body" && a.trill && isMainLane(a.lane)) {
      const hasTrillTap = relations.bodyByNote.get(i)?.startTapIndices.some(index => {
        const tap = notes[index];
        return tap.type === "tap" && tap.kind === "trill";
      });
      if (beatEq(a.beat, a.endBeat) || !hasTrillTap) {
        add("trillLongInvalid", "트릴 바디는 양수 길이와 시작 트릴 탭 노트가 필요합니다", i);
      }
    }

    if (a.type === "body" && beatEq(a.beat, a.endBeat)) {
      notes.forEach((other, j) => {
        if ((other.type === "tap" || other.type === "release" || (!isExplicitNote(other) && !("endBeat" in other)))
          && other.lane === a.lane && beatEq(other.beat, a.beat)) add("zeroLengthBodyOverlap", "길이 0 바디에는 탭·릴리즈를 겹칠 수 없습니다", i, j);
      });
    }
    if (a.type === "release") {
      const containing = notes.flatMap((body, index) => "endBeat" in body && body.lane === a.lane
        && beatLte(body.beat, a.beat) && beatLt(a.beat, body.endBeat) ? [index] : []);
      // 앞 바디 끝과 뒤 시작의 공유 경계는 끝점이므로 허용한다.
      const atEnd = notes.some(body => "endBeat" in body && body.lane === a.lane && beatEq(body.endBeat, a.beat));
      if (containing.length && !atEnd) add("releasePlacement", "릴리즈는 바디 끝 또는 바디 밖에 놓아야 합니다", i, ...containing);
    }
    if (a.type === "tick") {
      const ownerIndex = relations.tickBodyByNote.get(i);
      const owner = ownerIndex === undefined ? undefined : relations.bodyByNote.get(ownerIndex);
      if (!owner) add("tickPlacement", "틱 노트의 소속 바디가 없거나 유일하지 않습니다", i,
        ...(relations.tickBodyCandidatesByNote.get(i) ?? []));
      else {
        if (a.count !== owner.note.holdCount) add("tickCount", "틱 노트 수량은 소속 바디의 hold 수와 같아야 합니다", i, owner.noteIndex);
        if (owner.note.trill) add("tickPlacement", "트릴 바디에는 틱 노트를 놓을 수 없습니다", i, owner.noteIndex);
        const equalConnections = relations.connections.filter(c => c.successorIndex === owner.noteIndex
          && c.predecessorHoldCount === c.successorHoldCount && beatEq(c.beat, a.beat));
        for (const connection of equalConnections) add("tickPlacement", "같은 hold 수 연결점에는 틱 노트를 놓을 수 없습니다",
          i, connection.predecessorIndex, connection.successorIndex);
      }
    }
  }

  // 같은 hold 수·같은 트릴 여부(일반 → 일반, 트릴 → 트릴)로 맞닿은 바디는 한 바디와 구별되지 않으므로
  // 경계에 탭 노트나 릴리즈가 있어야 한다. 트릴 바디와 일반 바디는 모양이 달라 구별되므로 어느 방향이든 대상이 아니다.
  // 길이 0 뒤 바디도 포함하며, 그 위의 탭·릴리즈는 zeroLengthBodyOverlap이 따로 막는다.
  // 구형 롱노트는 relations.connections에 들어오지 않아 대상이 아니다.
  // 경계와 같은 레인·같은 박에 놓인 구형 Point(type single·double·trill)도 경계의 탭 노트로 인정해
  // 일부만 옮긴 혼합 문서를 저장할 수 있게 한다.
  // 구형 롱노트(holdOnly·길이 0 포함)는 경계의 탭 노트로 인정하지 않는다. 메인 레인 구형 Point의 새 재생 차단은 legacyGameContent가 맡는다.
  const isJointNote = (note: DocumentNoteEntity) => note.type === "tap" || note.type === "release"
    || note.type === "single" || note.type === "double" || note.type === "trill";
  const hasJointNoteAt = (lane: number, at: Beat) =>
    notes.some(note => isJointNote(note) && note.lane === lane && beatEq(note.beat, at));
  for (const connection of relations.connections) {
    if (connection.predecessorHoldCount !== connection.successorHoldCount) continue;
    const predecessor = relations.bodyByNote.get(connection.predecessorIndex)?.note;
    const successor = relations.bodyByNote.get(connection.successorIndex)?.note;
    if (!predecessor || !successor || Boolean(predecessor.trill) !== Boolean(successor.trill)) continue;
    // 메인 레인 트릴 → 트릴 경계의 시작 트릴 탭 노트 누락은 trillLongInvalid가 이미 보고하므로 겹쳐 내지 않는다.
    if (successor.trill && isMainLane(connection.lane)) continue;
    if (hasJointNoteAt(connection.lane, connection.beat)) continue;
    add("sameHoldCountConnectionWithoutTapOrRelease", "같은 hold 수로 맞닿은 바디 경계에는 탭 노트나 릴리즈가 필요합니다",
      connection.predecessorIndex, connection.successorIndex);
  }
  return errors;
}

export interface ChartDocumentValidation {
  readonly structural: readonly ValidationError[];
  readonly semantic: readonly ValidationError[];
  readonly runtimeIncompatible: readonly ExplicitRuntimeCompatibilityError[];
  readonly relations: ExplicitNoteRelations;
  readonly canSave: boolean;
  readonly canPlayExplicit: boolean;
}

export function validateChartDocument(input: ChartDocumentValidationInput): ChartDocumentValidation {
  const structural = validateChartDocumentStructural(input);
  const relations = deriveExplicitNoteRelations(structural.length ? [] : input.notes);
  // 구조 오류를 의미 오류로 덮거나 잘못된 Beat를 의미 검사에 전달하지 않는다.
  const semantic = structural.length ? [] : validateChartDocumentSemantic(input, relations);
  const runtimeIncompatible = structural.length ? [] : validateExplicitRuntimeCompatibility(input);
  const canSave = structural.length === 0 && semantic.length === 0;
  return { structural, semantic, runtimeIncompatible, relations, canSave,
    canPlayExplicit: canSave && runtimeIncompatible.length === 0 };
}
