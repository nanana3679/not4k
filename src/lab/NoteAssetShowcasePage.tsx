/*
THESIS: 확정 에셋은 별도 모형이 아니라 실제 튜토리얼 재생기 안에서 움직이며 검수한다.
OWN-WORLD: 기존 튜토리얼 Pixi 플레이필드, 건메탈 조절 패널, 연파랑·금빛 상태광을 그대로 잇는다.
STORY: 사용자는 튜토리얼 차트를 바꾸며 포인트·롱·Grace·길이 0 노트를 보고, 시안을 교체하고 같은 판정 시점에 키봄을 비교한다.
FIRST VIEWPORT: 실제 튜토리얼 재생기가 화면 중심을 차지하고 오른쪽에서 차트와 키봄만 바꾼다.
FORM: 기존 not4k Lab과 튜토리얼 재생기를 잇는 로컬 확장이므로 별도 플레이필드를 만들지 않는다.
*/
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { NoteAssetPreviewPlayer } from "./NoteAssetPreviewPlayer";
import { KeybombEffect } from "./KeybombEffect";
import { CLASSIC_NOTE_ASSET_VERSIONS, getNoteAssetDesign, NOTE_ASSET_DESIGNS } from "./noteAssetDesigns";
import {
  createTutorialPreview,
  makeChart,
  TUTORIAL_PREVIEWS,
  type TutorialPreviewDefinition,
} from "../game/screens/songSelect/tutorialPreviewChart";
import { beat } from "../shared/types/beat";
import { NOTE_ASSET_KIND_LABELS, type KeybombVariantId } from "./noteAssetShowcase";
import "./NoteAssetShowcasePage.css";
import { PlayScreen } from '../game/screens/PlayScreen';
import { getSkinManifest } from '../game/skin/skins';
import type { SkinManifest } from '../game/skin/types';
import type { PlayResult } from '../game/stores/gameStore';
import { NoteAssetChartPlayPanel, type NoteAssetChartFiles } from './NoteAssetChartPlayPanel';

interface PreviewOption {
  id: string;
  label: string;
  group: "point" | "long";
}

const MISSED_LONG_PREVIEW = createTutorialPreview(
  "missed-long-note",
  "판정 윈도우를 지난 롱노트",
  ["입력하지 않아 대기 바디가 실패 바디로 바뀝니다"],
  6,
  makeChart(
    "판정 윈도우를 지난 롱노트",
    6,
    [
      { type: "single", lane: 2, beat: beat(1) },
      { type: "long", lane: 2, beat: beat(1), endBeat: beat(4) },
    ],
    [],
  ),
);

const EARLY_RELEASE_LONG_PREVIEW = createTutorialPreview(
  "early-release-long-note",
  "중간에 뗀 롱노트",
  ["시작은 누르지만 끝나기 전에 떼어 Held 바디가 실패 바디로 바뀝니다"],
  6,
  makeChart(
    "중간에 뗀 롱노트",
    6,
    [
      { type: "single", lane: 2, beat: beat(1) },
      { type: "long", lane: 2, beat: beat(1), endBeat: beat(4) },
    ],
    [{
      type: "tutorialInput",
      lane: 2,
      keyCode: "KeyF",
      keyLabel: "F",
      beat: beat(1),
      endBeat: beat(2),
      editorLane: 3,
    }],
  ),
);

const LAB_PREVIEWS = [
  ...TUTORIAL_PREVIEWS,
  MISSED_LONG_PREVIEW,
  EARLY_RELEASE_LONG_PREVIEW,
];

const PREVIEW_OPTIONS: PreviewOption[] = [
  { id: "single-note", label: "싱글", group: "point" },
  { id: "double-note", label: "더블", group: "point" },
  { id: "trill-note", label: "트릴", group: "point" },
  { id: "grace-note", label: "Grace", group: "point" },
  { id: "long-note", label: "기본 롱", group: "long" },
  { id: "connected-trill-long", label: "트릴 롱", group: "long" },
  { id: "headless-long-note", label: "독립 롱", group: "long" },
  { id: "zero-length-long-note", label: "길이 0", group: "long" },
  { id: "hold-only-long-note", label: "Grace 롱", group: "long" },
  { id: "zero-length-hold-only-long-note", label: "길이 0 Grace", group: "long" },
  { id: "missed-long-note", label: "판정 놓침", group: "long" },
  { id: "early-release-long-note", label: "중간 해제", group: "long" },
];

const DEFAULT_PREVIEW_ID = "long-note";

function getPreview(previewId: string): TutorialPreviewDefinition {
  return LAB_PREVIEWS.find((preview) => preview.id === previewId)
    ?? LAB_PREVIEWS.find((preview) => preview.id === DEFAULT_PREVIEW_ID)
    ?? LAB_PREVIEWS[0];
}

export default function NoteAssetShowcasePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const design = getNoteAssetDesign(searchParams.get('design'), searchParams.get('version'));
  const [chartSession, setChartSession] = useState<(NoteAssetChartFiles & { skin: SkinManifest }) | null>(null);
  const [chartResult, setChartResult] = useState<PlayResult | null>(null);
  const [selectedPreviewId, setSelectedPreviewId] = useState(DEFAULT_PREVIEW_ID);
  const [previewInstance, setPreviewInstance] = useState(0);
  const [playerReady, setPlayerReady] = useState(false);
  const [selectedBombId, setSelectedBombId] = useState<KeybombVariantId>(design.bombs[0].id);
  const [rackBombRun, setRackBombRun] = useState(0);
  const [cardBombRuns, setCardBombRuns] = useState<Record<KeybombVariantId, number>>({
    silver: 0, diagonal: 0, armor: 0, shockwave: 0, segmented: 0, compact: 0, skin: 0,
  });
  const preview = useMemo(() => getPreview(selectedPreviewId), [selectedPreviewId]);
  const selectedBomb = useMemo(
    () => design.bombs.find((variant) => variant.id === selectedBombId) ?? design.bombs[0],
    [selectedBombId, design],
  );

  const selectPreview = (previewId: string) => {
    setSelectedPreviewId(previewId);
    setPlayerReady(false);
    setPreviewInstance((current) => current + 1);
  };

  const selectDesign = (id: string) => {
    setSearchParams(current => {
      const next = new URLSearchParams(current);
      next.set('design', id);
      next.delete('version');
      return next;
    });
  };

  const selectVersion = (id: string) => {
    setSearchParams(current => {
      const next = new URLSearchParams(current);
      next.set('design', 'classic');
      if (id === 'current') next.delete('version');
      else next.set('version', id);
      return next;
    });
  };

  useEffect(() => {
    setSelectedBombId(design.bombs[0].id);
    setPlayerReady(false);
  }, [design]);

  useEffect(() => {
    if (chartSession) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const timer = window.setInterval(() => {
      if (!document.hidden && !reducedMotion.matches) setRackBombRun((current) => current + 1);
    }, 1500);
    return () => window.clearInterval(timer);
  }, [chartSession]);

  const returnFromChart = () => { setChartSession(null); setPlayerReady(false); };

  return (
    <>
    {chartSession && <PlayScreen preview={{
      chart: chartSession.chart, audio: chartSession.audio, skin: chartSession.skin,
      onQuit: returnFromChart,
      onFinish: result => { setChartResult(result); returnFromChart(); },
    }} />}
    <main className="note-asset-lab" style={chartSession ? { display: 'none' } : undefined} data-lab-page="note-assets" data-asset-design={design.id} data-skin-version={design.versionId ?? 'current'}>
      <header className="asset-lab-header">
        <div>
          <p className="asset-lab-kicker"><Link className="asset-lab-back-link" to="/lab">← Lab 목록</Link></p>
          <h1>노트 에셋 시연실</h1>
          <p>노트 에셋을 반복 시연하거나, 차트와 음원을 불러와 선택한 스킨으로 직접 연주합니다.</p>
        </div>
        <div className="asset-lab-status" aria-label="재생기 상태">
          <span>{playerReady ? "PLAYER READY" : "LOADING PLAYER"}</span>
          <strong>{design.name}{design.versionId ? ` · ${design.versionId}` : ''}</strong>
        </div>
      </header>

      <NoteAssetChartPlayPanel skinLabel={`${design.name}${design.versionId ? ` ${design.versionId}` : ''} · ${design.description}`} result={chartResult} onPlay={files => {
        setChartResult(null);
        setPlayerReady(false);
        setChartSession({ ...files, skin: design.skinManifest ?? getSkinManifest(design.skinId) });
      }} />

      <section className="asset-lab-workbench" aria-labelledby="asset-player-title">
        <div className="asset-lab-player-panel">
          <div className="asset-lab-player-toolbar">
            <div><span>ACTUAL TUTORIAL RENDERER</span><strong id="asset-player-title">{preview.title}</strong></div>
            <button type="button" onClick={() => selectPreview(selectedPreviewId)}>처음부터 재생</button>
          </div>
          <div className="asset-lab-player-stage">
            <div className="asset-lab-player-canvas" data-active-preview={preview.id}>
              {!chartSession && <NoteAssetPreviewPlayer
                key={`${design.skinId}:${preview.id}:${previewInstance}`}
                design={design}
                preview={preview}
                bomb={selectedBomb}
                onReady={() => setPlayerReady(true)}
              />}
            </div>
          </div>
        </div>

        <aside className="asset-lab-inspector" aria-label="튜토리얼 에셋 시연 조절">
          <section>
            <div className="asset-lab-control-heading"><h2>시안</h2></div>
            <div className="asset-lab-preview-options" role="group" aria-label="시안 선택">
              {NOTE_ASSET_DESIGNS.map(option => (
                <button key={option.id} type="button" aria-pressed={design.id === option.id} onClick={() => selectDesign(option.id)}>
                  {option.name}
                </button>
              ))}
            </div>
            {design.id === 'classic' && <div className="asset-lab-version-control">
              <label htmlFor="classic-skin-version">버전</label>
              <select id="classic-skin-version" value={design.versionId ?? 'current'} onChange={event => selectVersion(event.target.value)}>
                <option value="current">현재 적용본</option>
                {CLASSIC_NOTE_ASSET_VERSIONS.map(version => <option key={version.id} value={version.id}>
                  {version.id} · {version.label}
                </option>)}
              </select>
            </div>}
            <p className="asset-lab-inspector-note">{design.description}</p>
          </section>
          <section>
            <div className="asset-lab-control-heading"><h2>재생 차트</h2><span>AUTO PLAY</span></div>
            {(["point", "long"] as const).map((group) => (
              <div className="asset-lab-preview-group" key={group}>
                <h3>{group === "point" ? "포인트 노트" : "롱노트"}</h3>
                <div className="asset-lab-preview-options">
                  {PREVIEW_OPTIONS.filter((option) => option.group === group).map((option) => (
                    <button key={option.id} type="button" aria-pressed={selectedPreviewId === option.id} onClick={() => selectPreview(option.id)}>
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </section>

          <section>
            <div className="asset-lab-control-heading"><h2>판정 키봄</h2><span>{Math.round(selectedBomb.duration)}ms</span></div>
            <div className="asset-lab-bomb-options" role="group" aria-label="키봄 효과 선택">
              {design.bombs.map((variant, index) => (
                <button key={variant.id} type="button" aria-pressed={selectedBombId === variant.id} onClick={() => setSelectedBombId(variant.id)}>
                  <span>{String(index + 1).padStart(2, "0")}</span>{variant.title}
                </button>
              ))}
            </div>
            <p className="asset-lab-inspector-note">다음 판정부터 선택한 효과가 실제 레인 위치에서 재생됩니다.</p>
          </section>

          <section className="asset-lab-runtime-map">
            <div className="asset-lab-control-heading"><h2>런타임 매핑</h2><span>PIXI</span></div>
            <dl>
              <div><dt>하강 / 대기</dt><dd>대기 에셋</dd></div>
              <div><dt>누르는 중</dt><dd>활성 바디</dd></div>
              <div><dt>1-unit 상태</dt><dd>부분 충족 바디</dd></div>
              <div><dt>놓침 / 중간 해제</dt><dd>무채색 바디</dd></div>
              <div><dt>Grace</dt><dd>렌더러 외곽광</dd></div>
            </dl>
          </section>
        </aside>
      </section>

      <section className="asset-lab-rack" aria-labelledby="asset-rack-title">
        <div className="asset-lab-rack-heading">
          <div><span>APPROVED SOURCE SET</span><h2 id="asset-rack-title">확정 에셋 랙</h2></div>
          <a href={design.points.single} target="_blank" rel="noreferrer">싱글 원본 열기 ↗</a>
        </div>

        <div className="asset-lab-rack-group">
          <h3>포인트 노트</h3>
          <div className="asset-lab-note-rack">
            {(["single", "double", "trill"] as const).map((kind) => (
              <figure key={kind} data-point-rack-item={kind}>
                <div><img src={design.points[kind]} alt={`${NOTE_ASSET_KIND_LABELS[kind]} 포인트 노트 원본`} /></div>
                <figcaption>{NOTE_ASSET_KIND_LABELS[kind]}</figcaption>
              </figure>
            ))}
          </div>
        </div>

        <div className="asset-lab-rack-group">
          <h3>바디 상태 · 대기 / 누르는 중 / 실패</h3>
          <div className="asset-lab-body-rack">
            {design.bodies.map((asset) => (
              <figure key={`${asset.kind}-${asset.state}`} data-body-rack-item={asset.kind}>
                <div><img src={asset.src} alt="" aria-hidden="true" /></div><figcaption>{asset.label}</figcaption>
              </figure>
            ))}
          </div>
        </div>

        <div className="asset-lab-rack-group">
          <h3>터미널 상태 · 대기 / 누르는 중 / 실패 / Grace</h3>
          <div className="asset-lab-terminal-rack">
            {design.terminals.map((asset) => (
              <figure key={`${asset.kind}-${asset.state}`} data-terminal-rack-item={asset.kind}>
                <div><img src={asset.src} alt="" aria-hidden="true" /></div><figcaption>{asset.label}</figcaption>
              </figure>
            ))}
          </div>
        </div>

        <div className="asset-lab-rack-group">
          <div className="asset-lab-bomb-rack-heading">
            <h3>키봄 · 싱글/더블 공통</h3>
            <button type="button" onClick={() => setRackBombRun((current) => current + 1)}>{design.bombs.length}개 모두 재생</button>
          </div>
          <div className="asset-lab-bomb-rack" aria-label={`확정 키봄 ${design.bombs.length}종`}>
            {design.bombs.map((variant, index) => (
              <button
                key={variant.id}
                type="button"
                aria-label={`${variant.title} 랙에서 다시 재생`}
                onClick={() => {
                  setSelectedBombId(variant.id);
                  setCardBombRuns((current) => ({ ...current, [variant.id]: current[variant.id] + 1 }));
                }}
              >
                <span className="asset-lab-bomb-number">{String(index + 1).padStart(2, "0")}</span>
                <KeybombEffect key={`${variant.id}:${rackBombRun}:${cardBombRuns[variant.id]}`} variant={variant} />
                <strong>{variant.title}</strong><small>{Math.round(variant.duration)}ms</small>
              </button>
            ))}
          </div>
        </div>
      </section>
    </main>
    </>
  );
}
