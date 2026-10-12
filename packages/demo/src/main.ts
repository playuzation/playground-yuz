import { createApp } from '@playground/api';
import { MemoryStore, type MemoryState } from '@playground/core';
import { localTokenStore, mountApp } from '@playground/web';
import { showBanner } from './banner.ts';
import { createInPageFetch } from './in-page-fetch.ts';
import { seed, seedVersion } from './seed.ts';

const STATE_KEY = 'playground.demo.state';
const TOKEN_KEY = 'playground.demo.token';
const SEED_KEY = 'playground.demo.seed';

function load(): MemoryState | null {
  try {
    // 예시 포스트가 바뀌었으면 예전 상태(글 목록·id가 다름)를 버리고 새 초기 데이터로 시작한다.
    if (localStorage.getItem(SEED_KEY) !== seedVersion()) {
      localStorage.removeItem(STATE_KEY);
      localStorage.removeItem(TOKEN_KEY);
      localStorage.setItem(SEED_KEY, seedVersion());
      return null;
    }
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
