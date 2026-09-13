import { once } from 'node:events';
import { createConnection, type AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { breakthroughSearch, createPreviewServer, previewViews, resolvePreviewRoute } from './preview-server.mjs';

const servers: ReturnType<typeof createPreviewServer>[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
});

async function runningPreview() {
  const server = createPreviewServer();
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function rawRequest(url: string, target: string) {
  const { hostname, port } = new URL(url);
  return new Promise<string>((resolve, reject) => {
    const socket = createConnection({ host: hostname, port: Number(port) });
    let response = '';
    socket.setEncoding('utf8');
    socket.on('connect', () => socket.write(`GET ${target} HTTP/1.1\r\nHost: ${hostname}\r\nConnection: close\r\n\r\n`));
    socket.on('data', chunk => { response += chunk; });
    socket.on('end', () => resolve(response));
    socket.on('error', reject);
  });
}

describe('비행 배경 공개 미리보기 서버', () => {
  it('기본 URL은 LIFTOFF 300%·INFILTRATION 600%·BREAKTHROUGH 1000% 속도를 사용한다', () => {
    const liftoff = new URL(previewViews.liftoff, 'http://preview.local').searchParams;
    const infiltration = new URL(previewViews.infiltration, 'http://preview.local').searchParams;
    const breakthrough = new URLSearchParams(breakthroughSearch);

    expect(Object.fromEntries(liftoff)).toEqual({ variant: 'liftoff', altitude: '.68', scale: '1', secondary: '.15', speed: '3', lanes: '0' });
    expect(Object.fromEntries(infiltration)).toEqual({ variant: 'infiltration', altitude: '.23', scale: '1', secondary: '.15', speed: '6', lanes: '0' });
    expect(breakthrough.get('speed')).toBe('1000');
    expect(breakthrough.has('paused')).toBe(false);
  });

  it('BREAKTHROUGH 기본 URL은 배경 확대 300%·밝기 10%·건물과 레인 숨김을 고정한다', () => {
    const params = new URLSearchParams(breakthroughSearch);
    expect(params.get('backdropRate')).toBe('300');
    expect(params.get('backdropBrightness')).toBe('10');
    expect(params.get('building')).toBe('0');
    expect(params.get('lanes')).toBe('0');
  });

  it('허용한 실행 파일은 해석하고 테스트 파일과 상위 경로 접근은 거부한다', () => {
    expect(resolvePreviewRoute('/flight/liftoff/flight.mjs')?.name).toBe('flight.mjs');
    expect(resolvePreviewRoute('/flight/breakthrough/scene.mjs')?.name).toBe('scene.mjs');
    expect(resolvePreviewRoute('/flight/liftoff/settings.test.ts')).toBeNull();
    expect(resolvePreviewRoute('/flight/breakthrough/../package.json')).toBeNull();
  });

  it('루트와 세 장면 HTML은 HTTP 200이며 각 장면에 고도 전용 스타일을 주입한다', async () => {
    const url = await runningPreview();
    const root = await fetch(`${url}/`);
    const liftoff = await fetch(`${url}/flight/liftoff/`);
    const infiltration = await fetch(`${url}/flight/infiltration/`);
    const breakthrough = await fetch(`${url}/flight/breakthrough/`);

    expect(root.status).toBe(200);
    expect(await root.text()).toContain('LIFTOFF');
    expect([liftoff.status, infiltration.status, breakthrough.status]).toEqual([200, 200, 200]);
    expect(await liftoff.text()).toContain('id="public-preview-controls"');
    expect(await infiltration.text()).toContain('#altitude');
    expect(await breakthrough.text()).toContain('#altitude');
  });

  it('HEAD는 본문 없이 원본 Content-Length를 반환하고 허용하지 않은 경로는 404다', async () => {
    const url = await runningPreview();
    const head = await fetch(`${url}/flight/liftoff/flight.mjs`, { method: 'HEAD' });
    const missing = await fetch(`${url}/flight/liftoff/preview-server.mjs`);

    expect(head.status).toBe(200);
    expect(Number(head.headers.get('content-length'))).toBeGreaterThan(0);
    expect(await head.text()).toBe('');
    expect(missing.status).toBe(404);
  });

  it('POST 요청은 Allow: GET, HEAD와 보안 헤더를 포함한 HTTP 405로 거부한다', async () => {
    const url = await runningPreview();
    const response = await fetch(url, { method: 'POST' });

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET, HEAD');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'self'");
  });

  it('실행 모듈·PNG·share.json은 각각 올바른 MIME과 공개 상태를 반환한다', async () => {
    const url = await runningPreview();
    const module = await fetch(`${url}/flight/liftoff/flight.mjs`);
    const image = await fetch(`${url}/flight/infiltration/sky-infiltration.png`);
    const share = await fetch(`${url}/flight/breakthrough/share.json`);

    expect(module.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
    expect(image.headers.get('content-type')).toBe('image/png');
    expect(share.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(await share.json()).toEqual({ public: true });
  });

  it('잘못된 absolute-form 요청은 HTTP 400으로 거부하고 다음 정상 요청도 계속 제공한다', async () => {
    const url = await runningPreview();
    const malformed = await rawRequest(url, 'http://[');
    const healthy = await fetch(url);

    expect(malformed).toMatch(/^HTTP\/1\.1 400 Bad Request/m);
    expect(healthy.status).toBe(200);
    expect(await healthy.text()).toContain('LIFTOFF');
  });
});
