// preview-server.mjs 중 TypeScript 코드(vite.config.ts, vite.lab.config.ts, preview-server.test.ts)가 import하는 export만 선언한다.
import type { IncomingMessage, Server, ServerResponse } from 'node:http';

export interface PreviewServerOptions {
  /** 이 경로 아래로 시연을 연다(예: /__lab/flight-background-preview). 비우면 루트. */
  basePath?: string;
}

export interface PreviewViews {
  readonly liftoff: string;
  readonly infiltration: string;
  readonly breakthrough: string;
}

export interface PreviewRoute {
  name: string;
  filePath?: string;
  body?: Buffer;
  injectedStyle: string;
}

export const breakthroughSearch: string;
export function previewViewsAt(basePath?: string): PreviewViews;
export const previewViews: PreviewViews;
/** 허용 목록에 없는 경로는 null이다. */
export function resolvePreviewRoute(pathname: string): PreviewRoute | null;
/** 정적 Lab 빌드에 쓸 공개 경로와 파일 내용. */
export function staticPreviewEntriesAt(basePath?: string): Promise<{ pathname: string; body: Buffer }[]>;
export function handlePreviewRequest(request: IncomingMessage, response: ServerResponse, options?: PreviewServerOptions): void;
export function createPreviewServer(options?: PreviewServerOptions): Server;
