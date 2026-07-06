import { TutorialPatternDiagram } from '../game/screens/songSelect/TutorialPatternDiagram';

const pageStyle = {
  minHeight: '100vh',
  boxSizing: 'border-box',
  display: 'grid',
  placeItems: 'center',
  padding: '48px',
  background: '#05070b',
} as const;

const stageStyle = {
  width: 'min(920px, 100%)',
  display: 'grid',
  gap: '28px',
} as const;

export default function TutorialPatternDiagramTestPage() {
  return (
    <main
      data-lab-page="tutorial-pattern-diagram"
      aria-label="Tutorial pattern diagram asset preview"
      style={pageStyle}
    >
      <section style={stageStyle}>
        <TutorialPatternDiagram diagramId="connected-switch" />
        <TutorialPatternDiagram diagramId="connected-overlap" />
      </section>
    </main>
  );
}
