/**
 * 부부의 도전 View — 웨딩 촬영 / 결혼식까지 식단 · 운동 · 공복 몸무게 기록
 *
 * 화면 규칙
 *  - 각자 자기 기록만 고칩니다. 상대 기록은 전부 보이지만 읽기 전용입니다.
 *    ("이 기기 사용자"는 기기별 설정이라 두 사람 폰이 서로 다른 값을 갖습니다)
 *  - 상대가 저장하면 실시간으로 화면이 다시 그려집니다. 그때 적던 글이 날아가지 않도록
 *    입력 중인 값은 ui.* 에 따로 들고 있다가 다시 채워 넣고, 내용이 같으면 아예 다시 그리지 않습니다.
 */

import { StorageManager } from '../storage.js';
import { esc, todayLocalStr } from '../utils.js';
import {
  MEAL_SLOTS, WORKOUT_PRESETS,
  addDays, mondayOf, weekdayOf, formatDayLabel, formatShortDate, diffDays,
  daysUntil, formatDday, nextEvent, isDateStr, isTimeStr,
  parseWeight, formatKg, formatDelta, guessMealSlot, sortMeals,
  findLog, weightProgress, recordStreak, weekSummary, daySnapshot
} from '../challenge.js';

const USER_IDS = ['husband', 'wife'];

/** 화면을 다시 그려도 유지되어야 하는 상태 (탭을 옮겼다 돌아와도 남습니다) */
const ui = {
  date: null,
  person: null,
  weight: null,                                   // 입력 중인 몸무게 글자 (null = 저장된 값 표시)
  meal: { slot: null, time: null, timeTouched: false, text: '', editId: null },
  workout: { name: '', minutes: '', editId: null },
  settingsOpen: false,
  settings: null,                                 // 설정 폼에 입력 중인 값
  chartPick: null,                                // 그래프에서 짚은 날짜
  lastHtml: ''
};

let resizeBound = false;
let redrawChart = null;

function slotLabel(id) {
  const s = MEAL_SLOTS.find(x => x.id === id);
  return s ? s.label : '식사';
}

function nowTimeStr() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function resetDrafts() {
  ui.weight = null;
  ui.meal = { slot: null, time: null, timeTouched: false, text: '', editId: null };
  ui.workout = { name: '', minutes: '', editId: null };
}

export function renderChallengeView(containerEl, refreshApp) {
  const today = todayLocalStr();
  const users = StorageManager.getUsers();
  const nameOf = (id) => users[id] ? users[id].name : '';
  const otherOf = (id) => (id === 'husband' ? 'wife' : 'husband');

  if (!isDateStr(ui.date) || ui.date > today) ui.date = today;

  const me = () => {
    const v = StorageManager.getDeviceSettings().challengeMe;
    return USER_IDS.includes(v) ? v : null;
  };

  /* ====================== 조각 템플릿 ====================== */

  function heroHtml(cfg) {
    const events = [
      { label: '웨딩 촬영', date: cfg.shootDate },
      { label: '결혼식', date: cfg.weddingDate }
    ].filter(e => e.date).map(e => ({ ...e, days: daysUntil(e.date, today) }));

    if (events.length === 0) {
      return `
        <section class="hero ch-hero">
          <span class="hero-label">부부의 도전</span>
          <div class="ch-hero-empty">
            <p>웨딩 촬영일과 결혼식 날짜를 정하면 남은 날을 세어 드려요.</p>
            <button class="btn-primary-sm ch-btn" data-act="open-settings">날짜 정하기</button>
          </div>
        </section>`;
    }

    const next = nextEvent(cfg, today);
    const main = next ? events.find(e => e.date === next.date && e.label === next.label) : events[events.length - 1];
    const rest = events.filter(e => e !== main);
    const dayNo = cfg.startDate && cfg.startDate <= today ? diffDays(cfg.startDate, today) + 1 : null;

    const mainText = main.days > 0 ? `${esc(main.label)}까지`
      : main.days === 0 ? `오늘은 ${esc(main.label)} 날`
      : `${esc(main.label)} 지남`;

    return `
      <section class="hero ch-hero">
        <span class="hero-label">${mainText}</span>
        <div class="hero-amount"><strong>${esc(formatDday(main.days))}</strong></div>
        <div class="hero-stats">
          <div class="hero-stat">
            <strong>${esc(formatDayLabel(main.date))}</strong>
            <span class="hero-stat-label">${esc(main.label)}</span>
          </div>
          ${rest.map(e => `
            <div class="hero-stat">
              <strong>${esc(formatDday(e.days))} · ${esc(formatDayLabel(e.date))}</strong>
              <span class="hero-stat-label">${esc(e.label)}</span>
            </div>`).join('')}
          ${dayNo ? `
            <div class="hero-stat">
              <strong>${dayNo}일째</strong>
              <span class="hero-stat-label">도전 시작 ${esc(formatShortDate(cfg.startDate))}</span>
            </div>` : ''}
        </div>
      </section>`;
  }

  function chooserHtml() {
    return `
      <section class="card ch-chooser">
        <h3 class="card-title">이 기기는 누가 쓰나요?</h3>
        <p class="card-desc">각자 자기 기록만 고칠 수 있어요. 상대 기록은 언제든 볼 수 있어요.</p>
        <div class="btn-group-row margin-top-sm">
          ${USER_IDS.map(id => `
            <button class="btn-toggle ch-btn" data-act="set-me" data-user="${id}">
              ${esc(users[id].avatar || '')} ${esc(nameOf(id))}
            </button>`).join('')}
        </div>
      </section>`;
  }

  function peopleHtml(logs, cfg, meId) {
    return `
      <section class="board-section">
        <div class="section-head">
          <h3 class="section-label">둘의 오늘</h3>
          <span class="section-note">눌러서 기록 보기</span>
        </div>
        <div class="ch-people">
          ${USER_IDS.map(id => {
            const snap = daySnapshot(findLog(logs, id, today));
            const prog = weightProgress(logs, id, cfg, today);
            const active = ui.person === id;
            return `
              <button class="ch-person ${active ? 'is-active' : ''}" data-act="pick-person" data-user="${id}"
                      aria-pressed="${active}">
                <span class="ch-person-name">
                  <span class="who-dot ${id === 'husband' ? 'who-h' : 'who-w'}"></span>${esc(nameOf(id))}${id === meId ? '<span class="ch-me">나</span>' : ''}
                </span>
                <span class="ch-person-weight">
                  ${prog.latest ? `<strong>${formatKg(prog.latest.weight)}</strong><span class="ch-unit">kg</span>` : '<strong class="ch-none">–</strong>'}
                </span>
                <span class="ch-person-delta">
                  ${prog.latest && prog.series.length > 1
                    ? `시작보다 ${esc(formatDelta(prog.totalDelta))}kg`
                    : (prog.latest ? '첫 기록' : '몸무게 기록 전')}
                </span>
                <span class="ch-checks">
                  <span class="ch-check ${snap.weight !== null ? 'is-done' : ''}">몸무게${snap.weight !== null ? ' ✓' : ''}</span>
                  <span class="ch-check ${snap.mealCount > 0 ? 'is-done' : ''}">식단 ${snap.mealCount}</span>
                  <span class="ch-check ${snap.workoutCount > 0 ? 'is-done' : ''}">운동 ${snap.workoutMinutes > 0 ? snap.workoutMinutes + '분' : snap.workoutCount}</span>
                </span>
              </button>`;
          }).join('')}
        </div>
      </section>`;
  }

  function dayNavHtml(logs) {
    const monday = mondayOf(ui.date);
    const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
    return `
      <div class="ch-daynav">
        <button class="ch-nav-btn" data-act="prev-day" aria-label="이전 날">‹</button>
        <div class="ch-day-title">
          ${esc(formatDayLabel(ui.date))}${ui.date === today ? '<span class="ch-today-tag">오늘</span>' : ''}
        </div>
        <button class="ch-nav-btn" data-act="next-day" aria-label="다음 날" ${ui.date >= today ? 'disabled' : ''}>›</button>
        ${ui.date !== today ? '<button class="btn-secondary-sm ch-btn-today" data-act="today">오늘로</button>' : ''}
      </div>
      <div class="ch-week" role="group" aria-label="이번 주">
        ${days.map(d => {
          const future = d > today;
          const snap = daySnapshot(findLog(logs, ui.person, d));
          return `
            <button class="ch-weekday ${d === ui.date ? 'is-active' : ''} ${d === today ? 'is-today' : ''}"
                    data-act="pick-day" data-date="${d}" ${future ? 'disabled' : ''}
                    aria-label="${esc(formatDayLabel(d))}${snap.any ? ' 기록 있음' : ''}">
              <span class="ch-weekday-name">${weekdayOf(d)}</span>
              <span class="ch-weekday-num">${Number(d.slice(8))}</span>
              <span class="ch-weekday-dot ${snap.any ? 'is-on' : ''}"></span>
            </button>`;
        }).join('')}
      </div>`;
  }

  function weightBlockHtml(logs, log, editable) {
    const saved = log && Number(log.weight) > 0 ? Number(log.weight) : null;
    // 바로 앞 기록과 비교 (어제가 비어 있으면 그 전 기록)
    const prev = logs
      .filter(l => l.userId === ui.person && l.date < ui.date && Number(l.weight) > 0)
      .sort((a, b) => b.date.localeCompare(a.date))[0] || null;

    let hint = '';
    if (saved !== null && prev) {
      const gap = diffDays(prev.date, ui.date);
      hint = `${gap === 1 ? '전날' : esc(formatShortDate(prev.date))} ${formatKg(prev.weight)}kg보다 <strong>${esc(formatDelta(saved - Number(prev.weight)))}kg</strong>`;
    } else if (saved === null && prev) {
      hint = `지난 기록 ${esc(formatShortDate(prev.date))} · ${formatKg(prev.weight)}kg`;
    } else if (saved === null && editable) {
      hint = '아침에 일어나 화장실에 다녀온 뒤, 먹기 전에 재면 날마다 비교하기 좋아요.';
    }

    return `
      <div class="ch-block">
        <div class="ch-block-head">
          <h4 class="ch-block-title">공복 몸무게</h4>
          ${editable && saved !== null ? '<button class="btn-text ch-link" data-act="clear-weight">지우기</button>' : ''}
        </div>
        ${editable ? `
          <div class="ch-weight-row">
            <div class="ch-weight-field">
              <input type="text" inputmode="decimal" id="ch-weight" class="form-input ch-weight-input"
                     placeholder="0.0" maxlength="6" autocomplete="off" aria-label="공복 몸무게 (kg)" />
              <span class="ch-unit">kg</span>
            </div>
            <button class="btn-primary-sm ch-btn" data-act="save-weight">${saved !== null ? '고치기' : '저장'}</button>
          </div>
        ` : `
          <div class="ch-weight-read">
            ${saved !== null ? `<strong>${formatKg(saved)}</strong><span class="ch-unit">kg</span>` : '<span class="ch-none">기록 없음</span>'}
          </div>
        `}
        ${hint ? `<p class="ch-hint">${hint}</p>` : ''}
      </div>`;
  }

  function mealBlockHtml(log, editable) {
    const meals = sortMeals(log ? log.meals : []);
    const slot = ui.meal.slot || guessMealSlot(new Date().getHours());
    return `
      <div class="ch-block">
        <div class="ch-block-head">
          <h4 class="ch-block-title">식단</h4>
          <span class="ch-count">${meals.length > 0 ? `${meals.length}번` : ''}</span>
        </div>

        ${meals.length === 0 ? `<p class="ch-empty">${editable ? '먹은 것을 적어 보세요.' : '기록 없음'}</p>` : `
          <ul class="ch-list">
            ${meals.map(m => `
              <li class="ch-item ${ui.meal.editId === m.id ? 'is-editing' : ''}">
                <span class="ch-item-time">${isTimeStr(m.time) ? esc(m.time) : '--:--'}</span>
                <span class="ch-item-body">
                  <span class="ch-slot">${esc(slotLabel(m.slot))}</span>
                  <span class="ch-item-text">${esc(m.text)}</span>
                </span>
                ${editable ? `
                  <span class="ch-item-actions">
                    <button class="btn-icon ch-icon-btn" data-act="meal-edit" data-id="${esc(m.id)}" aria-label="수정">✏️</button>
                    <button class="btn-icon ch-icon-btn" data-act="meal-del" data-id="${esc(m.id)}" aria-label="삭제">🗑️</button>
                  </span>` : ''}
              </li>`).join('')}
          </ul>`}

        ${editable ? `
          <div class="ch-form">
            <div class="chips-grid ch-chips">
              ${MEAL_SLOTS.map(s => `
                <button class="chip-cat ${slot === s.id ? 'active' : ''}" data-act="meal-slot" data-slot="${s.id}"
                        aria-pressed="${slot === s.id}">${s.label}</button>`).join('')}
            </div>
            <div class="ch-form-row">
              <input type="time" id="ch-meal-time" class="form-input ch-time-input" aria-label="식사 시간" />
              <input type="text" id="ch-meal-text" class="form-input" maxlength="120" autocomplete="off"
                     placeholder="예: 현미밥, 닭가슴살, 샐러드" aria-label="먹은 것" />
            </div>
            <div class="form-actions">
              ${ui.meal.editId ? '<button class="btn-secondary-sm ch-btn" data-act="meal-cancel">취소</button>' : ''}
              <button class="btn-primary-sm ch-btn" data-act="meal-save">${ui.meal.editId ? '수정 저장' : '식사 추가'}</button>
            </div>
          </div>` : ''}
      </div>`;
  }

  function workoutBlockHtml(log, editable) {
    const workouts = log && Array.isArray(log.workouts) ? log.workouts : [];
    const total = workouts.reduce((s, w) => s + (Number(w.minutes) || 0), 0);
    return `
      <div class="ch-block">
        <div class="ch-block-head">
          <h4 class="ch-block-title">운동</h4>
          <span class="ch-count">${total > 0 ? `총 ${total}분` : ''}</span>
        </div>

        ${workouts.length === 0 ? `<p class="ch-empty">${editable ? '오늘 움직인 것을 적어 보세요. 쉬는 날은 비워 두면 돼요.' : '기록 없음'}</p>` : `
          <ul class="ch-list">
            ${workouts.map(w => `
              <li class="ch-item ${ui.workout.editId === w.id ? 'is-editing' : ''}">
                <span class="ch-item-time">${Number(w.minutes) > 0 ? `${Number(w.minutes)}분` : '–'}</span>
                <span class="ch-item-body"><span class="ch-item-text">${esc(w.name)}</span></span>
                ${editable ? `
                  <span class="ch-item-actions">
                    <button class="btn-icon ch-icon-btn" data-act="wk-edit" data-id="${esc(w.id)}" aria-label="수정">✏️</button>
                    <button class="btn-icon ch-icon-btn" data-act="wk-del" data-id="${esc(w.id)}" aria-label="삭제">🗑️</button>
                  </span>` : ''}
              </li>`).join('')}
          </ul>`}

        ${editable ? `
          <div class="ch-form">
            <div class="chips-grid ch-chips">
              ${WORKOUT_PRESETS.map(n => `
                <button class="chip-cat" data-act="wk-preset" data-name="${esc(n)}">${esc(n)}</button>`).join('')}
            </div>
            <div class="ch-form-row ch-form-row-workout">
              <input type="text" id="ch-wk-name" class="form-input" maxlength="40" autocomplete="off"
                     placeholder="운동 이름" aria-label="운동 이름" />
              <div class="ch-min-field">
                <input type="text" inputmode="numeric" id="ch-wk-min" class="form-input" maxlength="3"
                       placeholder="30" autocomplete="off" aria-label="운동 시간 (분)" />
                <span class="ch-unit">분</span>
              </div>
            </div>
            <div class="form-actions">
              ${ui.workout.editId ? '<button class="btn-secondary-sm ch-btn" data-act="wk-cancel">취소</button>' : ''}
              <button class="btn-primary-sm ch-btn" data-act="wk-save">${ui.workout.editId ? '수정 저장' : '운동 추가'}</button>
            </div>
          </div>` : ''}
      </div>`;
  }

  function dayCardHtml(logs, meId) {
    const editable = ui.person === meId;
    const log = findLog(logs, ui.person, ui.date);
    return `
      <section class="card ch-day">
        ${dayNavHtml(logs)}
        <div class="ch-day-owner">
          <span class="who-dot ${ui.person === 'husband' ? 'who-h' : 'who-w'}"></span>
          <span><strong>${esc(nameOf(ui.person))}</strong>의 기록</span>
          ${editable ? '' : `<span class="ch-readonly">보기 전용 · ${esc(nameOf(ui.person))}의 기기에서 적어요</span>`}
        </div>
        ${weightBlockHtml(logs, log, editable)}
        ${mealBlockHtml(log, editable)}
        ${workoutBlockHtml(log, editable)}
      </section>`;
  }

  function weightCardHtml(prog) {
    const name = esc(nameOf(ui.person));
    if (!prog.latest) {
      return `
        <section class="card ch-trend">
          <h3 class="card-title">${name}의 몸무게 변화</h3>
          <div class="empty-state ch-empty-state">
            <span class="empty-icon">⚖️</span>
            <p>공복 몸무게를 적기 시작하면 변화가 그래프로 그려져요.</p>
          </div>
        </section>`;
    }

    const tiles = [`
      <div class="ch-tile">
        <span class="ch-tile-label">시작 → 지금</span>
        <strong>${formatKg(prog.start.weight)} → ${formatKg(prog.latest.weight)}</strong>
        <span class="ch-tile-sub">${prog.series.length > 1 ? `${esc(formatDelta(prog.totalDelta))}kg · ${esc(formatShortDate(prog.start.date))}부터` : '첫 기록'}</span>
      </div>`];

    if (prog.target !== null) {
      tiles.push(`
        <div class="ch-tile">
          <span class="ch-tile-label">목표</span>
          <strong>${formatKg(prog.target)}kg</strong>
          <span class="ch-tile-sub">${prog.reached ? '목표에 도착했어요' : `${formatKg(Math.abs(prog.remaining))}kg 남음`}</span>
        </div>`);
    }

    if (prog.avg7 !== null) {
      tiles.push(`
        <div class="ch-tile">
          <span class="ch-tile-label">최근 7일 평균</span>
          <strong>${formatKg(prog.avg7)}kg</strong>
          <span class="ch-tile-sub">${prog.weekTrend !== null ? `그 전 7일보다 ${esc(formatDelta(prog.weekTrend))}kg` : '추세는 기록이 더 쌓이면 보여요'}</span>
        </div>`);
    }

    let pace = '';
    if (prog.pace && !prog.reached) {
      const p = prog.pace;
      const per = formatKg(Math.abs(p.perWeek));
      const dir = p.perWeek > 0 ? '줄이면' : '늘리면';
      pace = p.steep
        ? `<p class="ch-pace is-steep">${esc(p.eventLabel)}까지 ${p.days}일, 목표에 닿으려면 주에 ${per}kg씩 줄여야 해요.
             주 0.5~1kg이 흔히 권하는 속도라서, 목표나 기준 날짜를 다시 잡아 보는 것도 방법이에요.</p>`
        : `<p class="ch-pace">${esc(p.eventLabel)}까지 ${p.days}일. 주에 <strong>${per}kg</strong>씩 ${dir} 목표에 닿아요.</p>`;
    }

    return `
      <section class="card ch-trend">
        <div class="card-title-row">
          <h3 class="card-title">${name}의 몸무게 변화</h3>
          <span class="section-note">공복 기준 · ${prog.series.length}회 기록</span>
        </div>
        <div class="ch-tiles">${tiles.join('')}</div>
        ${prog.series.length > 1 ? `
          <div class="ch-chart" id="ch-chart" data-user="${ui.person}"></div>
          <p class="ch-chart-readout" id="ch-chart-readout" aria-live="polite"></p>
          <p class="chart-note">하루 몸무게는 수분과 염분에 따라 0.5~1kg씩 출렁여요. 하루 변화보다 7일 평균을 보면 흐름이 보여요.</p>
        ` : '<p class="ch-hint">한 번 더 기록하면 그래프가 그려져요.</p>'}
        ${pace}
      </section>`;
  }

  function weekCardHtml(logs) {
    const sums = USER_IDS.map(id => ({
      id, s: weekSummary(logs, id, today), streak: recordStreak(logs, id, today)
    }));
    const row = (label, fn) => `
      <tr>
        <th scope="row">${label}</th>
        ${sums.map(x => `<td>${fn(x)}</td>`).join('')}
      </tr>`;
    const dash = '<span class="ch-none">–</span>';

    return `
      <section class="card ch-weekcard">
        <div class="card-title-row">
          <h3 class="card-title">최근 7일</h3>
          <span class="section-note">${esc(formatShortDate(sums[0].s.from))} ~ ${esc(formatShortDate(today))}</span>
        </div>
        <div class="ch-table-wrap">
          <table class="ch-table">
            <thead>
              <tr>
                <th scope="col"><span class="ch-sr">항목</span></th>
                ${sums.map(x => `<th scope="col"><span class="who-dot ${x.id === 'husband' ? 'who-h' : 'who-w'}"></span>${esc(nameOf(x.id))}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${row('기록한 날', x => `<strong>${x.s.recordedDays}</strong> / 7일`)}
              ${row('연속 기록', x => x.streak > 0 ? `<strong>${x.streak}</strong>일째` : dash)}
              ${row('몸무게 잰 날', x => `<strong>${x.s.weightDays}</strong>일`)}
              ${row('운동', x => x.s.workoutDays > 0
                ? `<strong>${x.s.workoutDays}</strong>일 · ${x.s.workoutMinutes}분${x.s.topWorkout ? `<span class="ch-td-sub">주로 ${esc(x.s.topWorkout)}</span>` : ''}`
                : dash)}
              ${row('첫 끼 평균', x => x.s.avgFirstMeal ? esc(x.s.avgFirstMeal) : dash)}
              ${row('마지막 끼 평균', x => x.s.avgLastMeal ? esc(x.s.avgLastMeal) : dash)}
            </tbody>
          </table>
        </div>
      </section>`;
  }

  function settingsCardHtml(meId) {
    return `
      <section class="card ch-settings">
        <button class="detail-toggle ch-settings-toggle ${ui.settingsOpen ? 'open' : ''}" data-act="toggle-settings" aria-expanded="${ui.settingsOpen}"
                aria-controls="ch-settings-panel">
          <span class="detail-toggle-label">도전 설정</span>
          <span class="detail-toggle-summary">날짜 · 목표 몸무게 · 이 기기 사용자</span>
          <svg class="detail-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
        <div id="ch-settings-panel" class="ch-settings-panel" ${ui.settingsOpen ? '' : 'hidden'}>
          <div class="ch-settings-grid">
            <div class="form-group">
              <label class="form-label" for="ch-set-shoot">웨딩 촬영일</label>
              <input type="date" id="ch-set-shoot" class="form-input" />
            </div>
            <div class="form-group">
              <label class="form-label" for="ch-set-wedding">결혼식</label>
              <input type="date" id="ch-set-wedding" class="form-input" />
            </div>
            <div class="form-group">
              <label class="form-label" for="ch-set-start">도전 시작일</label>
              <input type="date" id="ch-set-start" class="form-input" />
            </div>
            ${USER_IDS.map(id => `
              <div class="form-group">
                <label class="form-label" for="ch-set-target-${id}">${esc(nameOf(id))} 목표 몸무게 (kg)</label>
                <input type="text" inputmode="decimal" id="ch-set-target-${id}" class="form-input" maxlength="6"
                       placeholder="비워 두면 목표 없이 기록만" autocomplete="off" />
              </div>`).join('')}
            <div class="form-group">
              <label class="form-label" for="ch-set-me">이 기기 사용자</label>
              <select id="ch-set-me" class="form-select">
                ${USER_IDS.map(id => `<option value="${id}" ${meId === id ? 'selected' : ''}>${esc(nameOf(id))}</option>`).join('')}
              </select>
            </div>
          </div>
          <p class="card-desc">날짜와 목표는 두 기기에 같이 적용돼요. 시작일을 비우면 첫 기록부터 셉니다. ‘이 기기 사용자’만 이 기기에 저장돼요.</p>
          <div class="form-actions">
            <button class="btn-primary-sm ch-btn" data-act="save-settings">설정 저장</button>
          </div>
        </div>
      </section>`;
  }

  /* ====================== 그래프 (인라인 SVG — 오프라인에서도 그려집니다) ====================== */

  function drawChart(root) {
    const box = root.querySelector('#ch-chart');
    if (!box) { redrawChart = null; return; }

    const userId = box.getAttribute('data-user');
    const prog = weightProgress(StorageManager.getChallengeLogs(), userId, StorageManager.getChallengeSettings(), today);
    const pts = prog.series;
    if (pts.length < 2) { box.innerHTML = ''; return; }

    const W = Math.max(260, Math.round(box.clientWidth || 320));
    const H = 190;
    const pad = { l: 38, r: 16, t: 16, b: 26 };
    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;

    const values = pts.map(p => p.weight);
    let lo = Math.min(...values), hi = Math.max(...values);
    // 목표선은 데이터와 너무 멀지 않을 때만 축에 넣습니다 (멀면 실제 변화가 납작해 보입니다)
    const span0 = Math.max(hi - lo, 1);
    const showTarget = prog.target !== null && prog.target >= lo - span0 * 3 && prog.target <= hi + span0 * 3;
    if (showTarget) { lo = Math.min(lo, prog.target); hi = Math.max(hi, prog.target); }

    const rough = Math.max(hi - lo, 0.8) / 3;
    const step = [0.2, 0.5, 1, 2, 5, 10].find(s => s >= rough) || 10;
    const y0 = Math.floor((lo - step * 0.25) / step) * step;
    const y1 = Math.ceil((hi + step * 0.25) / step) * step;
    const ticks = [];
    for (let v = y0; v <= y1 + 1e-9; v += step) ticks.push(Math.round(v * 10) / 10);

    const first = pts[0].date, last = pts[pts.length - 1].date;
    const totalDays = Math.max(diffDays(first, last), 1);
    const x = (date) => pad.l + (diffDays(first, date) / totalDays) * iw;
    const y = (v) => pad.t + (1 - (v - y0) / (y1 - y0)) * ih;

    const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.date).toFixed(1)},${y(p.weight).toFixed(1)}`).join(' ');
    const dense = pts.length > Math.max(18, iw / 14);

    // x축 눈금: 처음 · 가운데 · 끝 (좁으면 처음과 끝만)
    const xLabels = [first, last];
    if (iw > 240 && totalDays >= 6) xLabels.splice(1, 0, addDays(first, Math.round(totalDays / 2)));

    const lastPt = pts[pts.length - 1];
    // 마지막 값 이름표는 선이 지나가지 않는 쪽에 둡니다 (내려오는 중이면 아래, 올라가는 중이면 위)
    const prevPt = pts[pts.length - 2];
    const wantBelow = prevPt.weight > lastPt.weight;
    const labelAbove = wantBelow ? y(lastPt.weight) > pad.t + ih - 18 : y(lastPt.weight) > pad.t + 16;

    box.innerHTML = `
      <svg class="ch-svg ch-svg-${userId}" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img"
           aria-label="${esc(nameOf(userId))} 공복 몸무게 추이. ${esc(formatShortDate(first))} ${formatKg(pts[0].weight)}kg에서 ${esc(formatShortDate(last))} ${formatKg(lastPt.weight)}kg">
        ${ticks.map(v => `
          <line class="ch-grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"></line>
          <text class="ch-axis" x="${pad.l - 6}" y="${(y(v) + 3.5).toFixed(1)}" text-anchor="end">${step < 1 ? v.toFixed(1) : v}</text>`).join('')}
        ${xLabels.map((d, i) => `
          <text class="ch-axis" x="${x(d).toFixed(1)}" y="${H - 7}"
                text-anchor="${i === 0 ? 'start' : (i === xLabels.length - 1 ? 'end' : 'middle')}">${esc(formatShortDate(d))}</text>`).join('')}
        ${showTarget ? `
          <line class="ch-target" x1="${pad.l}" x2="${W - pad.r}" y1="${y(prog.target).toFixed(1)}" y2="${y(prog.target).toFixed(1)}"></line>
          <text class="ch-target-label" x="${pad.l + 4}" y="${(y(prog.target) - 5).toFixed(1)}">목표 ${formatKg(prog.target)}</text>` : ''}
        <path class="ch-line" d="${line}"></path>
        ${dense ? '' : pts.slice(0, -1).map(p => `<circle class="ch-dot" cx="${x(p.date).toFixed(1)}" cy="${y(p.weight).toFixed(1)}" r="2.6"></circle>`).join('')}
        <circle class="ch-dot ch-dot-last" cx="${x(last).toFixed(1)}" cy="${y(lastPt.weight).toFixed(1)}" r="4.2"></circle>
        <text class="ch-last-label" x="${Math.min(x(last), W - pad.r).toFixed(1)}" y="${(y(lastPt.weight) + (labelAbove ? -9 : 17)).toFixed(1)}" text-anchor="end">${formatKg(lastPt.weight)}</text>
        <g class="ch-pick" id="ch-pick" hidden>
          <line class="ch-pick-line" y1="${pad.t}" y2="${pad.t + ih}"></line>
          <circle class="ch-pick-dot" r="5"></circle>
        </g>
        <rect class="ch-hit" x="${pad.l}" y="0" width="${iw}" height="${H}"></rect>
      </svg>`;

    const svg = box.querySelector('svg');
    const pick = svg.querySelector('#ch-pick');
    const readout = root.querySelector('#ch-chart-readout');

    const show = (p) => {
      if (!readout) return;
      const idx = pts.indexOf(p);
      const prev = idx > 0 ? pts[idx - 1] : null;
      readout.innerHTML = `${esc(formatDayLabel(p.date))} · <strong>${formatKg(p.weight)}kg</strong>`
        + (prev ? ` <span class="ch-readout-sub">앞 기록보다 ${esc(formatDelta(p.weight - prev.weight))}</span>` : '');
    };
    const mark = (p) => {
      pick.removeAttribute('hidden');
      pick.querySelector('line').setAttribute('x1', x(p.date));
      pick.querySelector('line').setAttribute('x2', x(p.date));
      pick.querySelector('circle').setAttribute('cx', x(p.date));
      pick.querySelector('circle').setAttribute('cy', y(p.weight));
      show(p);
    };

    const picked = ui.chartPick ? pts.find(p => p.date === ui.chartPick) : null;
    if (picked) mark(picked); else show(lastPt);

    const onPoint = (e) => {
      const rect = svg.getBoundingClientRect();
      const px = (e.clientX - rect.left) * (W / rect.width);
      let best = pts[0], bestDist = Infinity;
      pts.forEach(p => {
        const d = Math.abs(x(p.date) - px);
        if (d < bestDist) { best = p; bestDist = d; }
      });
      ui.chartPick = best.date;
      mark(best);
    };
    svg.addEventListener('pointerdown', onPoint);
    svg.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' || e.buttons) onPoint(e); });

    redrawChart = () => drawChart(root);
  }

  /* ====================== 그리기 ====================== */

  function buildHtml() {
    const logs = StorageManager.getChallengeLogs();
    const cfg = StorageManager.getChallengeSettings();
    const meId = me();

    if (!meId) {
      return `<div class="board ch-board">${heroHtml(cfg)}${chooserHtml()}</div>`;
    }
    if (!USER_IDS.includes(ui.person)) ui.person = meId;

    return `
      <div class="board ch-board">
        ${heroHtml(cfg)}
        ${peopleHtml(logs, cfg, meId)}
        <div class="ch-columns">
          <div class="ch-col">${dayCardHtml(logs, meId)}</div>
          <div class="ch-col">
            ${weightCardHtml(weightProgress(logs, ui.person, cfg, today))}
            ${weekCardHtml(logs)}
          </div>
        </div>
        ${settingsCardHtml(meId)}
      </div>`;
  }

  /** 템플릿에는 넣지 않은 '입력 중인 값'을 입력칸에 채웁니다 */
  function applyDrafts(root) {
    const set = (id, value) => {
      const el = root.querySelector('#' + id);
      if (el && el.value !== value) el.value = value;
    };

    const log = findLog(StorageManager.getChallengeLogs(), ui.person, ui.date);
    const saved = log && Number(log.weight) > 0 ? formatKg(log.weight) : '';
    set('ch-weight', ui.weight !== null ? ui.weight : saved);

    const slot = ui.meal.slot || guessMealSlot(new Date().getHours());
    const slotDefault = (MEAL_SLOTS.find(s => s.id === slot) || MEAL_SLOTS[0]).defaultTime;
    const time = ui.meal.time !== null ? ui.meal.time : (ui.date === today ? nowTimeStr() : slotDefault);
    set('ch-meal-time', time);
    set('ch-meal-text', ui.meal.text);

    set('ch-wk-name', ui.workout.name);
    set('ch-wk-min', ui.workout.minutes);

    const cfg = StorageManager.getChallengeSettings();
    const d = ui.settings || {
      shoot: cfg.shootDate, wedding: cfg.weddingDate, start: cfg.startDate,
      husband: cfg.targets.husband !== null ? formatKg(cfg.targets.husband) : '',
      wife: cfg.targets.wife !== null ? formatKg(cfg.targets.wife) : ''
    };
    set('ch-set-shoot', d.shoot);
    set('ch-set-wedding', d.wedding);
    set('ch-set-start', d.start);
    set('ch-set-target-husband', d.husband);
    set('ch-set-target-wife', d.wife);
  }

  function paint() {
    const html = buildHtml();
    const existing = containerEl.querySelector(':scope > .ch-board');

    // 내용이 그대로면 손대지 않습니다 — 입력 중인 칸과 키보드가 그대로 유지됩니다
    if (existing && html === ui.lastHtml) return;

    const active = document.activeElement;
    const focusId = active && existing && existing.contains(active) ? active.id : '';
    let caret = null;
    try { if (focusId && typeof active.selectionStart === 'number') caret = [active.selectionStart, active.selectionEnd]; }
    catch (e) { /* time/date 입력은 선택 범위를 지원하지 않습니다 */ }
    const scrollY = window.scrollY;

    containerEl.innerHTML = html;
    ui.lastHtml = html;

    const root = containerEl.querySelector(':scope > .ch-board');
    applyDrafts(root);
    bind(root);
    drawChart(root);

    if (focusId) {
      const el = root.querySelector('#' + focusId);
      if (el) {
        el.focus({ preventScroll: true });
        try { if (caret) el.setSelectionRange(caret[0], caret[1]); } catch (e) { /* 무시 */ }
        window.scrollTo(0, scrollY);
      }
    }
  }

  /* ====================== 동작 ====================== */

  /** 로컬 저장은 즉시 끝나므로 화면을 먼저 갱신하고, 클라우드 전송이 끝나면 뱃지를 맞춥니다 */
  function commit(mutate) {
    if (ui.person !== me()) return;                  // 상대 기록은 고치지 않습니다
    const pending = StorageManager.updateChallengeLog(ui.person, ui.date, mutate);
    paint();
    pending.then(() => refreshApp()).catch(() => refreshApp());
  }

  function selectDate(date) {
    if (!isDateStr(date) || date > today || date === ui.date) return;
    ui.date = date;
    resetDrafts();
    paint();
  }

  function saveWeight(root) {
    const input = root.querySelector('#ch-weight');
    if (!input) return;
    if (input.value.trim() === '') { clearWeight(false); return; }
    const w = parseWeight(input.value);
    if (w === null) { alert('몸무게를 20~300kg 사이 숫자로 입력해주세요. (예: 62.4)'); input.focus(); return; }
    ui.weight = null;
    input.blur();
    commit(log => ({ ...log, weight: w }));
  }

  function clearWeight(ask = true) {
    const log = findLog(StorageManager.getChallengeLogs(), ui.person, ui.date);
    if (!log || !(Number(log.weight) > 0)) { ui.weight = null; paint(); return; }
    if (ask && !confirm(`${formatDayLabel(ui.date)} 몸무게 기록을 지울까요?`)) return;
    ui.weight = null;
    commit(l => ({ ...l, weight: null }));
  }

  function saveMeal(root) {
    const textEl = root.querySelector('#ch-meal-text');
    const timeEl = root.querySelector('#ch-meal-time');
    const text = textEl.value.trim();
    if (!text) { alert('무엇을 먹었는지 적어주세요.'); textEl.focus(); return; }
    const time = isTimeStr(timeEl.value) ? timeEl.value : '';
    const slot = ui.meal.slot || guessMealSlot(new Date().getHours());
    const editId = ui.meal.editId;

    ui.meal = { slot: null, time: null, timeTouched: false, text: '', editId: null };
    commit(log => {
      const meals = log.meals.filter(m => m.id !== editId);
      meals.push({ id: editId || newId('m'), slot, time, text });
      return { ...log, meals: sortMeals(meals) };
    });
  }

  function saveWorkout(root) {
    const nameEl = root.querySelector('#ch-wk-name');
    const minEl = root.querySelector('#ch-wk-min');
    const name = nameEl.value.trim();
    if (!name) { alert('어떤 운동을 했는지 적어주세요.'); nameEl.focus(); return; }

    const rawMin = minEl.value.trim();
    const minutes = rawMin === '' ? 0 : Number(rawMin.replace(/[^\d]/g, ''));
    if (!Number.isFinite(minutes) || minutes < 0 || minutes > 600) {
      alert('운동 시간은 0~600분 사이로 입력해주세요.'); minEl.focus(); return;
    }
    const editId = ui.workout.editId;

    ui.workout = { name: '', minutes: '', editId: null };
    commit(log => {
      const list = log.workouts.slice();
      const item = { id: editId || newId('w'), name, minutes };
      const idx = list.findIndex(w => w.id === editId);
      if (idx !== -1) list[idx] = item; else list.push(item);
      return { ...log, workouts: list };
    });
  }

  async function saveSettings(root) {
    const val = (id) => (root.querySelector('#' + id) || {}).value || '';
    const targets = {};
    for (const id of USER_IDS) {
      const raw = val(`ch-set-target-${id}`).trim();
      if (raw === '') { targets[id] = null; continue; }
      const w = parseWeight(raw);
      if (w === null) { alert(`${nameOf(id)} 목표 몸무게를 20~300kg 사이 숫자로 입력해주세요.`); return; }
      targets[id] = w;
    }

    const shoot = val('ch-set-shoot'), wedding = val('ch-set-wedding'), start = val('ch-set-start');
    if (start && start > today) { alert('도전 시작일은 오늘이나 그 이전 날짜로 정해주세요.'); return; }

    const meSel = val('ch-set-me');
    if (USER_IDS.includes(meSel) && meSel !== me()) {
      StorageManager.saveDeviceSettings({ challengeMe: meSel });
      ui.person = meSel;
      resetDrafts();
    }

    ui.settings = null;
    ui.settingsOpen = false;
    const pending = StorageManager.saveChallengeSettings({
      shootDate: shoot, weddingDate: wedding, startDate: start, targets
    });
    paint();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    try { await pending; } finally { refreshApp(); }
  }

  function bind(root) {
    root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn || !root.contains(btn) || btn.disabled) return;
      const act = btn.getAttribute('data-act');
      const id = btn.getAttribute('data-id');

      switch (act) {
        case 'set-me': {
          const user = btn.getAttribute('data-user');
          if (!USER_IDS.includes(user)) return;
          StorageManager.saveDeviceSettings({ challengeMe: user });
          ui.person = user;
          paint();
          break;
        }
        case 'pick-person': {
          const user = btn.getAttribute('data-user');
          if (!USER_IDS.includes(user) || user === ui.person) return;
          ui.person = user;
          ui.chartPick = null;
          resetDrafts();
          paint();
          break;
        }
        case 'prev-day': selectDate(addDays(ui.date, -1)); break;
        case 'next-day': selectDate(addDays(ui.date, 1)); break;
        case 'today': selectDate(today); break;
        case 'pick-day': selectDate(btn.getAttribute('data-date')); break;

        case 'save-weight': saveWeight(root); break;
        case 'clear-weight': clearWeight(true); break;

        case 'meal-slot': {
          ui.meal.slot = btn.getAttribute('data-slot');
          // 지난 날짜를 채울 때는 끼니에 맞는 시간을 미리 넣어 줍니다 (직접 고친 시간은 건드리지 않음)
          if (!ui.meal.timeTouched && ui.date !== today) ui.meal.time = null;
          paint();
          break;
        }
        case 'meal-save': saveMeal(root); break;
        case 'meal-cancel':
          ui.meal = { slot: null, time: null, timeTouched: false, text: '', editId: null };
          paint();
          break;
        case 'meal-edit': {
          const log = findLog(StorageManager.getChallengeLogs(), ui.person, ui.date);
          const m = log && (log.meals || []).find(x => x.id === id);
          if (!m) return;
          ui.meal = { slot: m.slot, time: isTimeStr(m.time) ? m.time : '', timeTouched: true, text: m.text, editId: m.id };
          paint();
          const el = root.ownerDocument.getElementById('ch-meal-text');
          if (el) el.focus();
          break;
        }
        case 'meal-del': {
          if (!confirm('이 식사 기록을 지울까요?')) return;
          if (ui.meal.editId === id) ui.meal = { slot: null, time: null, timeTouched: false, text: '', editId: null };
          commit(log => ({ ...log, meals: log.meals.filter(m => m.id !== id) }));
          break;
        }

        case 'wk-preset': {
          ui.workout.name = btn.getAttribute('data-name') || '';
          applyDrafts(root);
          const el = root.querySelector('#ch-wk-min');
          if (el) el.focus();
          break;
        }
        case 'wk-save': saveWorkout(root); break;
        case 'wk-cancel':
          ui.workout = { name: '', minutes: '', editId: null };
          paint();
          break;
        case 'wk-edit': {
          const log = findLog(StorageManager.getChallengeLogs(), ui.person, ui.date);
          const w = log && (log.workouts || []).find(x => x.id === id);
          if (!w) return;
          ui.workout = { name: w.name, minutes: Number(w.minutes) > 0 ? String(w.minutes) : '', editId: w.id };
          paint();
          const el = root.ownerDocument.getElementById('ch-wk-name');
          if (el) el.focus();
          break;
        }
        case 'wk-del': {
          if (!confirm('이 운동 기록을 지울까요?')) return;
          if (ui.workout.editId === id) ui.workout = { name: '', minutes: '', editId: null };
          commit(log => ({ ...log, workouts: log.workouts.filter(w => w.id !== id) }));
          break;
        }

        case 'open-settings':
        case 'toggle-settings': {
          ui.settingsOpen = act === 'open-settings' ? true : !ui.settingsOpen;
          if (!ui.settingsOpen) ui.settings = null;
          paint();
          if (ui.settingsOpen) {
            const panel = containerEl.querySelector('.ch-settings');
            if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
          break;
        }
        case 'save-settings': saveSettings(root); break;
        default: break;
      }
    });

    // 입력 중인 값을 계속 받아 둡니다 (실시간 갱신으로 화면이 다시 그려져도 남도록)
    root.addEventListener('input', (e) => {
      const t = e.target;
      if (!t || !t.id) return;
      if (t.id === 'ch-weight') ui.weight = t.value;
      else if (t.id === 'ch-meal-text') ui.meal.text = t.value;
      else if (t.id === 'ch-meal-time') { ui.meal.time = t.value; ui.meal.timeTouched = true; }
      else if (t.id === 'ch-wk-name') ui.workout.name = t.value;
      else if (t.id === 'ch-wk-min') ui.workout.minutes = t.value;
      else if (t.id.startsWith('ch-set-') && t.id !== 'ch-set-me') {
        const v = (id) => (root.querySelector('#' + id) || {}).value || '';
        ui.settings = {
          shoot: v('ch-set-shoot'), wedding: v('ch-set-wedding'), start: v('ch-set-start'),
          husband: v('ch-set-target-husband'), wife: v('ch-set-target-wife')
        };
      }
    });

    root.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.isComposing) return;      // 한글 조합 중 Enter 는 글자 확정입니다
      const id = e.target && e.target.id;
      if (id === 'ch-weight') { e.preventDefault(); saveWeight(root); }
      else if (id === 'ch-meal-text') { e.preventDefault(); saveMeal(root); }
      else if (id === 'ch-wk-name' || id === 'ch-wk-min') { e.preventDefault(); saveWorkout(root); }
    });
  }

  if (!resizeBound) {
    resizeBound = true;
    let timer = 0;
    window.addEventListener('resize', () => {
      clearTimeout(timer);
      timer = setTimeout(() => { if (redrawChart && document.querySelector('.ch-board')) redrawChart(); }, 150);
    });
  }

  paint();
}
