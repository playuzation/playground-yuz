import type { FetchFn } from '@playground/web';

interface FetchHandler {
  fetch(request: Request): Response | Promise<Response>;
}

// 네트워크 대신 같은 페이지 안의 API 앱(Hono)으로 요청을 보낸다.
export function createInPageFetch(app: FetchHandler, afterEach: () => void): FetchFn {
  return async (input, init) => {
    const response = await app.fetch(new Request(new URL(input, 'http://demo.invalid'), init));
    afterEach();
    return response;
  };
}
