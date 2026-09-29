import { useEffect, useRef, useState } from 'react';
import type { Chart } from '../shared';
import type { PlayResult } from '../game/stores/gameStore';
import { useGameStore } from '../game/stores';
import { getTutorialKeyboardLabel } from '../game/screens/songSelect/tutorialKeyboardLayout';
import { parseNoteAssetPlayChart } from './noteAssetChartPlay';

export interface NoteAssetChartFiles { chart: Chart; audio: AudioBuffer }

export function NoteAssetChartPlayPanel({ onPlay, result, skinLabel }: {
  onPlay: (files: NoteAssetChartFiles) => void;
  result: PlayResult | null;
  skinLabel: string;
}) {
  const [chart, setChart] = useState<Chart | null>(null);
  const [audio, setAudio] = useState<AudioBuffer | null>(null);
  const [chartError, setChartError] = useState('');
  const [audioError, setAudioError] = useState('');
  const [chartLoading, setChartLoading] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const chartRequest = useRef(0);
  const audioRequest = useRef(0);
  const keys = useGameStore(state => state.settings.keyBindings);
  useEffect(() => () => { chartRequest.current++; audioRequest.current++; }, []);

  const loadChart = async (file?: File) => {
    if (!file) return;
    const request = ++chartRequest.current;
    setChart(null); setChartError(''); setChartLoading(true);
    try {
      const next = parseNoteAssetPlayChart(await file.text());
      if (request === chartRequest.current) setChart(next);
    } catch (error) {
      if (request === chartRequest.current) setChartError(error instanceof Error ? error.message : '차트를 읽을 수 없습니다.');
    } finally { if (request === chartRequest.current) setChartLoading(false); }
  };

  const loadAudio = async (file?: File) => {
    if (!file) return;
    const request = ++audioRequest.current;
    setAudio(null); setAudioError(''); setAudioLoading(true);
    let context: AudioContext | undefined;
    try {
      context = new AudioContext();
      const next = await context.decodeAudioData(await file.arrayBuffer());
      if (request === audioRequest.current) setAudio(next);
    } catch {
      if (request === audioRequest.current) setAudioError('음원을 읽을 수 없습니다. 다른 오디오 파일을 선택해주세요.');
    } finally {
      if (context) await context.close().catch(() => {});
      if (request === audioRequest.current) setAudioLoading(false);
    }
  };

  return <details className="asset-lab-chart-play">
    <summary>실제 차트로 연주</summary>
    <p>차트 JSON과 해당 음원을 고르면 선택한 스킨으로 직접 연주합니다. 파일은 브라우저에서만 읽습니다.</p>
    <div className="asset-lab-chart-files">
      <label>차트 JSON<input type="file" accept=".json,application/json" onChange={event => void loadChart(event.target.files?.[0])} /></label>
      <label>음원<input type="file" accept="audio/*,.ogg,.wav,.mp3,.flac" onChange={event => void loadAudio(event.target.files?.[0])} /></label>
    </div>
    {chartError && <p role="alert">{chartError}</p>}
    {audioError && <p role="alert">{audioError}</p>}
    <p aria-live="polite">{chartLoading || audioLoading ? '파일을 읽는 중…' : chart
      ? `${chart.meta.title || '제목 없음'} · ${chart.notes.length}개 노트${audio ? ` · ${audio.duration.toFixed(1)}초` : ' · 음원을 선택해주세요'}`
      : '연주할 차트와 음원을 선택해주세요.'}</p>
    <div className="asset-lab-chart-actions">
      <button type="button" disabled={!chart || !audio || chartLoading || audioLoading} onClick={() => chart && audio && onPlay({ chart, audio })}>선택한 스킨으로 연주</button>
      <span>{skinLabel}</span>
    </div>
    <p className="asset-lab-chart-help">{Object.entries(keys).map(([lane, codes]) => `${lane.replace('lane', '레인 ')}: ${codes.map(getTutorialKeyboardLabel).join(' / ')}`).join(' · ')}</p>
    <p className="asset-lab-chart-help">게임의 키 설정과 스크롤 속도를 사용합니다. Esc → Retry로 재시도, Quit으로 Lab에 돌아옵니다. 연주가 끝나도 선택한 파일은 유지됩니다.</p>
    {result && <p className="asset-lab-chart-result" role="status">최근 연주 · {result.songId} · {result.achievementRate.toFixed(2)}% · Miss {result.judgmentCounts.miss ?? 0}</p>}
  </details>;
}
