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
// 이벤트 마커
// ---------------------------------------------------------------------------

/**
 * 이벤트 마커 — 복합(composable) 구조.
 * 하나의 마커에 메시지/BPM 변경/박자표 변경을 조합할 수 있다.
 * 모든 역할 필드는 optional; 최소 하나 이상 존재해야 유효하다.
 * 겹침 금지 (끝-시작 인접은 허용).
 */
export interface EventMarker {
  beat: Beat;
  endBeat: Beat;
  /** 메시지 텍스트 (선택) */
  text?: string;
  /** BPM 변경 (선택) */
  bpm?: number;
  /** 박자표 변경 (선택) */
  beatPerMeasure?: Beat;
  /** 정지 구간 — 구간 내 싱글/더블/롱노트 배치 금지 (선택) */
  stop?: true;
}

// ---------------------------------------------------------------------------
// 차트 전체
// ---------------------------------------------------------------------------

export interface Chart {
  meta: ChartMeta;
  notes: NoteEntity[];
  trillZones: TrillZone[];
  events: EventMarker[];
}
