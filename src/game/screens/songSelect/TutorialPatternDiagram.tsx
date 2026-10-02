import type { CSSProperties, ReactNode } from 'react';
import type { TutorialDiagramId } from '../../../shared/types';
import { font, color, radius } from '../../../shared/theme';
import {
  COLORS as EDITOR_COLORS,
  LANE_WIDTH as EDITOR_LANE_WIDTH,
  NOTE_HEIGHT as EDITOR_NOTE_HEIGHT,
} from '../../../editor/timeline/constants';

export const TUTORIAL_PATTERN_DIAGRAM_MIN_HEIGHT = 350;
const EDITOR_DIAGRAM_SCALE = 1.6;
export const TUTORIAL_PATTERN_DIAGRAM_NOTE_SCALE = 0.5;
const EDITOR_DIAGRAM_VIEWBOX_HEIGHT = 62;
const EDITOR_DIAGRAM_LANE_PAD_Y = 10;
const EDITOR_DIAGRAM_TRACK_HEIGHT = EDITOR_DIAGRAM_VIEWBOX_HEIGHT - EDITOR_DIAGRAM_LANE_PAD_Y * 2;
const TUTORIAL_PATTERN_DIAGRAM_LANE_WIDTH = EDITOR_LANE_WIDTH * EDITOR_DIAGRAM_SCALE;
export const TUTORIAL_PATTERN_DIAGRAM_NOTE_WIDTH =
  TUTORIAL_PATTERN_DIAGRAM_LANE_WIDTH * TUTORIAL_PATTERN_DIAGRAM_NOTE_SCALE;
export const TUTORIAL_PATTERN_DIAGRAM_NOTE_HEIGHT =
  EDITOR_NOTE_HEIGHT * EDITOR_DIAGRAM_SCALE * TUTORIAL_PATTERN_DIAGRAM_NOTE_SCALE;
const DIAGRAM_LANE_HEIGHT = EDITOR_DIAGRAM_VIEWBOX_HEIGHT * EDITOR_DIAGRAM_SCALE;
const EDITOR_DIAGRAM_NOTE_WIDTH = EDITOR_LANE_WIDTH * TUTORIAL_PATTERN_DIAGRAM_NOTE_SCALE;
const EDITOR_DIAGRAM_NOTE_HEIGHT = EDITOR_NOTE_HEIGHT * TUTORIAL_PATTERN_DIAGRAM_NOTE_SCALE;
const EDITOR_DIAGRAM_NOTE_X = (EDITOR_LANE_WIDTH - EDITOR_DIAGRAM_NOTE_WIDTH) / 2;

type DiagramPatternKind = 'long-short' | 'long-short-top' | 'long-full' | 'tap-offset' | 'connected';
type DiagramPatternAlignment = 'bottom' | 'top' | 'full' | 'center' | 'split';

interface DiagramPatternDefinition {
  kind: DiagramPatternKind;
  ariaLabel: string;
}

interface TutorialPatternDiagramDefinition {
  ariaLabel: string;
  left: DiagramPatternDefinition;
  right: DiagramPatternDefinition;
  result: DiagramPatternDefinition;
}

export const TUTORIAL_PATTERN_DIAGRAMS: Record<TutorialDiagramId, TutorialPatternDiagramDefinition> = {
  'connected-switch': {
    ariaLabel: 'o- + o- = o-o-',
    left: { kind: 'long-short', ariaLabel: 'o-' },
    right: { kind: 'long-short-top', ariaLabel: 'o-' },
    result: { kind: 'connected', ariaLabel: 'o-o-' },
  },
  'connected-overlap': {
    ariaLabel: 'o--- + .o.. = o-o-',
    left: { kind: 'long-full', ariaLabel: 'o---' },
    right: { kind: 'tap-offset', ariaLabel: '.o..' },
    result: { kind: 'connected', ariaLabel: 'o-o-' },
  },
};

interface TutorialPatternDiagramProps {
  diagramId: TutorialDiagramId;
}

export function TutorialPatternDiagram({ diagramId }: TutorialPatternDiagramProps) {
  const definition = TUTORIAL_PATTERN_DIAGRAMS[diagramId];

  return (
    <div
      data-tutorial-diagram-id={diagramId}
      data-tutorial-diagram-layout="one-line-equation"
      aria-label={definition.ariaLabel}
      style={styles.diagram}
    >
      <div style={styles.equationRow}>
        <DiagramPattern diagramId={diagramId} name="left" definition={definition.left} />
        <span data-tutorial-diagram-term="+" data-tutorial-diagram-term-size="large" style={styles.term}>+</span>
        <DiagramPattern diagramId={diagramId} name="right" definition={definition.right} />
        <span data-tutorial-diagram-term="=" data-tutorial-diagram-term-size="large" style={styles.term}>=</span>
        <DiagramPattern diagramId={diagramId} name="result" definition={definition.result} />
      </div>
    </div>
  );
}

function DiagramPattern({
  diagramId,
  name,
  definition,
}: {
  diagramId: TutorialDiagramId;
  name: 'left' | 'right' | 'result';
  definition: DiagramPatternDefinition;
}) {
  const gradientId = `tutorial-${diagramId}-${name}-editor-long-gradient`;

  return (
    <div
      data-tutorial-diagram-pattern={name}
      data-tutorial-diagram-align={getPatternAlignment(definition.kind)}
      aria-label={definition.ariaLabel}
      style={styles.pattern}
    >
      <PatternLane gradientId={gradientId}>
        {renderPatternAssets(definition.kind, gradientId)}
      </PatternLane>
    </div>
  );
}

function PatternLane({ gradientId, children }: { gradientId: string; children: ReactNode }) {
  const gradientStops = getEditorBodyGradientStops(EDITOR_COLORS.SINGLE_LONG);

  return (
    <svg
      data-tutorial-diagram-renderer="editor-note-renderer"
      data-tutorial-diagram-editor-source="src/editor/timeline/NoteRenderer.ts"
      data-tutorial-diagram-time-direction="up"
      viewBox={`0 0 ${EDITOR_LANE_WIDTH} ${EDITOR_DIAGRAM_VIEWBOX_HEIGHT}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      style={styles.lane}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0.5" x2="1" y2="0.5">
          <stop offset="0" stopColor={gradientStops.light} />
          <stop offset="0.5" stopColor={gradientStops.base} />
          <stop offset="1" stopColor={gradientStops.light} />
        </linearGradient>
      </defs>
      <rect
        data-editor-range-layer="lane-background"
        x="0"
        y="0"
        width={EDITOR_LANE_WIDTH}
        height={EDITOR_DIAGRAM_VIEWBOX_HEIGHT}
        rx="1.5"
        fill={toHexColor(EDITOR_COLORS.LANE_BG_EVEN)}
      />
      {children}
      <rect
        x="0"
        y="0"
        width={EDITOR_LANE_WIDTH}
        height={EDITOR_DIAGRAM_VIEWBOX_HEIGHT}
        rx="1.5"
        fill="none"
        stroke="rgba(255,255,255,0.18)"
        strokeWidth="0.75"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function renderPatternAssets(kind: DiagramPatternKind, gradientId: string) {
  switch (kind) {
    case 'long-short':
      return <EditorRangeNote startSlot={0} endSlot={2} gradientId={gradientId} />;
    case 'long-short-top':
      return <EditorRangeNote startSlot={2} endSlot={4} gradientId={gradientId} />;
    case 'long-full':
      return <EditorRangeNote startSlot={0} endSlot={4} gradientId={gradientId} />;
    case 'tap-offset':
      return <EditorPointNote slot={2} />;
    case 'connected':
      return (
        <>
          <EditorRangeNote startSlot={0} endSlot={2} gradientId={gradientId} />
          <EditorRangeNote startSlot={2} endSlot={4} gradientId={gradientId} />
        </>
      );
  }
}

function getPatternAlignment(kind: DiagramPatternKind): DiagramPatternAlignment {
  switch (kind) {
    case 'long-short':
      return 'bottom';
    case 'long-short-top':
      return 'top';
    case 'long-full':
      return 'full';
    case 'tap-offset':
      return 'center';
    case 'connected':
      return 'split';
  }
}

function EditorRangeNote({
  startSlot,
  endSlot,
  gradientId,
}: {
  startSlot: number;
  endSlot: number;
  gradientId: string;
}) {
  const startY = slotToY(startSlot);
  const endY = slotToY(endSlot);
  const topY = Math.min(startY, endY);
  const bottomY = Math.max(startY, endY);
  const bodyTopY = topY - EDITOR_DIAGRAM_NOTE_HEIGHT / 2;
  const bodyBottomY = bottomY - EDITOR_DIAGRAM_NOTE_HEIGHT / 2;
  const bodyHeight = bodyBottomY - bodyTopY;
  const fill = `url(#${gradientId})`;

  return (
    <>
      {bodyHeight > 0 && (
        <rect
          data-editor-range-layer="body"
          data-editor-range-end-rendering="body"
          data-editor-note-type="long"
          data-editor-note-scale={TUTORIAL_PATTERN_DIAGRAM_NOTE_SCALE}
          x={EDITOR_DIAGRAM_NOTE_X}
          y={bodyTopY}
          width={EDITOR_DIAGRAM_NOTE_WIDTH}
          height={bodyHeight}
          fill={fill}
        />
      )}
      <rect
        data-editor-range-layer="head"
        data-editor-note-type="long"
        data-editor-note-scale={TUTORIAL_PATTERN_DIAGRAM_NOTE_SCALE}
        x={EDITOR_DIAGRAM_NOTE_X}
        y={startY - EDITOR_DIAGRAM_NOTE_HEIGHT / 2}
        width={EDITOR_DIAGRAM_NOTE_WIDTH}
        height={EDITOR_DIAGRAM_NOTE_HEIGHT}
        fill={fill}
      />
      <EditorPointNote slot={startSlot} pointType="long-head" />
    </>
  );
}

function EditorPointNote({
  slot,
  pointType = 'single',
}: {
  slot: number;
  pointType?: 'single' | 'long-head';
}) {
  const y = slotToY(slot);

  return (
    <rect
      data-editor-point-note={pointType}
      data-editor-note-scale={TUTORIAL_PATTERN_DIAGRAM_NOTE_SCALE}
      x={EDITOR_DIAGRAM_NOTE_X}
      y={y - EDITOR_DIAGRAM_NOTE_HEIGHT / 2}
      width={EDITOR_DIAGRAM_NOTE_WIDTH}
      height={EDITOR_DIAGRAM_NOTE_HEIGHT}
      fill={toHexColor(EDITOR_COLORS.SINGLE_NOTE)}
    />
  );
}

function slotToY(slot: number): number {
  return EDITOR_DIAGRAM_LANE_PAD_Y + ((4 - slot) / 4) * EDITOR_DIAGRAM_TRACK_HEIGHT;
}

function getEditorBodyGradientStops(color: number): { light: string; base: string } {
  return {
    light: toHexColor(lightenEditorColor(color, 0.7)),
    base: toHexColor(color),
  };
}

function lightenEditorColor(color: number, amount: number): number {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const lr = Math.round(r + (255 - r) * amount);
  const lg = Math.round(g + (255 - g) * amount);
  const lb = Math.round(b + (255 - b) * amount);
  return (lr << 16) | (lg << 8) | lb;
}

function toHexColor(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

const styles: Record<string, CSSProperties> = {
  diagram: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0',
    width: '100%',
    // 반응형: 부모(도식 패널) 높이를 채우되 넘치지 않고, 큰 화면에선 350px를 상한으로.
    // 고정 min-height를 두면 짧은 모바일 카드에서 넘쳐 OK 버튼이 잘렸다.
    flex: '1 1 auto',
    minHeight: 0,
    maxHeight: `min(100%, ${TUTORIAL_PATTERN_DIAGRAM_MIN_HEIGHT}px)`,
    padding: 'clamp(10px, 4%, 18px) clamp(6px, 2.5%, 10px)',
    boxSizing: 'border-box',
    borderRadius: radius.sm,
    // color.bg(#0d0f12)의 반투명 — 뒤 프리뷰 캔버스가 살짝 비치도록 유지
    backgroundColor: 'rgba(13, 15, 18, 0.92)',
    boxShadow: '0 10px 24px rgba(0, 0, 0, 0.24), inset 0 1px 0 rgba(255, 255, 255, 0.06)',
    pointerEvents: 'none',
    overflow: 'hidden',
  },
  equationRow: {
    display: 'grid',
    // 레인 3칸은 남는 폭을 균등 분배(minmax(0,1fr))하고 연산자(+·=)는 내용폭으로.
    gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr) auto minmax(0, 1fr)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'clamp(4px, 2%, 8px)',
    width: '100%',
    maxWidth: '100%',
  },
  pattern: {
    width: '100%',
    minWidth: 0,
  },
  lane: {
    // 폭은 그리드 셀을 채우고, 높이는 원래 5:1 레인 비율을 aspect-ratio로 유지.
    width: '100%',
    aspectRatio: `${TUTORIAL_PATTERN_DIAGRAM_LANE_WIDTH} / ${DIAGRAM_LANE_HEIGHT}`,
    borderRadius: '4px',
    display: 'block',
    overflow: 'hidden',
    filter: 'drop-shadow(0 8px 14px rgba(0, 0, 0, 0.28))',
  },
  term: {
    color: color.neon,
    fontFamily: font.display,
    fontSize: 'clamp(20px, 7vw, 42px)',
    fontWeight: 900,
    lineHeight: 1,
    textShadow: `0 1px 8px ${color.neonGlow}`,
  },
};
