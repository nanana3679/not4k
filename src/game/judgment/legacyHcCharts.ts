import { beat } from "../../shared/types/beat";
import type { NoteEntity, PointNote, RangeNote } from "../../shared/types/chart";

/**
 * HC001～HC081 구형 차트의 고정 사본. 구형 차트 1차 기계 변환(RFD 0037 §8-1)을 손 이관 fixture(explicitHcFixtures)와
 * 대조하려고 noteJudgmentBodyHeldCountCases.test.ts의 각 사례가 play()에 넘긴 노트를 파일 순서대로 옮겼다.
 * 원본처럼 시각은 ms로 적고, explicitHcFixtures와 같은 Beat가 되도록 120 BPM 박(1박 = 500ms)으로 바꾼다.
 * 원본 테스트와 그 기대값은 바꾸지 않는다.
 */
export interface LegacyHcChart {
  readonly id: `HC${string}`;
  /** 원본 사례의 it 줄. explicitHcFixtures의 source와 같다. */
  readonly source: string;
  readonly notes: readonly NoteEntity[];
}

const SOURCE = "src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts";
const point = (atMs: number, type: PointNote["type"] = "single"): PointNote => ({ type, lane: 1, beat: beat(atMs, 500) });
const range = (startMs: number, endMs: number, type: RangeNote["type"] = "long", holdOnly = false): RangeNote =>
  ({ type, lane: 1, beat: beat(startMs, 500), endBeat: beat(endMs, 500), ...(holdOnly ? { holdOnly: true } : {}) });
const chart = (id: LegacyHcChart["id"], line: number, notes: NoteEntity[]): LegacyHcChart => ({ id, source: `${SOURCE}:${line}`, notes });

export const legacyHcCharts: readonly LegacyHcChart[] = [
  chart("HC001", 74, [range(1000, 1500, "long", true), range(1500, 1560), point(1560), range(1560, 1760)]),
  chart("HC002", 83, [range(1000, 3000, "doubleLong")]),
  chart("HC003", 91, [range(1000, 3000, "doubleLong")]),
  chart("HC004", 97, [range(1000, 3000, "doubleLong")]),
  chart("HC005", 104, [range(1000, 1500, "doubleLong", true), range(1500, 2000)]),
  chart("HC006", 110, [point(1000), range(1100, 1200)]),
  chart("HC007", 116, [point(1000), range(1100, 1200)]),
  chart("HC008", 121, [point(1000), range(1100, 1200)]),
  chart("HC009", 128, [range(1000, 2000, "doubleLong"), range(2010, 2060)]),
  chart("HC010", 134, [range(1000, 2000, "doubleLong"), range(2010, 2060)]),
  chart("HC011", 142, [range(1000, 2000)]),
  chart("HC012", 147, [range(1000, 2000)]),
  chart("HC013", 154, [range(1000, 2000), range(2010, 3000)]),
  chart("HC014", 159, [range(1000, 2000), range(2010, 3000)]),
  chart("HC015", 166, [range(1000, 2000, "doubleLong")]),
  chart("HC016", 174, [range(1000, 2000, "doubleLong")]),
  chart("HC017", 181, [range(1000, 2000, "doubleLong"), point(2000), range(2000, 2100, "doubleLong")]),
  chart("HC018", 186, [range(1000, 2000, "doubleLong"), point(2000), range(2000, 2100, "doubleLong")]),
  chart("HC019", 193, [range(1000, 2000), point(2000), range(2000, 2060)]),
  chart("HC020", 199, [range(1000, 2000), point(2000), range(2000, 2060)]),
  chart("HC021", 204, [range(1000, 2000), point(2000), range(2000, 2060)]),
  chart("HC022", 210, [range(1000, 2000), point(2000), range(2000, 2200)]),
  chart("HC023", 217, [range(1000, 2000), point(2000), range(2000, 3000)]),
  chart("HC024", 224, [range(1000, 2000), point(2000), range(2000, 3000)]),
  chart("HC025", 229, [range(1000, 2000), point(2000), range(2000, 3000)]),
  chart("HC026", 234, [range(1000, 2000), point(2000), range(2000, 3000)]),
  chart("HC027", 240, [range(1000, 2000), point(2000), range(2000, 3000)]),
  chart("HC028", 247, [range(1000, 2000, "doubleLong"), point(2000), range(2000, 2100, "doubleLong")]),
  chart("HC029", 253, [range(1000, 2000, "doubleLong"), point(2000), range(2000, 3000)]),
  chart("HC030", 261, [range(1000, 2000, "doubleLong"), point(2000), range(2000, 2100, "doubleLong")]),
  chart("HC031", 266, [range(1000, 2000, "doubleLong"), point(2000), range(2000, 2100, "doubleLong")]),
  chart("HC032", 276, [range(1000, 2000, "doubleLong"), point(2000, "double"), range(2000, 2100, "doubleLong")]),
  chart("HC033", 282, [range(1000, 2000, "doubleLong"), point(2000, "double"), range(2000, 2100, "doubleLong")]),
  chart("HC034", 287, [range(1000, 2000, "doubleLong"), point(2000, "double"), range(2000, 2100, "doubleLong")]),
  chart("HC035", 294, [range(1000, 2000), point(2000), range(2000, 3000)]),
  chart("HC036", 301, [range(1000, 2000), point(2000), range(2000, 3000)]),
  chart("HC037", 309, [range(1000, 2000), point(2000), range(2000, 3000)]),
  chart("HC038", 316, [range(1000, 2000, "doubleLong"), point(2000), range(2000, 3000, "doubleLong")]),
  chart("HC039", 321, [range(1000, 2000, "doubleLong"), point(2000), range(2000, 3000, "doubleLong")]),
  chart("HC040", 327, [range(1000, 2000, "doubleLong"), point(2000), range(2000, 3000, "doubleLong")]),
  chart("HC041", 334, [range(1000, 2000), point(2000), range(2000, 2060)]),
  chart("HC042", 339, [range(1000, 2000, "doubleLong"), point(2000), range(2000, 2060, "doubleLong")]),
  chart("HC043", 349, [range(1000, 2000), range(2000, 3000, "doubleLong")]),
  chart("HC044", 354, [range(1000, 2000), range(2000, 3000, "doubleLong")]),
  chart("HC045", 358, [range(1000, 2000), range(2000, 3000, "doubleLong")]),
  chart("HC046", 362, [range(1000, 2000), range(2000, 3000, "doubleLong")]),
  chart("HC047", 367, [range(1000, 2000), point(2000), range(2000, 3000, "doubleLong")]),
  chart("HC048", 376, [range(1000, 2000, "doubleLong"), range(2000, 3000)]),
  chart("HC049", 380, [range(1000, 2000, "doubleLong"), range(2000, 3000)]),
  chart("HC050", 384, [range(1000, 2000, "doubleLong"), range(2000, 3000)]),
  chart("HC051", 391, [range(1000, 2000, "doubleLong"), point(2000), range(2000, 3000)]),
  chart("HC052", 397, [range(1000, 2000, "doubleLong"), point(2000), range(2000, 3000)]),
  chart("HC053", 403, [range(1000, 2000, "doubleLong"), point(2000), range(2000, 3000)]),
  chart("HC054", 409, [range(1000, 2000, "doubleLong"), point(2000), range(2000, 3000)]),
  chart("HC055", 415, [range(1000, 2000, "doubleLong"), point(2000), range(2000, 3000)]),
  chart("HC056", 421, [range(1000, 2000, "doubleLong"), point(2000), range(2000, 2060)]),
  chart("HC057", 427, [range(1000, 2000, "doubleLong"), point(2000), range(2000, 2060)]),
  chart("HC058", 433, [range(1000, 2000, "doubleLong"), point(2000), range(2000, 2060)]),
  chart("HC059", 439, [range(1000, 2000, "doubleLong"), point(2000), range(2000, 2200)]),
  chart("HC060", 446, [range(1000, 2000, "doubleLong"), range(2000, 2050), point(2050), range(2050, 3000)]),
  chart("HC061", 451, [range(1000, 1950, "doubleLong"), point(1950), range(1950, 2000, "doubleLong"), range(2000, 3000)]),
  chart("HC062", 457, [range(1000, 1950, "doubleLong"), point(1950), range(1950, 2000, "doubleLong"), range(2000, 3000)]),
  chart("HC063", 462, [range(1000, 1950, "doubleLong"), point(1950), range(1950, 2000, "doubleLong"), range(2000, 3000)]),
  chart("HC064", 470, [range(1000, 2000, "long", true), range(2000, 2160)]),
  chart("HC065", 476, [range(1000, 2000, "doubleLong"), point(2000), range(2000, 2060, "long", true)]),
  chart("HC066", 481, [range(1000, 1950, "doubleLong"), point(1950), range(1950, 2000, "doubleLong", true), range(2000, 3000)]),
  chart("HC067", 492, [range(1000, 2000, "doubleLong", true), range(2000, 3000)]),
  chart("HC068", 496, [range(1000, 2000, "doubleLong", true), range(2000, 3000)]),
  chart("HC069", 500, [range(1000, 1125, "doubleLong", true), range(1125, 1250), range(1250, 1375, "doubleLong", true), range(1375, 1750)]),
  chart("HC070", 510, [point(1000), range(1100, 1500)]),
  chart("HC071", 514, [point(1000), range(1100, 1500)]),
  chart("HC072", 518, [point(1000), range(1100, 1500)]),
  chart("HC073", 523, [point(1000), range(1100, 1500)]),
  chart("HC074", 528, [range(1000, 2000), range(2000, 3000, "doubleLong")]),
  chart("HC075", 537, [point(1000), range(1010, 1500, "long", true)]),
  chart("HC076", 541, [point(1000), range(1010, 1500, "long", true)]),
  chart("HC077", 547, [range(1000, 2000, "long", true), range(2000, 3000)]),
  chart("HC078", 553, [range(1000, 2000), range(2000, 3000, "doubleLong")]),
  chart("HC079", 560, [range(1000, 2000), point(2000), range(2000, 3000)]),
  chart("HC080", 564, [range(1000, 2000, "doubleLong"), point(2000, "double"), range(2000, 2100, "doubleLong")]),
  chart("HC081", 573, [range(1000, 1500), point(1500), range(1500, 1560)]),
];
