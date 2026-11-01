import { test, expect } from '@playwright/test';
import { EDITOR_TEST_AUDIO_FILE, openEditor } from './editorTestSetup';

test('Title·Offset 45ms·자켓·음원을 바꿔 Save Song하면 새 경로 업로드 뒤 리비전 1로 전체 곡을 저장하고 두 저장 표시가 깨끗해진다', async ({ page }) => {
  const editor = await openEditor(page);
  await page.getByRole('button', { name: 'More editor actions', exact: true }).click();
  await page.getByRole('button', { name: 'Meta', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill('저장할 곡');
  await page.getByLabel('Offset (ms)', { exact: true }).fill('45');
  await page.locator('input[type="file"][accept="image/*"]').setInputFiles({
    name: 'new.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64'),
  });
  await page.locator('input[type="file"][accept="audio/*"]').setInputFiles(EDITOR_TEST_AUDIO_FILE);
  await expect(page.getByText('Replace Audio', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save song, unsaved changes', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save chart', exact: true }).click();
  await expect(page.getByText('곡 타이밍에 미저장 변경이 있습니다. Save Song으로 곡을 먼저 저장해주세요.')).toBeVisible();
  expect(editor.supabaseWrites).toEqual([]);

  page.once('dialog', async dialog => {
    expect(dialog.message()).toContain('이 곡의 다른 차트도 이 타이밍을 따릅니다');
    await dialog.accept();
  });
  await page.getByRole('button', { name: 'Save song, unsaved changes', exact: true }).click();
  await expect(page.getByText('Song saved', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save song', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save chart', exact: true })).toBeVisible();
  const rpc = editor.supabaseWrites.find(write => write.path === '/rest/v1/rpc/save_song')!;
  expect(rpc.method).toBe('POST');
  const values = JSON.parse(rpc.body!);
  expect(values).toMatchObject({ p_expected_revision: 1, p_title: '저장할 곡', p_duration: 0.5,
    p_timing: { offsetMs: 45, bpmChanges: [{ beat: '0', bpm: 120 }] } });
  for (const key of ['p_jacket_url', 'p_audio_url', 'p_preview_url']) {
    expect(values[key]).toMatch(/^songs\/e2e-editor-song\/(jacket|audio|preview)-[a-f0-9-]+\./);
    const uploadIndex = editor.supabaseWrites.findIndex(write => write.path === `/storage/v1/object/assets/${values[key]}`);
    expect(uploadIndex).toBeGreaterThanOrEqual(0);
    expect(uploadIndex).toBeLessThan(editor.supabaseWrites.indexOf(rpc));
  }
  expect(editor.supabaseWrites.some(write => write.path === '/rest/v1/songs')).toBe(false);
  expect(editor.unexpectedSupabaseRequests).toEqual([]);
});
