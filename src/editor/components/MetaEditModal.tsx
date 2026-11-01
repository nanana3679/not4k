import { useState, useEffect, useRef, useCallback } from 'react';
import type { ChartMeta } from '../../shared';
import type { PlaybackRange } from '../../shared';
import { STORAGE_BUCKET } from '../../shared';
import { supabase } from '../../supabase';
import { PreviewRangeSelector } from './PreviewRangeSelector';
import type { PreviewRangeState } from './PreviewRangeSelector';
import { modalStyles } from './modalStyles';
import { PAUSE_TO_EDIT_COPY } from '../editorCopy';
import type { MetaAudioPick } from '../metaAudioSession';

function getPublicUrl(path: string): string {
  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/** Selector의 첫 알림은 정규화한 초기값이다. 그 뒤 달라진 구간만 모달 편집으로 취급한다. */
function useRangeDraft() {
  const [draft, setDraft] = useState<{
    initial: PreviewRangeState | null; current: PreviewRangeState | null;
  } | null>(null);
  const onChange = useCallback((current: PreviewRangeState | null) => {
    setDraft(previous => ({ initial: previous ? previous.initial : current, current }));
  }, []);
  const initial = draft?.initial;
  const current = draft?.current;
  const changed = current != null && (initial == null
    || current.startTime !== initial.startTime || current.endTime !== initial.endTime
    || current.fadeInTime !== initial.fadeInTime || current.fadeOutTime !== initial.fadeOutTime);
  return { current: current ?? null, changed, onChange };
}

export interface MetaEditModalProps {
  meta: ChartMeta;
  audioBuffer: AudioBuffer | null;
  audioLoading?: boolean;
  onSave: (
    meta: Partial<ChartMeta>,
    previewRange: PreviewRangeState | null,
    jacketFile: File | null,
    gameplayRange: PreviewRangeState | null,
    audioFile: File | null,
  ) => void;
  onClose: () => void;
  onLoadAudio: (file: File) => void;
  /**
   * 이번 창에서 고른 음원과 로드 결과(App의 Meta 음원 선택이 소유). 로드에 성공한 파일만 적용하고, 로딩 중에는 Save를
   * 막는다. 실패한 파일은 적용하지 않으며 이전 음원으로 구간을 계속 편집할 수 있다.
   */
  audioPick?: MetaAudioPick | null;
  initialJacketFile?: File | null;
  jacketCacheBust?: number;
  initialGameplayRange?: PlaybackRange | null;
  /**
   * 에디터가 재생 중이다. 오프셋은 타이밍 값이라 입력을 비활성으로 두고 저장해도 바꾸지 않는다(RFD 0099).
   * 난이도·제목·아티스트는 재생 중에도 저장한다.
   */
  offsetLocked?: boolean;
}

/** 창을 열 때의 입력값. 난이도는 이 값에서 바꾼 경우에만 적용한다. */
function initialMetaValues(meta: ChartMeta): Record<string, string> {
  return {
    title: meta.title,
    artist: meta.artist,
    difficultyLabel: meta.difficultyLabel,
    difficultyLevel: String(meta.difficultyLevel),
    offsetMs: String(meta.offsetMs),
  };
}

export function MetaEditModal({
  meta,
  audioBuffer,
  audioLoading = false,
  onSave,
  onClose,
  onLoadAudio,
  audioPick = null,
  initialJacketFile,
  jacketCacheBust,
  initialGameplayRange,
  offsetLocked = false,
}: MetaEditModalProps) {
  const [initialValues] = useState(() => initialMetaValues(meta));
  const [values, setValues] = useState<Record<string, string>>(initialValues);
  const previewDraft = useRangeDraft();
  const gameplayDraft = useRangeDraft();
  const [jacketError, setJacketError] = useState(false);
  const [jacketLocalUrl, setJacketLocalUrl] = useState<string | null>(
    () => initialJacketFile ? URL.createObjectURL(initialJacketFile) : null,
  );
  // 기존 대기 파일은 미리보기에만 쓴다. 이번 모달에서 고른 파일만 다시 적용한다.
  const [jacketFile, setJacketFile] = useState<File | null>(null);
  const audioFile = audioPick?.status === 'loaded' ? audioPick.file : null;
  const prevJacketUrlRef = useRef<string | null>(jacketLocalUrl);

  useEffect(() => {
    return () => {
      if (prevJacketUrlRef.current) URL.revokeObjectURL(prevJacketUrlRef.current);
    };
  }, []);

  const set = (key: string, val: string) => setValues({ ...values, [key]: val });

  const jacketUrl = jacketLocalUrl
    ?? (meta.imageFile
      ? getPublicUrl(meta.imageFile) + (jacketCacheBust ? `?t=${jacketCacheBust}` : '')
      : null);

  const saveDisabled = audioLoading || audioPick?.status === 'loading' || (audioFile !== null && audioBuffer === null);
  const handleSave = () => {
    if (saveDisabled) return;
    const level = parseInt(values.difficultyLevel);
    const offset = parseFloat(values.offsetMs);
    const updatedMeta: Partial<ChartMeta> = {
      title: values.title,
      artist: values.artist,
      offsetMs: offsetLocked || isNaN(offset) ? meta.offsetMs : offset,
    };
    // 난이도는 이 창에서 바꾼 값만 적용한다. 창을 연 뒤 Save As가 바꾼 난이도를 창을 열 때의 값으로 되돌리지 않는다.
    if (values.difficultyLabel !== initialValues.difficultyLabel) updatedMeta.difficultyLabel = values.difficultyLabel;
    if (values.difficultyLevel !== initialValues.difficultyLevel && !isNaN(level)) updatedMeta.difficultyLevel = level;
    // 저장 완료로 바뀐 경로를 모달을 열 때의 파일명으로 되돌리지 않는다.
    if (audioFile) updatedMeta.audioFile = audioFile.name;
    // 음원을 교체했다면 새 길이로 정규화한 구간도 적용한다.
    const previewRange = previewDraft.changed || audioFile ? previewDraft.current : null;
    const gameplayRange = gameplayDraft.changed || audioFile ? gameplayDraft.current : null;
    if (previewRange) {
      updatedMeta.previewStart = previewRange.startTime;
      updatedMeta.previewEnd = previewRange.endTime;
    }
    onSave(updatedMeta, previewRange, jacketFile, gameplayRange, audioFile);
  };

  const fields: { label: string; key: string; type: string }[] = [
    { label: 'Title', key: 'title', type: 'text' },
    { label: 'Artist', key: 'artist', type: 'text' },
    { label: 'Difficulty Label', key: 'difficultyLabel', type: 'text' },
    { label: 'Difficulty Level', key: 'difficultyLevel', type: 'number' },
    { label: 'Offset (ms)', key: 'offsetMs', type: 'number' },
  ];

  return (
    <div style={modalStyles.overlay} onMouseDown={onClose}>
      <div style={{ ...modalStyles.modal, width: '520px', maxWidth: '90vw', maxHeight: '90vh', overflowY: 'auto' }} onMouseDown={(e) => e.stopPropagation()}>
        <h3 style={modalStyles.title}>Chart Metadata</h3>

        {fields.map((f) => {
          const locked = offsetLocked && f.key === 'offsetMs';
          return (
            <label key={f.key} style={modalStyles.field}>
              <span>{f.label}</span>
              <input
                style={locked ? { ...modalStyles.input, opacity: 0.5 } : modalStyles.input}
                type={f.type}
                value={values[f.key]}
                onChange={(e) => set(f.key, e.target.value)}
                disabled={locked}
                title={locked ? PAUSE_TO_EDIT_COPY : undefined}
              />
            </label>
          );
        })}

        {/* Audio section */}
        <div style={{ marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '13px' }}>Audio</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: 0 }}>
              <span style={{
                padding: '4px 12px',
                backgroundColor: '#3a3a3a',
                border: '1px solid #555',
                borderRadius: '4px',
                fontSize: '12px',
              }}>
                {audioBuffer ? 'Replace Audio' : 'Upload Audio'}
              </span>
              <input
                type="file"
                accept="audio/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onLoadAudio(file);
                }}
              />
            </label>
          </div>
          <div style={{ padding: '12px', backgroundColor: '#222', borderRadius: '6px', border: '1px solid #3a3a3a' }}>
            {audioBuffer ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <PreviewRangeSelector
                  audioBuffer={audioBuffer}
                  label="프리뷰 구간"
                  enabledLabel="프리뷰 사용"
                  onChange={previewDraft.onChange}
                  initialStart={meta.previewStart}
                  initialEnd={meta.previewEnd}
                />
                <PreviewRangeSelector
                  audioBuffer={audioBuffer}
                  label="인게임 구간"
                  canDisable={false}
                  defaultStart={0}
                  defaultEnd={audioBuffer.duration}
                  defaultDuration={audioBuffer.duration}
                  minDuration={1}
                  showFadeControls
                  initialStart={initialGameplayRange?.startTime}
                  initialEnd={initialGameplayRange?.endTime}
                  initialFadeInTime={initialGameplayRange?.fadeInTime}
                  initialFadeOutTime={initialGameplayRange?.fadeOutTime}
                  onChange={gameplayDraft.onChange}
                />
              </div>
            ) : (
              <div style={{ padding: '20px 0', textAlign: 'center', color: '#666', fontSize: '12px' }}>
                Select an audio file
              </div>
            )}
          </div>
        </div>

        {/* Jacket section */}
        <div style={{ marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '13px' }}>Jacket</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: 0 }}>
              <span style={{
                padding: '4px 12px',
                backgroundColor: '#3a3a3a',
                border: '1px solid #555',
                borderRadius: '4px',
                fontSize: '12px',
              }}>
                {jacketUrl && !jacketError ? 'Replace Jacket' : 'Upload Jacket'}
              </span>
              <input
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    if (prevJacketUrlRef.current) URL.revokeObjectURL(prevJacketUrlRef.current);
                    const newUrl = URL.createObjectURL(file);
                    prevJacketUrlRef.current = newUrl;
                    setJacketFile(file);
                    setJacketLocalUrl(newUrl);
                    setJacketError(false);
                  }
                }}
              />
            </label>
          </div>
          <div style={{ padding: '12px', backgroundColor: '#222', borderRadius: '6px', border: '1px solid #3a3a3a' }}>
            {jacketUrl && !jacketError ? (
              <img
                src={jacketUrl}
                alt="Jacket"
                style={{
                  width: '100%',
                  maxHeight: '120px',
                  objectFit: 'contain',
                  borderRadius: '4px',
                }}
                onError={() => setJacketError(true)}
              />
            ) : (
              <div style={{ padding: '20px 0', textAlign: 'center', color: '#666', fontSize: '12px' }}>
                Select a jacket image
              </div>
            )}
          </div>
        </div>

        <div style={modalStyles.buttons}>
          <button style={modalStyles.saveBtn} onClick={handleSave} disabled={saveDisabled}>Save</button>
          <button style={modalStyles.cancelBtn} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
