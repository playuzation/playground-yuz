// 데모임을 알리는 상단 배너. web 패키지는 이 배너의 존재를 모른다.
export function showBanner(onReset: () => void): void {
  const bar = document.createElement('div');
  bar.setAttribute('role', 'status');
  bar.style.cssText =
    'display:flex;gap:8px;align-items:center;justify-content:center;flex-wrap:wrap;padding:6px 16px;' +
    'background:#fff3bf;color:#5c3c00;font-size:14px;';
  bar.textContent = '데모 모드 · 데이터는 이 브라우저에만 저장됩니다';
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.textContent = '초기화';
  reset.style.cssText = 'padding:2px 10px;font-size:13px;background:#5c3c00;color:#fff3bf;';
  reset.addEventListener('click', onReset);
  bar.append(reset);
  document.body.prepend(bar);
}
