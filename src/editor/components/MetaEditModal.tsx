import { useState } from 'react';
import type { ChartMeta } from '../../shared';
import { STORAGE_BUCKET } from '../../shared';
import { supabase } from '../../supabase';
import { PreviewRangeSelector } from './PreviewRangeSelector';
import type { PreviewRangeState } from './PreviewRangeSelector';
import { modalStyles } from './modalStyles';

function getPublicUrl(path: string): string {
  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export interface MetaEditModalProps {
  meta: ChartMeta;
  audioBuffer: AudioBuffer | null;
  onSave: (meta: ChartMeta, previewRange: PreviewRangeState | null, jacketFile: File | null) => void;
  onClose: () => void;
  onLoadAudio: (file: File) => void;
  initialJacketFile?: File | null;
  jacketCacheBust?: number;
}

export function MetaEditModal({ meta, audioBuffer, onSave, onClose, onLoadAudio, initialJacketFile, jacketCacheBust }: MetaEditModalProps) {
  const [values, setValues] = useState<Record<string, string>>({
    title: meta.title,
    artist: meta.artist,
    difficultyLabel: meta.difficultyLabel,
    difficultyLevel: String(meta.difficultyLevel),
    offsetMs: String(meta.offsetMs),
    audioFile: meta.audioFile,
    imageFile: meta.imageFile,
    previewAudioFile: meta.previewAudioFile,
  });
  const [previewRange, setPreviewRange] = useState<PreviewRangeState | null>(null);
  const [jacketError, setJacketError] = useState(false);
  const [jacketLocalUrl, setJacketLocalUrl] = useState<string | null>(
    initialJacketFile ? URL.createObjectURL(initialJacketFile) : null,
  );
  const [jacketFile, setJacketFile] = useState<File | null>(initialJacketFile ?? null);

  const set = (key: string, val: string) => setValues({ ...values, [key]: val });

  const jacketUrl = jacketLocalUrl
    ?? (values.imageFile
      ? getPublicUrl(values.imageFile) + (jacketCacheBust ? `?t=${jacketCacheBust}` : '')
      : null);

  const handleSave = () => {
    const level = parseInt(values.difficultyLevel);
    const offset = parseFloat(values.offsetMs);
    const updatedMeta: ChartMeta = {
      ...meta,
      title: values.title,
      artist: values.artist,
      difficultyLabel: values.difficultyLabel,
      difficultyLevel: isNaN(level) ? meta.difficultyLevel : level,
      offsetMs: isNaN(offset) ? meta.offsetMs : offset,
      audioFile: values.audioFile,
      imageFile: values.imageFile,
      previewAudioFile: values.previewAudioFile,
    };
    if (previewRange) {
      updatedMeta.previewStart = previewRange.startTime;
      updatedMeta.previewEnd = previewRange.endTime;
    }
    onSave(updatedMeta, previewRange, jacketFile);
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

        {fields.map((f) => (
          <label key={f.key} style={modalStyles.field}>
            <span>{f.label}</span>
            <input
              style={modalStyles.input}
              type={f.type}
              value={values[f.key]}
              onChange={(e) => set(f.key, e.target.value)}
            />
          </label>
        ))}

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
                  if (file) {
                    set('audioFile', file.name);
                    onLoadAudio(file);
                  }
                }}
              />
            </label>
          </div>
          <div style={{ padding: '12px', backgroundColor: '#222', borderRadius: '6px', border: '1px solid #3a3a3a' }}>
            {audioBuffer ? (
              <PreviewRangeSelector
                audioBuffer={audioBuffer}
                onChange={setPreviewRange}
                initialStart={meta.previewStart}
                initialEnd={meta.previewEnd}
              />
            ) : (
              <div style={{ padding: '20px 0', textAlign: 'center', color: '#666', fontSize: '12px' }}>
                No file
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
                    setJacketFile(file);
                    setJacketLocalUrl(URL.createObjectURL(file));
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
                No file
              </div>
            )}
          </div>
        </div>

        <div style={modalStyles.buttons}>
          <button style={modalStyles.saveBtn} onClick={handleSave}>Save</button>
          <button style={modalStyles.cancelBtn} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
