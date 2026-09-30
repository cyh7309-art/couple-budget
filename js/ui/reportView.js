/**
 * Monthly Closing Report View (월 마감 리포트)
 * Couple Finance Dashboard ("우리집 가계부")
 *
 * 통계 탭의 '월 마감' 하위 탭으로 표시됩니다.
 * 차트는 순수 HTML/CSS 막대라서 오프라인에서도, 인쇄(PDF 저장)에서도 그대로 나옵니다.
 */

import { StorageManager } from '../storage.js';
import { buildMonthlyReport } from '../reportAnalysis.js';
import { esc } from '../utils.js';

const won = v => Math.round(Number(v) || 0).toLocaleString('ko-KR') + '원';
const signed = v => (v > 0 ? '+' : v < 0 ? '-' : '') + Math.abs(Math.round(Number(v) || 0)).toLocaleString('ko-KR') + '원';
const man = v => {
  const n = Number(v) || 0;
  if (Math.abs(n) < 10000) return Math.round(n).toLocaleString('ko-KR') + '원';
  return (n / 10000).toFixed(1).replace(/\.0$/, '') + '만';
};
const pct1 = v => (Math.round((Number(v) || 0) * 10) / 10).toFixed(1) + '%';
const dayLabel = d => `${Number(String(d).slice(5, 7))}/${Number(String(d).slice(8, 10))}`;

const LEVEL_LABEL = { warn: '꼭 확인', check: '확인', info: '참고', good: '좋아요' };

/* ---------- 조각별 HTML ---------- */

function heroHtml(r) {
  const s = r.summary;
  const year = r.monthStr.slice(0, 4);
  const stateText = r.isClosed
    ? '월 마감'
    : `중간 점검 · ${r.progress.daysElapsed}/${r.progress.daysInMonth}일`;
  const balCls = s.balance >= 0 ? 'rp-pos' : 'rp-neg';
  const attention = r.counts.warn + r.counts.check;

  return `
    <div class="card rp-hero">
      <div class="rp-hero-top">
        <div class="rp-hero-title">
          <p class="rp-eyebrow">${esc(year)}년 ${esc(r.monthLabel)} · ${esc(stateText)}</p>
          <h2 class="rp-title">${esc(r.monthLabel)} 마감 리포트</h2>
        </div>
        <div class="rp-actions rp-no-print">
          <button class="btn-secondary" id="rp-btn-print" type="button">PDF로 저장</button>
          <button class="btn-secondary" id="rp-btn-share" type="button">공유</button>
        </div>
      </div>

      <div class="rp-balance">
        <span class="rp-label">기록상 수지</span>
        <strong class="rp-balance-num ${balCls}">${signed(s.balance)}</strong>
        <span class="rp-sub">저축률 ${pct1(s.savingsRate)}</span>
      </div>

      <div class="rp-tiles">
        <div class="rp-tile"><span class="rp-label"><i class="rp-dot rp-bg-income"></i>수입</span><strong>${won(s.totalIncome)}</strong></div>
        <div class="rp-tile"><span class="rp-label"><i class="rp-dot rp-bg-expense"></i>지출</span><strong>${won(s.totalExpense)}</strong></div>
        <div class="rp-tile"><span class="rp-label">거래</span><strong>${s.count}건</strong></div>
      </div>

      ${attention > 0
        ? `<p class="rp-callout">확인이 필요한 항목이 <b>${attention}개</b> 있어요. 아래 자동 점검을 부부가 같이 살펴보세요.</p>`
        : `<p class="rp-callout rp-callout-good">자동 점검에서 걸린 항목이 없어요.</p>`}
    </div>`;
}

function findingsHtml(r) {
  if (r.findings.length === 0) return '';
  const body = r.findings.map(f => {
    const items = (f.items || []).map(it => {
      const who = (it.owners || []).length
        ? `<span class="rp-owner">${it.owners.map(esc).join('·')} 확인</span>` : '';
      return `<li><span class="rp-item-label">${esc(it.label)}${who}</span>${
        it.amount !== undefined && it.amount !== null ? `<b>${won(it.amount)}</b>` : ''}</li>`;
    }).join('');
    return `
      <div class="rp-finding rp-lv-${f.level}">
        <div class="rp-finding-head">
          <span class="rp-pill rp-pill-${f.level}">${LEVEL_LABEL[f.level]}</span>
          <h4>${esc(f.title)}</h4>
        </div>
        ${f.body ? `<p class="rp-finding-body">${esc(f.body)}</p>` : ''}
        ${items ? `<ul class="rp-items">${items}</ul>` : ''}
      </div>`;
  }).join('');

  return `
    <div class="card rp-section rp-findings-card">
      <h3 class="card-title">자동 점검</h3>
      <p class="rp-lead">기록을 규칙으로 훑어서 확인하면 좋은 것을 골랐어요. 원인이 무엇인지는 두 분이 아는 만큼 판단해 주세요.</p>
      <div class="rp-findings">${body}</div>
    </div>`;
}

function stackBar(segments, scaleMax, valueLabel) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const width = scaleMax > 0 ? (total / scaleMax) * 100 : 0;
  const segs = segments.filter(x => x.value > 0)
    .map(x => `<div class="rp-seg" style="flex:${x.value} 1 0;background:${x.color}" title="${esc(x.title)}"></div>`).join('');
  return `<div class="rp-track"><div class="rp-bar" style="width:${width}%">${segs}</div>` +
    `<span class="rp-tipval" style="left:${width}%">${esc(valueLabel)}</span></div>`;
}

function flowHtml(r) {
  const s = r.summary;
  const salary = r.incomeCategories.find(c => c.name === '급여');
  const salaryAmt = salary ? salary.amount : 0;
  const nonSalary = s.totalIncome - salaryAmt;
  const scaleMax = Math.max(s.totalIncome, s.totalExpense, 1) * 1.18;

  const hasRegular = r.regularIncome !== null;
  const incomeSegs = hasRegular
    ? [
      { value: r.regularIncome, color: 'var(--mark-income)', title: `정기 수입 ${won(r.regularIncome)}` },
      { value: r.irregularIncome, color: 'var(--rp-income-soft)', title: `그 외 수입 ${won(r.irregularIncome)}` }
    ]
    : salary
    ? [
      { value: salaryAmt, color: 'var(--mark-income)', title: `급여 ${won(salaryAmt)}` },
      { value: nonSalary, color: 'var(--rp-income-soft)', title: `급여 외 수입 ${won(nonSalary)}` }
    ]
    : [{ value: s.totalIncome, color: 'var(--mark-income)', title: `수입 ${won(s.totalIncome)}` }];
  const expenseSegs = [
    { value: r.expenseExInstallment, color: 'var(--mark-expense)', title: `일반 지출 ${won(r.expenseExInstallment)}` },
    { value: r.installmentAmount, color: 'var(--rp-installment)', title: `할부 ${won(r.installmentAmount)}` }
  ];

  const legend = [
    hasRegular ? `<span><i class="rp-dot rp-bg-income"></i>정기 수입 <b>${man(r.regularIncome)}</b></span>` : '',
    hasRegular ? `<span><i class="rp-dot rp-bg-income-soft"></i>그 외 수입 <b>${man(r.irregularIncome)}</b></span>` : '',
    !hasRegular && salary ? `<span><i class="rp-dot rp-bg-income"></i>급여 <b>${man(salaryAmt)}</b></span>` : '',
    !hasRegular && salary ? `<span><i class="rp-dot rp-bg-income-soft"></i>급여 외 수입 <b>${man(nonSalary)}</b></span>` : '',
    `<span><i class="rp-dot rp-bg-expense"></i>일반 지출 <b>${man(r.expenseExInstallment)}</b></span>`,
    r.installmentAmount > 0 ? `<span><i class="rp-dot rp-bg-installment"></i>할부 <b>${man(r.installmentAmount)}</b></span>` : ''
  ].join('');

  const regular = r.regularIncome !== null
    ? `<p class="rp-fact">정기 수입 <b>${won(r.regularIncome)}</b>은 할부를 뺀 지출의 <b>${pct1(r.expenseExInstallment > 0 ? (r.regularIncome / r.expenseExInstallment) * 100 : 0)}</b>예요.</p>`
    : '';

  return `
    <div class="card rp-section">
      <h3 class="card-title">수입과 지출</h3>
      <div class="rp-duo">
        <div class="rp-duo-row"><span class="rp-who">수입</span>${stackBar(incomeSegs, scaleMax, man(s.totalIncome))}</div>
        <div class="rp-duo-row"><span class="rp-who">지출</span>${stackBar(expenseSegs, scaleMax, man(s.totalExpense))}</div>
      </div>
      <div class="rp-legend">${legend}</div>
      ${regular}
    </div>`;
}

function dailyHtml(r) {
  const max = Math.max(...r.days.map(d => d.amount), 1);
  const yMax = Math.ceil(max / 200000) * 200000 || 200000;
  const step = yMax / 4;
  const yLabels = [0, 1, 2, 3, 4].map(i => `<span style="bottom:${(i / 4) * 100}%">${i === 0 ? '0' : man(step * i)}</span>`).join('');
  const grid = [0, 1, 2, 3, 4].map(i => `<div class="rp-gl" style="bottom:${(i / 4) * 100}%"></div>`).join('');

  const cols = r.days.map(d => {
    const other = d.amount - d.installmentAmount;
    const tip = `${dayLabel(d.date)} ${d.amount ? won(d.amount) : '기록 없음'}`
      + (d.top.length ? ' · ' + d.top.map(t => `${t.memo} ${won(t.amount)}`).join(', ') : '');
    const bar = d.amount > 0
      ? `<div class="rp-col-bar" style="height:${(d.amount / yMax) * 100}%">` +
        `<i style="flex:${Math.max(other, 0)} 1 0;background:var(--mark-expense)${d.installmentAmount > 0 ? ';border-radius:0' : ''}"></i>` +
        (d.installmentAmount > 0 ? `<i style="flex:${d.installmentAmount} 1 0;background:var(--rp-installment)"></i>` : '') + '</div>'
      : '';
    return `<div class="rp-col" title="${esc(tip)}">${bar}</div>`;
  }).join('');
  const xLabels = r.days.map(d => `<span>${[1, 5, 10, 15, 20, 25, 30].includes(d.day) && d.day <= r.progress.daysInMonth ? `<em>${d.day}</em>` : ''}</span>`).join('');

  const top = r.topDays.map(d => {
    const memo = d.top.map(t => `${esc(t.memo)} ${man(t.amount)}`).join(', ');
    return `<div><b>${dayLabel(d.date)} · ${man(d.amount)}</b><span class="rp-note">${memo}</span></div>`;
  }).join('');

  return `
    <div class="card rp-section">
      <h3 class="card-title">하루 지출</h3>
      <div class="rp-daily" style="--rp-days:${r.days.length}">
        <div class="rp-yax">${yLabels}</div>
        <div class="rp-plot">${grid}<div class="rp-cols">${cols}</div></div>
        <div class="rp-xrow">${xLabels}</div>
      </div>
      ${r.topDays.length ? `<div class="rp-topdays">${top}</div>` : ''}
    </div>`;
}

function categoriesHtml(r) {
  if (r.categories.length === 0) return '';
  const max = Math.max(...r.categories.map(c => c.amount), 1);
  const rows = r.categories.map(c => {
    const w = (c.amount / max) * 100;
    const rest = c.amount - c.installmentAmount;
    const segs = c.installmentAmount > 0
      ? `<div class="rp-seg" style="flex:${c.installmentAmount} 1 0;background:var(--rp-installment)"></div>` +
        (rest > 0 ? `<div class="rp-seg" style="flex:${rest} 1 0;background:var(--rp-neutral)"></div>` : '')
      : `<div class="rp-seg" style="flex:1 1 0;background:${c.isFocus ? 'var(--mark-expense)' : 'var(--rp-neutral)'}"></div>`;
    const tip = `${c.name} ${won(c.amount)} · ${c.count}건 · ${pct1(c.percentage)}`;
    return `<div class="rp-crow" title="${esc(tip)}"><span class="rp-cname ${c.isFocus ? 'rp-focus' : ''}">${esc(c.name)}</span>` +
      `<div class="rp-ctrack"><div class="rp-bar" style="width:${w}%">${segs}</div></div><span class="rp-cval">${man(c.amount)}</span></div>`;
  }).join('');
  const hasFocus = r.categories.some(c => c.isFocus);

  return `
    <div class="card rp-section">
      <h3 class="card-title">카테고리별 지출</h3>
      <div class="rp-crows">${rows}</div>
      <div class="rp-legend">
        ${hasFocus ? '<span><i class="rp-dot rp-bg-expense"></i>식비·카페 계열</span>' : ''}
        ${r.installmentAmount > 0 ? '<span><i class="rp-dot rp-bg-installment"></i>할부</span>' : ''}
        <span><i class="rp-dot rp-bg-neutral"></i>그 외</span>
      </div>
    </div>`;
}

function peopleHtml(r) {
  const p = r.persons;
  const fv = r.fixedVar;
  const totalPersonal = p.husbandPersonalAmount + p.wifePersonalAmount + p.sharedAmount;
  return `
    <div class="card rp-section">
      <h3 class="card-title">공동·개인, 고정·변동</h3>
      <div class="rp-table-wrap">
        <table class="rp-table">
          <thead><tr><th>구분</th><th>지출</th><th>비중</th></tr></thead>
          <tbody>
            <tr><td>공동</td><td>${won(p.sharedAmount)}</td><td>${pct1(totalPersonal ? (p.sharedAmount / totalPersonal) * 100 : 0)}</td></tr>
            <tr><td>${esc(p.husbandName)} 개인</td><td>${won(p.husbandPersonalAmount)}</td><td>${pct1(totalPersonal ? (p.husbandPersonalAmount / totalPersonal) * 100 : 0)}</td></tr>
            <tr><td>${esc(p.wifeName)} 개인</td><td>${won(p.wifePersonalAmount)}</td><td>${pct1(totalPersonal ? (p.wifePersonalAmount / totalPersonal) * 100 : 0)}</td></tr>
            <tr><td>고정지출 표시</td><td>${won(fv.fixedAmount)}</td><td>${pct1(fv.fixedRatio)}</td></tr>
            <tr><td>변동지출</td><td>${won(fv.variableAmount)}</td><td>${pct1(fv.variableRatio)}</td></tr>
          </tbody>
        </table>
      </div>
      <p class="rp-note">개인 항목은 각자 쓴 돈이 아니라 "누구 몫으로 표시했는지" 기준이에요. 고정지출은 입력할 때 고정으로 표시한 금액만 잡혀요.</p>
    </div>`;
}

function momHtml(r) {
  if (!r.mom) {
    return `
    <div class="card rp-section">
      <h3 class="card-title">지난달과 비교</h3>
      <p class="rp-note">지난달 기록이 없어서 비교하지 않았어요. 다음 달 리포트부터 전월 대비가 함께 나와요.</p>
    </div>`;
  }
  const m = r.mom;
  const dir = m.expenseDiff >= 0 ? '늘었어요' : '줄었어요';
  const list = (arr, sign) => arr.map(d => `<li><span class="rp-item-label">${esc(d.name)}</span><b>${sign}${won(Math.abs(d.diff))}</b></li>`).join('');
  return `
    <div class="card rp-section">
      <h3 class="card-title">지난달과 비교</h3>
      <p class="rp-fact">지출이 지난달보다 <b>${won(Math.abs(m.expenseDiff))}</b>${m.expenseChangePct !== null ? ` (${pct1(Math.abs(m.expenseChangePct))})` : ''} ${dir}.</p>
      <div class="rp-two">
        <div><h4 class="rp-h4">많이 늘어난 항목</h4><ul class="rp-items">${list(m.topIncreases, '+') || '<li class="rp-note">없어요</li>'}</ul></div>
        <div><h4 class="rp-h4">줄어든 항목</h4><ul class="rp-items">${list(m.topDecreases, '-') || '<li class="rp-note">없어요</li>'}</ul></div>
      </div>
    </div>`;
}

function outlookHtml(r) {
  const o = r.outlook;
  const label = `${Number(o.monthStr.slice(5, 7))}월`;
  const rows = [
    ...o.installments.map(x => ({ n: `${x.name}${x.seq ? ` (${x.seq}/${x.months}회차)` : ''}`, a: x.amount, tag: '할부' })),
    ...o.recurringExpense.map(x => ({ n: `${x.name}${x.estimate ? ' (예상)' : ''}`, a: x.amount, tag: '반복' }))
  ];
  const rowHtml = rows.map(x => `<li><span class="rp-item-label">${esc(x.n)}<span class="rp-owner">${x.tag}</span></span><b>${won(x.a)}</b></li>`).join('');
  const candHtml = o.candidates.slice(0, 6).map(c => `<li><span class="rp-item-label">${esc(c.label)}</span><b>${won(c.amount)}</b></li>`).join('');

  const incomeRows = o.recurringIncome.map(x => `<li><span class="rp-item-label">${esc(x.name)}${x.estimate ? ' (예상)' : ''}</span><b>${won(x.amount)}</b></li>`).join('');

  return `
    <div class="card rp-section">
      <h3 class="card-title">${esc(label)} 미리보기</h3>
      ${rows.length ? `
        <h4 class="rp-h4">이미 정해진 지출 <span class="rp-h4-sum">${won(o.confirmedExpense)}</span></h4>
        <ul class="rp-items">${rowHtml}</ul>` : '<p class="rp-note">할부나 반복 거래로 등록된 다음 달 지출이 없어요.</p>'}
      ${o.candidates.length ? `
        <h4 class="rp-h4">매달 나갈 것 같은 지출 후보 <span class="rp-h4-sum">${won(o.candidateTotal)}</span></h4>
        <ul class="rp-items">${candHtml}</ul>
        ${o.candidates.length > 6 ? `<p class="rp-note">그 밖에 ${o.candidates.length - 6}건이 더 있어요.</p>` : ''}` : ''}
      ${o.margin !== null ? `<p class="rp-fact">이번 달 정기 수입 <b>${won(o.regularIncomeBase)}</b>에서 위 지출을 빼면 ${o.margin >= 0 ? `약 <b>${won(o.margin)}</b>이 남아요.` : `<b>${won(-o.margin)}</b>이 모자라요.`}</p>` : ''}
      ${incomeRows ? `<h4 class="rp-h4">반복 수입 <span class="rp-h4-sum">${won(o.recurringIncomeTotal)}</span></h4><ul class="rp-items">${incomeRows}</ul>` : ''}
    </div>`;
}

/* ---------- 공유 텍스트 ---------- */

function buildShareText(r) {
  const s = r.summary;
  const lines = [
    `우리집 ${r.monthLabel} ${r.isClosed ? '마감' : '중간 점검'}`,
    `수입 ${won(s.totalIncome)} · 지출 ${won(s.totalExpense)} · 수지 ${signed(s.balance)} (저축률 ${pct1(s.savingsRate)})`
  ];
  const todo = r.findings.filter(f => f.level === 'warn' || f.level === 'check').slice(0, 5);
  if (todo.length) {
    lines.push('', '같이 확인할 것');
    todo.forEach(f => lines.push(`- ${f.title}`));
  }
  return lines.join('\n');
}

/* ---------- 인쇄(PDF 저장) ---------- */

function bindPrint(btn, r) {
  const html = document.documentElement;
  let savedTheme = null;
  let savedTitle = null;
  const before = () => {
    savedTheme = html.getAttribute('data-theme');
    savedTitle = document.title;
    html.setAttribute('data-theme', 'light');      // 종이에는 항상 밝은 색으로
    document.title = `우리집 ${r.monthLabel} 가계부 마감`;
    document.body.classList.add('rp-printing');
  };
  const after = () => {
    if (savedTheme === null) html.removeAttribute('data-theme');
    else html.setAttribute('data-theme', savedTheme);
    if (savedTitle !== null) document.title = savedTitle;
    document.body.classList.remove('rp-printing');
    window.removeEventListener('afterprint', after);
  };
  btn.addEventListener('click', () => {
    before();
    window.addEventListener('afterprint', after);
    try { window.print(); } catch (e) { after(); }
    // afterprint 를 주지 않는 브라우저 대비
    setTimeout(() => { if (document.body.classList.contains('rp-printing')) after(); }, 60000);
  });
}

function bindShare(btn, r) {
  const original = btn.textContent;
  btn.addEventListener('click', async () => {
    const text = buildShareText(r);
    try {
      if (navigator.share) {
        await navigator.share({ title: `우리집 ${r.monthLabel} 마감`, text });
        return;
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return;   // 사용자가 공유창을 닫음
    }
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = '복사했어요';
    } catch (e) {
      window.prompt('아래 내용을 복사하세요', text);
    }
    setTimeout(() => { btn.textContent = original; }, 1800);
  });
}

/* ---------- 진입점 ---------- */

export function renderReportView(targetEl, monthStr) {
  const report = buildMonthlyReport({
    transactions: StorageManager.getTransactions(),
    categories: StorageManager.getCategories(),
    budgets: StorageManager.getBudgets(),
    recurring: StorageManager.getRecurring(),
    users: StorageManager.getUsers(),
    monthStr
  });

  if (report.summary.count === 0) {
    targetEl.innerHTML = `
      <div class="card rp-section">
        <h3 class="card-title">${esc(report.monthLabel)} 마감 리포트</h3>
        <p class="rp-lead">이 달에는 아직 기록이 없어요. 거래가 쌓이면 수입과 지출 분석, 자동 점검, 다음 달 미리보기가 여기에 나와요.</p>
      </div>`;
    return;
  }

  targetEl.innerHTML = `<div class="rp-report">
    ${heroHtml(report)}
    ${findingsHtml(report)}
    ${flowHtml(report)}
    ${dailyHtml(report)}
    ${categoriesHtml(report)}
    ${peopleHtml(report)}
    ${momHtml(report)}
    ${outlookHtml(report)}
    <p class="rp-footnote">앱에 기록된 거래를 기준으로 자동 계산한 리포트예요. 정기 수입, 일회성 여부, 중복 여부는 두 분이 확인한 내용이 우선이에요.</p>
  </div>`;

  const printBtn = targetEl.querySelector('#rp-btn-print');
  const shareBtn = targetEl.querySelector('#rp-btn-share');
  if (printBtn) bindPrint(printBtn, report);
  if (shareBtn) bindShare(shareBtn, report);
}
