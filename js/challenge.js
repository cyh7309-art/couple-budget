/**
 * 부부의 도전 — 식단 · 운동 · 공복 몸무게 기록의 모델과 계산
 * Couple Finance Dashboard ("우리집 가계부")
 *
 * 기록 한 건 = 한 사람의 하루.
 *   { id: 'chl_<userId>_<YYYY-MM-DD>', userId, date,
 *     weight: 78.4 | null,                                  // 그날 아침 공복 몸무게(kg)
 *     meals:    [{ id, slot, time: 'HH:MM', text }],
 *     workouts: [{ id, name, minutes }],
 *     createdAt, updatedAt }
 *
 * id 가 사람·날짜로 고정되어 있어 같은 날을 여러 번 저장해도 한 건으로 유지됩니다.
 * 각자 자기 기록만 고치므로 두 기기가 같은 행을 동시에 덮어쓸 일이 없습니다.
 */

import { toLocalDateStr } from './utils.js';

export const CHALLENGE_ID_PREFIX = 'chl_';

export const MEAL_SLOTS = [
  { id: 'breakfast', label: '아침', defaultTime: '08:00' },
  { id: 'lunch',     label: '점심', defaultTime: '12:30' },
  { id: 'dinner',    label: '저녁', defaultTime: '19:00' },
  { id: 'snack',     label: '간식', defaultTime: '15:30' }
];

export const WORKOUT_PRESETS = ['걷기', '러닝', '헬스', '홈트', '필라테스', '요가', '수영', '자전거', '스트레칭'];

/** 부부 공유 설정 안의 challenge 항목 기본값 */
export const DEFAULT_CHALLENGE_SETTINGS = {
  startDate: '',     // 도전 시작일 (비우면 첫 기록일)
  shootDate: '',     // 웨딩 촬영일
  weddingDate: '',   // 결혼식
  targets: { husband: null, wife: null },  // 목표 몸무게(kg)
  // 몸무게를 상대에게 숨길지. 숨기면 상대 기기에서는 숫자·변화량·그래프·목표가 모두 가려지고
  // "오늘 쟀는지"만 보입니다. 아내는 기본이 비공개입니다.
  privateWeight: { husband: false, wife: true }
};

export function challengeLogId(userId, date) {
  return `${CHALLENGE_ID_PREFIX}${userId}_${date}`;
}

export function isChallengeLogId(id) {
  return String(id || '').startsWith(CHALLENGE_ID_PREFIX);
}

export function emptyLog(userId, date) {
  return { id: challengeLogId(userId, date), userId, date, weight: null, meals: [], workouts: [] };
}

/** 몸무게도, 식단도, 운동도 없는 기록은 저장하지 않습니다 */
export function isEmptyLog(log) {
  if (!log) return true;
  const hasWeight = Number.isFinite(Number(log.weight)) && Number(log.weight) > 0;
  const meals = Array.isArray(log.meals) ? log.meals.length : 0;
  const workouts = Array.isArray(log.workouts) ? log.workouts.length : 0;
  return !hasWeight && meals === 0 && workouts === 0;
}

export function normalizeChallengeSettings(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const t = s.targets && typeof s.targets === 'object' ? s.targets : {};
  const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);
  const date = (v) => (isDateStr(v) ? v : '');
  const p = s.privateWeight && typeof s.privateWeight === 'object' ? s.privateWeight : {};
  return {
    startDate: date(s.startDate),
    shootDate: date(s.shootDate),
    weddingDate: date(s.weddingDate),
    targets: { husband: num(t.husband), wife: num(t.wife) },
    privateWeight: { husband: p.husband === true, wife: p.wife !== false }
  };
}

/** viewerId 가 ownerId 의 몸무게를 볼 수 없는가 (본인은 항상 볼 수 있습니다) */
export function isWeightHidden(settings, ownerId, viewerId) {
  if (ownerId === viewerId) return false;
  return normalizeChallengeSettings(settings).privateWeight[ownerId] === true;
}

/* ---------- 날짜 ---------- */

export function isDateStr(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function toDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(dateStr, n) {
  const d = toDate(dateStr);
  d.setDate(d.getDate() + n);
  return toLocalDateStr(d);
}

/** b - a (일). 서머타임이 있는 지역에서도 어긋나지 않도록 반올림합니다 */
export function diffDays(a, b) {
  return Math.round((toDate(b) - toDate(a)) / 86400000);
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function weekdayOf(dateStr) {
  return WEEKDAYS[toDate(dateStr).getDay()];
}

/** '10월 9일 (금)' */
export function formatDayLabel(dateStr) {
  const [, m, d] = dateStr.split('-').map(Number);
  return `${m}월 ${d}일 (${weekdayOf(dateStr)})`;
}

/** '10/9' */
export function formatShortDate(dateStr) {
  const [, m, d] = dateStr.split('-').map(Number);
  return `${m}/${d}`;
}

/** 그 날짜가 속한 주의 월요일 */
export function mondayOf(dateStr) {
  const dow = toDate(dateStr).getDay();          // 0 = 일
  return addDays(dateStr, dow === 0 ? -6 : 1 - dow);
}

/**
 * D-day. 남은 날 수를 돌려줍니다 (당일 0, 지난 날은 음수, 날짜가 없으면 null).
 */
export function daysUntil(targetDate, today) {
  if (!isDateStr(targetDate) || !isDateStr(today)) return null;
  return diffDays(today, targetDate);
}

export function formatDday(days) {
  if (days === null || days === undefined) return '';
  if (days === 0) return 'D-DAY';
  return days > 0 ? `D-${days}` : `D+${Math.abs(days)}`;
}

/* ---------- 숫자 ---------- */

/** '78,4' · ' 78.4kg ' 같은 입력을 kg 숫자로. 범위를 벗어나면 null */
export function parseWeight(raw) {
  if (raw === undefined || raw === null) return null;
  const cleaned = String(raw).replace(',', '.').replace(/[^\d.]/g, '');
  if (cleaned === '' || cleaned.split('.').length > 2) return null;
  const n = Math.round(Number(cleaned) * 10) / 10;
  if (!Number.isFinite(n) || n < 20 || n > 300) return null;
  return n;
}

export function formatKg(n) {
  return Number.isFinite(Number(n)) ? Number(n).toFixed(1) : '–';
}

/** +0.3 / -1.2 / 0.0 (부호가 0에 붙지 않게) */
export function formatDelta(n) {
  if (!Number.isFinite(Number(n))) return '';
  const r = Math.round(Number(n) * 10) / 10;
  if (r === 0) return '0.0';
  return (r > 0 ? '+' : '−') + Math.abs(r).toFixed(1);
}

export function isTimeStr(v) {
  return typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
}

function minutesOf(time) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function timeOfMinutes(total) {
  const t = Math.round(total);
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

/** 지금 시각에 어울리는 끼니 */
export function guessMealSlot(hour) {
  if (hour < 10) return 'breakfast';
  if (hour < 15) return 'lunch';
  if (hour < 17) return 'snack';
  if (hour < 22) return 'dinner';
  return 'snack';
}

export function sortMeals(meals) {
  return (Array.isArray(meals) ? meals : []).slice().sort((a, b) =>
    String(a.time || '99:99').localeCompare(String(b.time || '99:99')));
}

/* ---------- 조회 ---------- */

export function logsOf(logs, userId) {
  return (Array.isArray(logs) ? logs : [])
    .filter(l => l && l.userId === userId && isDateStr(l.date))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function findLog(logs, userId, date) {
  return (Array.isArray(logs) ? logs : []).find(l => l && l.userId === userId && l.date === date) || null;
}

/** 몸무게가 적힌 날만, 날짜 오름차순 [{ date, weight }] */
export function weightSeries(logs, userId) {
  return logsOf(logs, userId)
    .filter(l => Number.isFinite(Number(l.weight)) && Number(l.weight) > 0)
    .map(l => ({ date: l.date, weight: Number(l.weight) }));
}

function average(nums) {
  return nums.length === 0 ? null : nums.reduce((a, b) => a + b, 0) / nums.length;
}

/**
 * 한 사람의 몸무게 진행 상황.
 *
 * 공복 몸무게는 수분·염분에 따라 하루에 0.5~1kg 씩 출렁입니다. 그래서 "어제 대비"만 보면
 * 실제 추세와 반대로 읽기 쉽습니다. 최근 7일 평균을 그 전 7일 평균과 견줘 추세를 따로 냅니다.
 */
export function weightProgress(logs, userId, settings, today) {
  const cfg = normalizeChallengeSettings(settings);
  const all = weightSeries(logs, userId);
  const series = cfg.startDate ? all.filter(p => p.date >= cfg.startDate) : all;
  const target = cfg.targets[userId];

  const empty = {
    series, target, start: null, latest: null, previous: null,
    totalDelta: null, dayDelta: null, avg7: null, prevAvg7: null, weekTrend: null,
    remaining: null, reached: false, pace: null
  };
  if (series.length === 0) return empty;

  const start = series[0];
  const latest = series[series.length - 1];
  const previous = series.length > 1 ? series[series.length - 2] : null;

  const inRange = (from, to) => series.filter(p => p.date >= from && p.date <= to).map(p => p.weight);
  const recent = inRange(addDays(today, -6), today);
  const before = inRange(addDays(today, -13), addDays(today, -7));
  const avg7 = average(recent);
  const prevAvg7 = average(before);
  // 한두 번 잰 평균은 추세라고 부르기 어렵습니다
  const weekTrend = (recent.length >= 3 && before.length >= 3) ? avg7 - prevAvg7 : null;

  let remaining = null, reached = false;
  if (target !== null) {
    const losing = start.weight >= target;
    remaining = latest.weight - target;                 // 감량 목표면 양수 = 더 빼야 함
    reached = losing ? latest.weight <= target : latest.weight >= target;
  }

  return {
    series, target, start, latest, previous,
    totalDelta: latest.weight - start.weight,
    dayDelta: previous ? latest.weight - previous.weight : null,
    avg7, prevAvg7, weekTrend,
    remaining, reached,
    pace: requiredPace(latest.weight, target, cfg, today)
  };
}

/**
 * 가장 가까운 일정(촬영 → 결혼식)까지 목표에 닿으려면 필요한 주당 변화량.
 * @returns { eventLabel, eventDate, days, perWeek, steep } | null
 */
export function requiredPace(currentWeight, target, settings, today) {
  if (target === null || !Number.isFinite(currentWeight)) return null;
  const event = nextEvent(settings, today);
  if (!event || event.days <= 0) return null;

  const gap = currentWeight - target;                   // 양수 = 감량 필요
  if (Math.abs(gap) < 0.05) return null;
  const perWeek = gap / (event.days / 7);
  return {
    eventLabel: event.label,
    eventDate: event.date,
    days: event.days,
    perWeek,
    // 주 1kg(또는 체중의 약 1%)을 넘는 감량은 흔히 권장되는 속도를 벗어납니다
    steep: perWeek > Math.max(1, currentWeight * 0.01)
  };
}

/** 아직 지나지 않은 일정 중 가장 가까운 것 */
export function nextEvent(settings, today) {
  const cfg = normalizeChallengeSettings(settings);
  return [
    { key: 'shoot', label: '웨딩 촬영', date: cfg.shootDate },
    { key: 'wedding', label: '결혼식', date: cfg.weddingDate }
  ]
    .filter(e => e.date)
    .map(e => ({ ...e, days: daysUntil(e.date, today) }))
    .filter(e => e.days >= 0)
    .sort((a, b) => a.days - b.days)[0] || null;
}

/** 오늘(또는 어제)까지 이어진 연속 기록 일수 */
export function recordStreak(logs, userId, today) {
  const days = new Set(logsOf(logs, userId).filter(l => !isEmptyLog(l)).map(l => l.date));
  // 오늘 아직 안 적었어도 어제까지 이어졌다면 끊긴 게 아닙니다
  let cursor = days.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/**
 * 최근 7일(오늘 포함) 요약.
 * 마지막 식사 시각은 '그날 가장 늦은 끼니'의 평균입니다.
 */
export function weekSummary(logs, userId, today) {
  const from = addDays(today, -6);
  const week = logsOf(logs, userId).filter(l => l.date >= from && l.date <= today && !isEmptyLog(l));

  let mealCount = 0, workoutMinutes = 0, workoutDays = 0, weightDays = 0;
  const firstMeals = [], lastMeals = [];
  const workoutNames = new Map();

  week.forEach(l => {
    if (Number.isFinite(Number(l.weight)) && Number(l.weight) > 0) weightDays += 1;

    const meals = Array.isArray(l.meals) ? l.meals : [];
    mealCount += meals.length;
    const times = meals.map(m => m.time).filter(isTimeStr).map(minutesOf).sort((a, b) => a - b);
    if (times.length > 0) {
      firstMeals.push(times[0]);
      lastMeals.push(times[times.length - 1]);
    }

    const workouts = Array.isArray(l.workouts) ? l.workouts : [];
    if (workouts.length > 0) workoutDays += 1;
    workouts.forEach(w => {
      const min = Number(w.minutes) || 0;
      workoutMinutes += min;
      const name = String(w.name || '').trim();
      if (name) workoutNames.set(name, (workoutNames.get(name) || 0) + 1);
    });
  });

  const topWorkout = Array.from(workoutNames.entries()).sort((a, b) => b[1] - a[1])[0] || null;

  return {
    from, to: today,
    recordedDays: week.length,
    weightDays, mealCount,
    workoutDays, workoutMinutes,
    topWorkout: topWorkout ? topWorkout[0] : null,
    avgFirstMeal: firstMeals.length ? timeOfMinutes(average(firstMeals)) : null,
    avgLastMeal: lastMeals.length ? timeOfMinutes(average(lastMeals)) : null,
    mealDays: lastMeals.length
  };
}

/** 하루 기록을 한눈에: { weight, mealCount, workoutMinutes, workoutCount, any } */
export function daySnapshot(log) {
  const weight = log && Number.isFinite(Number(log.weight)) && Number(log.weight) > 0 ? Number(log.weight) : null;
  const meals = log && Array.isArray(log.meals) ? log.meals : [];
  const workouts = log && Array.isArray(log.workouts) ? log.workouts : [];
  return {
    weight,
    mealCount: meals.length,
    workoutCount: workouts.length,
    workoutMinutes: workouts.reduce((s, w) => s + (Number(w.minutes) || 0), 0),
    any: weight !== null || meals.length > 0 || workouts.length > 0
  };
}

/* ==========================================================================
   ?demo=1 전용 데모 데이터 — 클라우드에 절대 업로드되지 않습니다.
   ========================================================================== */

export function demoChallengeSettings(today) {
  return {
    startDate: addDays(today, -20),
    shootDate: addDays(today, 23),
    weddingDate: addDays(today, 121),
    targets: { husband: 75, wife: 50 },
    privateWeight: { husband: false, wife: true }
  };
}

export function generateDemoChallengeLogs(today) {
  const breakfasts = ['그릭요거트, 바나나', '삶은 달걀 2개, 방울토마토', '오트밀, 블루베리', '통밀 토스트, 아메리카노'];
  const lunches = ['닭가슴살 샐러드', '현미밥, 된장찌개, 나물', '회사 구내식당 (밥 반 공기)', '포케, 아이스티', '김치찌개, 밥 2/3'];
  const dinners = ['연어 스테이크, 구운 채소', '두부 김치, 현미밥 반 공기', '삼겹살 외식', '샤브샤브', '닭가슴살 볶음밥'];
  const snacks = ['아몬드 한 줌', '프로틴 쉐이크', '사과 반쪽', '라떼'];
  const workouts = {
    husband: [['러닝', 30], ['헬스', 60], ['걷기', 40], ['헬스', 50]],
    wife: [['필라테스', 50], ['걷기', 45], ['홈트', 25], ['요가', 40]]
  };
  const base = { husband: 79.6, wife: 53.8 };
  const slope = { husband: -0.11, wife: -0.07 };       // 하루 평균 변화
  const logs = [];

  ['husband', 'wife'].forEach((userId, u) => {
    for (let i = 20; i >= 0; i--) {
      const date = addDays(today, -i);
      const day = 20 - i;
      const seed = day * 7 + u * 3;
      // 사인 두 개를 겹쳐 '출렁이지만 내려가는' 모양을 만듭니다 (난수 없이 항상 같은 결과)
      const wobble = Math.sin(seed * 1.7) * 0.35 + Math.sin(seed * 0.6) * 0.2;
      const skipWeight = (day % 9 === 5 && u === 1) || (day % 11 === 7 && u === 0);
      const isToday = i === 0;

      const meals = [];
      const push = (slot, time, text) => meals.push({ id: `m_${userId}_${day}_${slot}`, slot, time, text });
      if (!(day % 6 === 4)) push('breakfast', u === 0 ? '07:40' : '08:10', breakfasts[seed % breakfasts.length]);
      if (!isToday || u === 0) push('lunch', '12:30', lunches[seed % lunches.length]);
      if (!isToday) push('dinner', day % 5 === 2 ? '20:50' : '19:10', dinners[seed % dinners.length]);
      if (day % 3 === 1 && !isToday) push('snack', '15:40', snacks[seed % snacks.length]);

      const list = [];
      const rest = (day + u * 2) % 7;
      if (rest !== 3 && rest !== (u === 0 ? 6 : 0) && !(isToday && u === 1)) {
        const [name, minutes] = workouts[userId][(day + u) % workouts[userId].length];
        list.push({ id: `w_${userId}_${day}`, name, minutes });
      }

      const stamp = `${date}T09:00:00.000Z`;
      logs.push({
        id: challengeLogId(userId, date), userId, date,
        weight: skipWeight ? null : Math.round((base[userId] + slope[userId] * day + wobble) * 10) / 10,
        meals, workouts: list,
        createdAt: stamp, updatedAt: stamp
      });
    }
  });

  return logs;
}
