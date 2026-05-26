import type React from 'react';
import { useState } from 'react';
import { supabase } from '../../../supabase';
import {
  STORAGE_BUCKET,
  songAudioPath,
  songJacketPath,
  songPreviewPath,
  encodeWavBlob,
} from '../../../shared';
import type { ToastType } from '../../../shared/toast';
import { PreviewRangeSelector } from '../../../editor/components/PreviewRangeSelector';
import type { PreviewRangeState } from '../../../editor/components/PreviewRangeSelector';
import { modalStyles } from './modalStyles';
import { generateSongId } from './helpers';

const filePickerStyles: Record<string, React.CSSProperties> = {
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    marginBottom: '12px',
    fontSize: '13px',
  },
  control: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    minHeight: '44px',
    padding: '6px',
    backgroundColor: '#1a1a1a',
    border: '1px solid #555',
    borderRadius: '4px',
  },
  chooseButton: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '32px',
    padding: '0 12px',
    backgroundColor: '#3a3a3a',
    color: '#e0e0e0',
    border: '1px solid #666',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 600,
    whiteSpace: 'nowrap',
  },
  fileName: {
    minWidth: 0,
    flex: 1,
    color: '#aaa',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  fileNameSelected: {
    color: '#e0e0e0',
  },
  clearButton: {
    minHeight: '32px',
    padding: '0 10px',
    backgroundColor: 'transparent',
    color: '#aaa',
    border: '1px solid #555',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px',
  },
  hiddenInput: {
    display: 'none',
  },
};

interface FilePickerFieldProps {
  label: string;
  accept: string;
  file: File | null;
  placeholder: string;
  chooseLabel: string;
  changeLabel: string;
  onChange: (file: File | null) => void;
  required?: boolean;
  disabled?: boolean;
}

function FilePickerField({
  label,
  accept,
  file,
  placeholder,
  chooseLabel,
  changeLabel,
  onChange,
  required = false,
  disabled = false,
}: FilePickerFieldProps) {
  const inputId = `new-song-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

  return (
    <div style={filePickerStyles.field}>
      <span>{label}{required ? ' *' : ''}</span>
      <div style={filePickerStyles.control}>
        <label
          htmlFor={inputId}
          style={{
            ...filePickerStyles.chooseButton,
            ...(disabled ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
          }}
        >
          {file ? changeLabel : chooseLabel}
        </label>
        <input
          id={inputId}
          style={filePickerStyles.hiddenInput}
          type="file"
          accept={accept}
          disabled={disabled}
          onChange={(e) => {
            onChange(e.target.files?.[0] ?? null);
            e.currentTarget.value = '';
          }}
        />
        <span style={{ ...filePickerStyles.fileName, ...(file ? filePickerStyles.fileNameSelected : {}) }}>
          {file?.name ?? placeholder}
        </span>
        {file && (
          <button
            type="button"
            style={filePickerStyles.clearButton}
            onClick={() => onChange(null)}
            disabled={disabled}
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

export interface AddSongModalProps {
  onDone: () => void;
  onClose: () => void;
  addToast: (msg: string, type?: ToastType) => void;
}

export function AddSongModal({ onDone, onClose, addToast }: AddSongModalProps) {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [jacketFile, setJacketFile] = useState<File | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [decodingAudio, setDecodingAudio] = useState(false);
  const [previewRange, setPreviewRange] = useState<PreviewRangeState | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleAudioChange = async (file: File | null) => {
    setAudioFile(file);
    setAudioBuffer(null);
    setPreviewRange(null);
    if (file) {
      setDecodingAudio(true);
      try {
        const arrayBuffer = await file.arrayBuffer();
        const ctx = new AudioContext();
        const buffer = await ctx.decodeAudioData(arrayBuffer);
        await ctx.close();
        setAudioBuffer(buffer);
      } catch {
        setAudioBuffer(null);
      } finally {
        setDecodingAudio(false);
      }
    }
  };

  const canSubmit = title.trim() !== '' && artist.trim() !== '' && audioFile !== null && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit || !audioFile) return;
    setSubmitting(true);

    try {
      const songId = generateSongId(title);
      const audioExt = audioFile.name.split('.').pop()?.toLowerCase() || 'ogg';

      const uploads: Promise<void>[] = [];

      uploads.push(
        supabase.storage.from(STORAGE_BUCKET).upload(songAudioPath(songId, audioExt), audioFile)
          .then(({ error }) => { if (error) throw new Error(`Audio upload failed: ${error.message}`); }),
      );

      if (jacketFile) {
        const jacketExt = jacketFile.name.split('.').pop()?.toLowerCase() || 'jpg';
        uploads.push(
          supabase.storage.from(STORAGE_BUCKET).upload(songJacketPath(songId, jacketExt), jacketFile)
            .then(({ error }) => { if (error) throw new Error(`Jacket upload failed: ${error.message}`); }),
        );
      }

      await Promise.all(uploads);

      const row: Record<string, unknown> = {
        id: songId,
        title: title.trim(),
        artist: artist.trim(),
        audio_url: songAudioPath(songId, audioExt),
      };
      if (jacketFile) {
        const jacketExt = jacketFile.name.split('.').pop()?.toLowerCase() || 'jpg';
        row.jacket_url = songJacketPath(songId, jacketExt);
      }
      if (audioBuffer) {
        row.duration = audioBuffer.duration;
      }
      if (previewRange) {
        row.preview_start = previewRange.startTime;
        row.preview_end = previewRange.endTime;
      }

      // Generate and upload preview WAV if preview range is set and audioBuffer exists
      if (previewRange && audioBuffer) {
        const wavBlob = encodeWavBlob(audioBuffer, previewRange.startTime, previewRange.endTime);
        const previewPath = songPreviewPath(songId);
        const { error: previewUploadErr } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(previewPath, wavBlob, { upsert: true });
        if (previewUploadErr) throw new Error(`Preview upload failed: ${previewUploadErr.message}`);
        row.preview_url = previewPath;
      }

      const { error } = await supabase.from('songs').insert(row);
      if (error) throw new Error(`DB insert failed: ${error.message}`);

      addToast(`Song "${title.trim()}" added`, 'info');
      onDone();
    } catch (err: unknown) {
      console.error('AddSongModal:', err);
      addToast('곡 추가에 실패했습니다. 잠시 후 다시 시도해주세요.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={modalStyles.overlay} onMouseDown={submitting ? undefined : onClose}>
      <div style={{ ...modalStyles.modal, minWidth: '340px', width: '500px', maxWidth: '90vw' }} onMouseDown={(e) => e.stopPropagation()}>
        <h3 style={modalStyles.title}>New Song</h3>

        <label style={modalStyles.field}>
          <span>Title *</span>
          <input style={modalStyles.input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Song title" />
        </label>

        <label style={modalStyles.field}>
          <span>Artist *</span>
          <input style={modalStyles.input} value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="Artist name" />
        </label>

        <FilePickerField
          label="Audio (ogg/mp3)"
          accept=".ogg,.mp3,audio/ogg,audio/mpeg"
          file={audioFile}
          placeholder="No audio selected"
          chooseLabel="Choose audio"
          changeLabel="Change audio"
          required
          disabled={submitting || decodingAudio}
          onChange={handleAudioChange}
        />

        <FilePickerField
          label="Jacket (image)"
          accept="image/*"
          file={jacketFile}
          placeholder="No jacket selected"
          chooseLabel="Choose jacket"
          changeLabel="Change jacket"
          disabled={submitting}
          onChange={setJacketFile}
        />

        {decodingAudio && (
          <div style={{ fontSize: '13px', color: '#888', marginBottom: '12px' }}>
            오디오 디코딩 중...
          </div>
        )}

        {audioBuffer && !decodingAudio && (
          <div style={{ fontSize: '13px', color: '#aaa', marginBottom: '12px' }}>
            Length: {Math.floor(audioBuffer.duration / 60)}:{String(Math.floor(audioBuffer.duration % 60)).padStart(2, '0')}
          </div>
        )}

        {audioBuffer && (
          <div style={{ marginBottom: '12px' }}>
            <PreviewRangeSelector audioBuffer={audioBuffer} onChange={setPreviewRange} />
          </div>
        )}

        <div style={modalStyles.buttons}>
          <button
            style={{ ...modalStyles.saveBtn, opacity: canSubmit ? 1 : 0.5, cursor: canSubmit ? 'pointer' : 'not-allowed' }}
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            {submitting ? 'Uploading...' : 'Add Song'}
          </button>
          <button style={modalStyles.cancelBtn} onClick={onClose} disabled={submitting}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
