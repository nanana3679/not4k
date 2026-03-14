import { useState } from 'react';
import { supabase } from '../../../supabase';
import {
  STORAGE_BUCKET,
  songAudioPath,
  songJacketPath,
  songPreviewPath,
  encodeWavBlob,
} from '../../../shared';
import { PreviewRangeSelector } from '../../../editor/components/PreviewRangeSelector';
import type { PreviewRangeState } from '../../../editor/components/PreviewRangeSelector';
import { modalStyles } from './modalStyles';
import { generateSongId } from './helpers';

export interface AddSongModalProps {
  onDone: () => void;
  onClose: () => void;
  addToast: (msg: string, type?: 'info' | 'error') => void;
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
      const message = err instanceof Error ? err.message : String(err);
      addToast(message, 'error');
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

        <label style={modalStyles.field}>
          <span>Audio * (ogg/mp3)</span>
          <input style={modalStyles.input} type="file" accept=".ogg,.mp3,audio/ogg,audio/mpeg" onChange={(e) => handleAudioChange(e.target.files?.[0] ?? null)} />
        </label>

        <label style={modalStyles.field}>
          <span>Jacket (image)</span>
          <input style={modalStyles.input} type="file" accept="image/*" onChange={(e) => setJacketFile(e.target.files?.[0] ?? null)} />
        </label>

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
