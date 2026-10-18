import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildClassicAssets, CLASSIC_SOURCE_NAMES } from './states.mjs';

const sources = Object.fromEntries(CLASSIC_SOURCE_NAMES.map(name => [name, readFileSync(new URL(`./sources/${name}.svg`, import.meta.url), 'utf8')]));
const assets = buildClassicAssets(sources);

describe('Classic 바디·터미널 공용 타일', () => {
  for (const kind of ['single', 'double']) {
    for (const state of ['idle', 'on', 'failed', ...(kind === 'double' ? ['partial-off'] : [])]) {
      it(`${kind} ${state}에서 시작·끝 터미널은 1000×200 바디와 동일하다`, () => {
        const suffix = state === 'on' ? '' : `-${state}`;
        const body = assets[`body-${kind}-${state === 'failed' ? 'off' : state}`];
        expect(body).toContain('viewBox="0 0 1000 200"');
        expect(assets[`terminal-start-${kind}${suffix}`]).toBe(body);
        expect(assets[`terminal-end-${kind}${suffix}`]).toBe(body);
        expect(assets[`terminal-${kind}${suffix}`]).toBe(body);
      });
    }
  }
});
