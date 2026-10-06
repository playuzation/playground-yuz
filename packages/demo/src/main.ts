import { createApp } from '@playground/api';
import { MemoryStore, type MemoryState } from '@playground/core';
import { localTokenStore, mountApp } from '@playground/web';
import { showBanner } from './banner.ts';
import { createInPageFetch } from './in-page-fetch.ts';
import { seed } from './seed.ts';

const STATE_KEY = 'playground.demo.state';
const TOKEN_KEY = 'playground.demo.token';

function load(): MemoryState | null {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    return raw ? (JSON.parse(raw) as MemoryState) : null;
  } catch {
    return null;
  }
}

function save(state: MemoryState): void {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    // 저장소를 쓸 수 없으면 새로고침 시 초기화된다.
  }
}

const store = new MemoryStore(load() ?? seed());
const app = createApp({ store });

showBanner(() => {
  try {
    localStorage.removeItem(STATE_KEY);
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // 무시
  }
  location.hash = '#/';
  location.reload();
});

mountApp(document.getElementById('app')!, {
  fetch: createInPageFetch(app, () => save(store.state)),
  tokens: localTokenStore(TOKEN_KEY),
});
