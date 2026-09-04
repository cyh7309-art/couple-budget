/**
 * Theme Controller — 라이트 / 다크 / 시스템 설정 따르기
 * Couple Finance Dashboard ("우리집 가계부")
 */

/**
 * @param mode 'system' | 'light' | 'dark'
 */
export function applyTheme(mode) {
  const root = document.documentElement;
  if (mode === 'dark') root.setAttribute('data-theme', 'dark');
  else if (mode === 'light') root.setAttribute('data-theme', 'light');
  else root.removeAttribute('data-theme'); // 시스템 설정(prefers-color-scheme)에 위임

  // 모바일 브라우저 상단바 색상도 맞춰줍니다
  const isDark = mode === 'dark'
    || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = isDark ? '#0b1220' : '#f1f5f9';
}

/** 시스템 테마가 바뀌면 'system' 모드일 때만 따라갑니다 */
export function watchSystemTheme(getMode) {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = () => { if (getMode() === 'system') applyTheme('system'); };
  if (mq.addEventListener) mq.addEventListener('change', handler);
  else if (mq.addListener) mq.addListener(handler);
}
