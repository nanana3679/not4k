import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ExplicitPlayScreen } from '../game/screens/ExplicitPlayScreen';
import { ExplicitTutorialPreview } from '../game/screens/ExplicitTutorialPreview';
import { prepareExplicitPlayTest } from '../game/stores/explicitPlayRequest';
import type { ExplicitPlayRequest } from '../game/stores/explicitPlayRequest';
import { createExplicitPlaytestAudio, explicitPlaytestCharts } from './explicitPlaytestCharts';

export default function ExplicitPlaytestPage() {
  const [request, setRequest] = useState<ExplicitPlayRequest | null>(null);
  const [selected, setSelected] = useState(explicitPlaytestCharts[0].id);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const scenario = explicitPlaytestCharts.find(chart => chart.id === selected)!;
  const start = (auto: boolean) => {
    try { setRequest(prepareExplicitPlayTest({ document: scenario.chart, audioBuffer: createExplicitPlaytestAudio(), auto, returnUrl: '/lab/explicit-playtest' })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  };
  if (request) return <ExplicitPlayScreen request={request} onExit={() => setRequest(null)} />;
  return <main data-lab-page="explicit-playtest" style={{ padding: 32, color: '#edf2f7', background: '#101823', minHeight: '100vh' }}>
    <Link to="/lab">Lab 목록</Link>
    <h1>명시 차트 실플레이</h1>
    <p>새로 저작한 연습 차트와 실제 물리 입력을 같은 판정 세션으로 재생합니다. 공개 상태 fixture 시연과 별도입니다.</p>
    <label>연습 차트 <select value={selected} onChange={event => setSelected(event.target.value)}>
      {explicitPlaytestCharts.map(chart => <option key={chart.id} value={chart.id}>{chart.title}</option>)}
    </select></label>
    <p>{scenario.instruction}</p>
    <p>기존 게임 설정의 키 배치·속도·리프트·입력 및 시각 오프셋을 사용합니다. 시작 후 화면의 키 배치를 확인하세요.</p>
    <button onClick={() => start(false)}>수동 연습</button>{' '}<button onClick={() => start(true)}>자동 입력</button>
    {' '}<button onClick={() => setPreview(value => !value)}>{preview ? '미리보기 닫기' : '튜토리얼 미리보기'}</button>
    {preview && <ExplicitTutorialPreview key={selected} chart={scenario.chart} />}
    <p>처음 0ms부터 재생합니다. 일시정지·처음부터 다시·반복이 가능하며 종료 후 이번 테스트의 정산 수치를 확인합니다.</p>
    {error && <p role="alert">{error}</p>}
  </main>;
}
