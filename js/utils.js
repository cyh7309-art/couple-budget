/**
 * Shared Utilities — XSS escaping, local-time dates, number parsing
 * Couple Finance Dashboard ("우리집 가계부")
 */

/**
 * Escape user-supplied text before injecting into innerHTML templates.
 * 메모/카테고리명/사용자명은 상대방 기기에서도 렌더되므로 반드시 이스케이프합니다.
 */
export function esc(value) {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 오늘 날짜를 '로컬 타임존' 기준 YYYY-MM-DD 로 반환.
 * (toISOString()은 UTC 기준이라 KST 자정~오전9시에 하루 전 날짜가 나옵니다)
 */
export function todayLocalStr() {
  return toLocalDateStr(new Date());
}

export function toLocalDateStr(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function currentMonthLocalStr() {
  return todayLocalStr().slice(0, 7);
}

/**
 * '5,000,000원', ' 12000 ' 같은 입력도 안전하게 숫자로 파싱.
 * 유효하지 않으면 null 을 반환합니다 (0과 구분하기 위해).
 */
export function parseAmount(raw) {
  if (raw === undefined || raw === null) return null;
  const cleaned = String(raw).replace(/[,\s원₩]/g, '');
  if (cleaned === '') return null;
  const num = Number(cleaned);
  if (!Number.isFinite(num)) return null;
  return num;
}

/** 1234567 -> "1,234,567" (입력창 보조 표시용) */
export function thousands(num) {
  if (!Number.isFinite(num)) return '';
  return num.toLocaleString('ko-KR');
}
