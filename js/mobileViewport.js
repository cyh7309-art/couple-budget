/**
 * 모바일 입력 안정화
 *  - 키보드가 떠 있는 동안 body 에 .keyboard-open 을 붙여 하단 바를 숨깁니다.
 *  - visualViewport(키보드를 뺀 실제 보이는 영역)의 높이·위치를 CSS 변수로 넘겨
 *    모달이 키보드에 가려지거나 위아래로 흔들리지 않게 합니다.
 */

const TEXT_INPUT = 'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]), textarea, select';

function isMobile() {
  return window.matchMedia('(max-width: 768px), (pointer: coarse)').matches;
}

export function initMobileViewport() {
  const root = document.documentElement;
  const body = document.body;

  document.addEventListener('focusin', (e) => {
    if (!isMobile()) return;
    if (e.target && e.target.matches && e.target.matches(TEXT_INPUT)) {
      body.classList.add('keyboard-open');
    }
  });

  document.addEventListener('focusout', () => {
    // 입력칸 사이를 옮겨 다닐 때 바가 깜빡이지 않도록 잠시 기다렸다 확인합니다
    setTimeout(() => {
      const el = document.activeElement;
      if (!el || !el.matches || !el.matches(TEXT_INPUT)) {
        body.classList.remove('keyboard-open');
      }
    }, 120);
  });

  const vv = window.visualViewport;
  if (!vv) return;

  let frame = 0;
  const sync = () => {
    frame = 0;
    root.style.setProperty('--vv-height', `${vv.height}px`);
    root.style.setProperty('--vv-top', `${vv.offsetTop}px`);
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(sync); };

  vv.addEventListener('resize', schedule);
  vv.addEventListener('scroll', schedule);
  sync();
}
