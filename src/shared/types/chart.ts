/**
 * 차트 데이터 모델 — chart-editor.md 기준
 *
 * 게임 클라이언트와 에디터가 공유하는 차트 JSON 포맷.
 * 구간 엔티티(롱노트·트릴 구간·메시지)는 시작/끝을 하나의 객체로 표현한다.
 */

import type { Beat } from "./beat";
import type { Lane } from "../constants/note";

// ---------------------------------------------------------------------------
// 차트 메타데이터
// ---------------------------------------------------------------------------

export interface ChartMeta {
  /** 곡 제목 */
  title: string;
  /** 아티스트 */
  artist: string;
  /** 난이도 라벨 (EASY / NORMAL / HARD 등) */
  difficultyLabel: string;
  /** 차트 레벨 (Lv.) 수치 */
  difficultyLevel: number;
  /** 자켓 이미지 파일 경로 */
  imageFile: string;
  /** 음원 파일 경로 */
  audioFile: string;
  /** 프리뷰 음원 파일 경로 */
  previewAudioFile: string;
  /** 프리뷰 시작 시간 (초) */
  previewStart?: number;
  /** 프리뷰 끝 시간 (초) */
  previewEnd?: number;
  /** 음원 재생 시작 → 0박까지의 시간 차이 (ms) */
  offsetMs: number;
}

// ---------------------------------------------------------------------------
// 타이밍 마커
// ---------------------------------------------------------------------------

/** BPM 마커 — 해당 박자 이후의 BPM을 정의. 0박에 반드시 존재 */
export interface BpmMarker {
  beat: Beat;
  bpm: number;
}

/**
 * 박자 마커 — 한 마디의 박자 수(beatPerMeasure)를 정의.
 * 마디 0에 반드시 존재. 마디 인덱스로 정의되며, 항상 해당 마디의 첫 박에 위치.
 * beatPerMeasure는 분수(예: 7/2 = 3.5박)를 허용한다.
 */
export interface TimeSignatureMarker {
  measure: number;       // 0-indexed 마디 번호 (정수)
  beatPerMeasure: Beat;
}

// ---------------------------------------------------------------------------
// 노트 엔티티
// ---------------------------------------------------------------------------

/** 포인트 노트 — 위치만 가짐 (싱글 / 더블 / 트릴) */
export interface PointNote {
  type: "single" | "double" | "trill";
  lane: Lane;
  beat: Beat;
  /** Grace 플래그 — Good 윈도우 내 입력 시 항상 Perfect */
  grace?: boolean;
}

/**
 * 구간 노트 — 시작 + 끝을 가짐 (롱노트 바디)
 *
 * 시작(beat)과 끝(endBeat)은 항상 쌍으로 존재한다.
 * endBeat >= beat (역전 불가, 길이 0 허용).
 */
export interface RangeNote {
  type: "long" | "doubleLong" | "trillLong";
  lane: Lane;
  beat: Beat;
  endBeat: Beat;
}

/** 노트 엔티티 유니온 */
export type NoteEntity = PointNote | RangeNote;

/** Grace 노트 여부 확인 — PointNote이면서 grace 플래그가 true */
export function isGraceNote(note: NoteEntity): boolean {
  return !("endBeat" in note) && (note as PointNote).grace === true;
}

// ---------------------------------------------------------------------------
// Extra 노트 (에디터 전용 — 게임에 등장하지 않는 보조 레인)
// ---------------------------------------------------------------------------

/** Extra 포인트 노트 */
export interface ExtraPointNote {
  type: "single" | "double" | "trill";
  extraLane: number; // 1~10
  beat: Beat;
}

/** Extra 구간 노트 */
export interface ExtraRangeNote {
  type: "long" | "doubleLong" | "trillLong";
  extraLane: number; // 1~10
  beat: Beat;
  endBeat: Beat;
}

/** Extra 노트 엔티티 유니온 */
export type ExtraNoteEntity = ExtraPointNote | ExtraRangeNote;

// ---------------------------------------------------------------------------
// 트릴 구간
// ---------------------------------------------------------------------------

/**
 * 트릴 구간 — 트릴 노트가 등장할 수 있는 시각적 영역.
 * 자체는 입력을 요구하지 않는다.
 */
export interface TrillZone {
  lane: Lane;
  beat: Beat;
  endBeat: Beat;
}

// ---------------------------------------------------------------------------
// 차트 이벤트 — 디스크리미네이티드 유니온
// ---------------------------------------------------------------------------

/** BPM 변경 — 시점 이벤트 */
export interface BpmEvent {
  type: "bpm";
  beat: Beat;
  bpm: number;
  editorLane?: number; // editor-only: extra lane position (1-based)
}

/** 박자표 변경 — 시점 이벤트 */
export interface TimeSignatureEvent {
  type: "timeSignature";
  beat: Beat;
  beatPerMeasure: Beat;
  editorLane?: number; // editor-only: extra lane position (1-based)
}

/** 메시지 표시 — 구간 이벤트 */
export interface TextEvent {
  type: "text";
  beat: Beat;
  endBeat: Beat;
  text: string;
  editorLane?: number; // editor-only: extra lane position (1-based)
}

/** 자동 연주 구간 — 구간 이벤트 */
export interface AutoEvent {
  type: "auto";
  beat: Beat;
  endBeat: Beat;
  editorLane?: number; // editor-only: extra lane position (1-based)
}

/** 정지 구간 — 구간 내 싱글/더블/롱노트 배치 금지 */
export interface StopEvent {
  type: "stop";
  beat: Beat;
  endBeat: Beat;
  editorLane?: number; // editor-only: extra lane position (1-based)
}

/** 차트 이벤트 유니온 */
export type ChartEvent = BpmEvent | TimeSignatureEvent | TextEvent | AutoEvent | StopEvent;

/** 구간 이벤트 (beat + endBeat를 가지는 이벤트) */
export type RangeEvent = TextEvent | AutoEvent | StopEvent;

/**
 * @deprecated 하위호환용 — ChartEvent를 사용할 것
 */
export type EventMarker = ChartEvent;

// ---------------------------------------------------------------------------
// 차트 전체
// ---------------------------------------------------------------------------

export interface Chart {
  meta: ChartMeta;
  notes: NoteEntity[];
  trillZones: TrillZone[];
  events: ChartEvent[];
}
