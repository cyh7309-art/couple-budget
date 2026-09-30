/**
 * 월 마감 리포트 — 계산과 자동 점검
 * Couple Finance Dashboard ("우리집 가계부")
 *
 * 화면 코드가 전혀 없는 순수 함수 모듈입니다. (Node 에서도 그대로 실행되어 테스트할 수 있습니다)
 * 이체(transfer)는 수입·지출에서 항상 제외합니다.
 */

import {
  filterTransactionsByMonth,
  getPreviousMonthStr,
  getNextMonthStr,
  getMonthProgress,
  calculateMonthlySummary,
  calculateCategoryBreakdown,
  calculateFixedVsVariable,
  calculateUserBreakdown,
  calculateInstallments,
  getBudgetsForMonth,
  calculateBudgetProgress
} from './calculations.js';

/* 카테고리 이름·메모로 "생활 소비 항목"을 알아봅니다. 사용자가 만든 카테고리에도 통하도록 이름 기준입니다. */
const FOCUS_RE = /식비|외식|카페|커피|간식|배달/;
/* 매달 나갈 가능성이 큰 지출의 힌트 (고정지출로 표시하지 않은 경우를 찾기 위함) */
const RECURRING_HINT_RE = /월세|관리비|보험|통신|이자|구독|월회비|뮤직|넷플릭스|유튜브|대출|건보|건강보험|적금|렌탈|정기/;

const BIG_MEMO_MISSING = 100000;   // 메모 없는 큰 금액 기준
const DUP_MIN_AMOUNT = 10000;      // 중복 의심 최소 금액
const BIG_SINGLE_RATIO = 0.15;     // 한 건이 지출의 이 비율 이상이면 안내

const num = v => Number(v) || 0;
const won = v => Math.round(num(v)).toLocaleString('ko-KR') + '원';
const pct1 = v => (Math.round(v * 10) / 10).toFixed(1) + '%';
const dayLabel = date => `${Number(String(date).slice(5, 7))}/${Number(String(date).slice(8, 10))}`;

function monthLabel(monthStr) {
  return `${Number(monthStr.slice(5, 7))}월`;
}

/**
 * @param {object} input
 * @param {Array}  input.transactions
 * @param {Array}  input.categories
 * @param {Array}  [input.budgets]
 * @param {Array}  [input.recurring]
 * @param {object} input.users        { husband:{name}, wife:{name} }
 * @param {string} input.monthStr     'YYYY-MM'
 * @param {string} [input.todayStr]   'YYYY-MM-DD' (테스트용으로 고정 가능)
 */
export function buildMonthlyReport({ transactions, categories, budgets = [], recurring = [], users, monthStr, todayStr }) {
  const txs = (Array.isArray(transactions) ? transactions : [])
    .filter(t => t && (t.type === 'income' || t.type === 'expense'));
  const cats = Array.isArray(categories) ? categories : [];
  const catName = id => {
    const c = cats.find(x => x.id === id);
    return c ? c.name : '기타';
  };
  const userName = id => (users && users[id] && users[id].name) || (id === 'wife' ? '아내' : id === 'husband' ? '남편' : '');

  const progress = getMonthProgress(monthStr, todayStr);
  const isClosed = progress.isComplete || (progress.isCurrent && progress.daysRemaining === 0);

  const monthTx = filterTransactionsByMonth(txs, monthStr);
  const expenses = monthTx.filter(t => t.type === 'expense');
  const incomes = monthTx.filter(t => t.type === 'income');

  const summary = calculateMonthlySummary(txs, monthStr);
  const catBreakdown = calculateCategoryBreakdown(txs, cats, monthStr);
  const fixedVar = calculateFixedVsVariable(txs, monthStr);
  const userBd = calculateUserBreakdown(txs, monthStr);

  /* ---------- 할부 ---------- */
  const inst = calculateInstallments(txs, monthStr, todayStr);
  const installmentTx = expenses.filter(t => t.installmentId);
  const installmentAmount = installmentTx.reduce((s, t) => s + num(t.amount), 0);
  const expenseExInstallment = summary.totalExpense - installmentAmount;

  /* ---------- 카테고리 (지출) ---------- */
  const categoriesOut = catBreakdown.categories.map(c => {
    const rows = expenses.filter(t => t.categoryId === c.id);
    return {
      id: c.id,
      name: c.name,
      icon: c.icon,
      amount: c.amount,
      count: c.count,
      percentage: c.percentage,
      installmentAmount: rows.filter(t => t.installmentId).reduce((s, t) => s + num(t.amount), 0),
      fixedAmount: rows.filter(t => t.isFixed).reduce((s, t) => s + num(t.amount), 0),
      isFocus: FOCUS_RE.test(c.name)
    };
  });

  /* ---------- 수입 구성 ---------- */
  const incomeMap = {};
  incomes.forEach(t => {
    const key = t.categoryId || '';
    if (!incomeMap[key]) incomeMap[key] = { id: key, name: catName(key), amount: 0, count: 0 };
    incomeMap[key].amount += num(t.amount);
    incomeMap[key].count += 1;
  });
  const incomeCategories = Object.values(incomeMap)
    .sort((a, b) => b.amount - a.amount)
    .map(c => ({ ...c, percentage: summary.totalIncome > 0 ? (c.amount / summary.totalIncome) * 100 : 0 }));

  // "정기 수입": 반복 거래로 만들어졌거나 고정으로 표시된 수입만 인정합니다. 표시가 없으면 null.
  const regularRows = incomes.filter(t => t.recurringId || t.isFixed);
  const regularIncome = regularRows.length > 0 ? regularRows.reduce((s, t) => s + num(t.amount), 0) : null;
  const irregularIncome = regularIncome === null ? null : summary.totalIncome - regularIncome;

  /* ---------- 일별 ---------- */
  const days = [];
  for (let d = 1; d <= progress.daysInMonth; d++) {
    const date = `${monthStr}-${String(d).padStart(2, '0')}`;
    const rows = expenses.filter(t => t.date === date);
    const amount = rows.reduce((s, t) => s + num(t.amount), 0);
    const inst = rows.filter(t => t.installmentId).reduce((s, t) => s + num(t.amount), 0);
    const top = [...rows].sort((a, b) => num(b.amount) - num(a.amount)).slice(0, 2)
      .map(t => ({ memo: t.memo || catName(t.categoryId), amount: num(t.amount) }));
    days.push({ day: d, date, amount, installmentAmount: inst, top });
  }
  const topDays = [...days].filter(d => d.amount > 0).sort((a, b) => b.amount - a.amount).slice(0, 4)
    .map(d => ({ ...d, share: summary.totalExpense > 0 ? (d.amount / summary.totalExpense) * 100 : 0 }));

  /* ---------- 지난달 비교 ---------- */
  const prevMonthStr = getPreviousMonthStr(monthStr);
  const hasPrev = filterTransactionsByMonth(txs, prevMonthStr).length > 0;
  let mom = null;
  if (hasPrev) {
    const prevSummary = calculateMonthlySummary(txs, prevMonthStr);
    const prevCats = calculateCategoryBreakdown(txs, cats, prevMonthStr).categories;
    const deltas = categoriesOut.map(c => {
      const p = prevCats.find(x => x.id === c.id);
      return { name: c.name, current: c.amount, previous: p ? p.amount : 0, diff: c.amount - (p ? p.amount : 0) };
    }).sort((a, b) => b.diff - a.diff);
    mom = {
      prevMonthStr,
      prevExpense: prevSummary.totalExpense,
      prevIncome: prevSummary.totalIncome,
      expenseDiff: summary.totalExpense - prevSummary.totalExpense,
      expenseChangePct: prevSummary.totalExpense > 0
        ? ((summary.totalExpense - prevSummary.totalExpense) / prevSummary.totalExpense) * 100 : null,
      incomeDiff: summary.totalIncome - prevSummary.totalIncome,
      topIncreases: deltas.filter(d => d.diff > 0).slice(0, 3),
      topDecreases: [...deltas].reverse().filter(d => d.diff < 0).slice(0, 3)
    };
  }

  /* ---------- 다음 달 미리보기 ---------- */
  const nextMonthStr = getNextMonthStr(monthStr);
  const nextInst = calculateInstallments(txs, nextMonthStr, todayStr);
  const nextInstallments = nextInst.plans
    .filter(p => p.thisMonthAmount > 0)
    .map(p => {
      const row = p.rows.find(r => String(r.date).startsWith(nextMonthStr));
      return {
        name: p.name,
        amount: p.thisMonthAmount,
        seq: row ? Number(row.installmentSeq) || null : null,
        months: p.months,
        date: row ? row.date : null
      };
    });

  const nextRecurring = (Array.isArray(recurring) ? recurring : [])
    .filter(r => r && r.active !== false
      && (!r.startMonth || r.startMonth <= nextMonthStr)
      && (!r.endMonth || r.endMonth >= nextMonthStr)
      && !(Array.isArray(r.skips) && r.skips.includes(nextMonthStr)))
    .map(r => ({
      name: r.name || r.memo || '반복 거래',
      type: r.type,
      amount: num(r.amount),
      estimate: r.amountMode === 'variable'
    }));
  const nextRecurringExpense = nextRecurring.filter(r => r.type === 'expense');
  const nextRecurringIncome = nextRecurring.filter(r => r.type === 'income');

  // 고정지출로 표시하지 않았지만 매달 나갈 것 같은 지출 (이번 달 기록에서 찾은 후보)
  const candidates = expenses
    .filter(t => !t.isFixed && !t.recurringId && !t.installmentId
      && RECURRING_HINT_RE.test(`${t.memo || ''} ${catName(t.categoryId)}`))
    .sort((a, b) => num(b.amount) - num(a.amount))
    .map(t => ({
      id: t.id, date: t.date, userId: t.userId,
      label: t.memo && String(t.memo).trim() ? t.memo : `${catName(t.categoryId)} (메모 없음)`,
      amount: num(t.amount)
    }));

  const outlook = {
    monthStr: nextMonthStr,
    installments: nextInstallments,
    installmentTotal: nextInstallments.reduce((s, x) => s + x.amount, 0),
    recurringExpense: nextRecurringExpense,
    recurringExpenseTotal: nextRecurringExpense.reduce((s, x) => s + x.amount, 0),
    recurringIncome: nextRecurringIncome,
    recurringIncomeTotal: nextRecurringIncome.reduce((s, x) => s + x.amount, 0),
    candidates,
    candidateTotal: candidates.reduce((s, x) => s + x.amount, 0)
  };
  outlook.confirmedExpense = outlook.installmentTotal + outlook.recurringExpenseTotal;
  // 정기 수입이 표시되어 있으면, 다음 달에 이미 정해진 지출과 반복 후보를 빼고 남는 돈을 계산합니다
  outlook.regularIncomeBase = regularIncome;
  outlook.margin = regularIncome === null ? null : regularIncome - outlook.confirmedExpense - outlook.candidateTotal;

  /* ---------- 자동 점검 ---------- */
  const findings = [];
  const flaggedIds = new Set();

  // 1) 중복 의심 입력
  const groups = {};
  monthTx.forEach(t => {
    if (t.installmentId || t.recurringId) return;
    if (num(t.amount) < DUP_MIN_AMOUNT) return;
    const key = `${t.type}|${t.date}|${num(t.amount)}`;
    (groups[key] = groups[key] || []).push(t);
  });
  const dupItems = [];
  let dupBalanceImpact = 0;
  Object.values(groups).forEach(rows => {
    if (rows.length < 2) return;
    const flagged = new Set();
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const a = rows[i], b = rows[j];
        // 같은 사람이 같은 날 같은 금액을 두 번 넣었거나,
        // 부부가 같은 공동 지출을 각자 입력한 경우만 의심합니다.
        // (수입은 부부가 각자 같은 금액을 받을 수 있어서 사람이 다르면 중복으로 보지 않습니다)
        const sameMemo = a.memo && String(a.memo).trim() && a.memo === b.memo;
        const bothShared = a.type === 'expense' && a.sharedType === 'shared' && b.sharedType === 'shared';
        if (a.userId === b.userId || (sameMemo && bothShared)) { flagged.add(a); flagged.add(b); }
      }
    }
    if (flagged.size < 2) return;
    const list = [...flagged];
    list.forEach(t => flaggedIds.add(t.id));
    const first = list[0];
    const extra = list.length - 1;
    dupBalanceImpact += first.type === 'income' ? -num(first.amount) * extra : num(first.amount) * extra;
    const owners = Array.from(new Set(list.map(t => t.userId)));
    dupItems.push({
      date: first.date,
      amount: num(first.amount),
      ownerIds: owners,
      label: `${dayLabel(first.date)} ${first.type === 'income' ? '수입' : '지출'} ${won(first.amount)} ${list.length}건`
        + ` (${list.map(t => (t.memo && String(t.memo).trim()) || '메모 없음').join(' / ')})`
    });
  });
  if (dupItems.length > 0) {
    const impact = summary.balance + dupBalanceImpact;
    findings.push({
      id: 'duplicates', level: 'warn',
      title: `같은 날 같은 금액이 두 번 기록된 것이 ${dupItems.length}건 있어요`,
      body: `중복이라면 하나를 지워야 해요. 지우면 ${monthLabel(monthStr)} 수지는 ${impact >= 0 ? '+' : ''}${won(impact)}이 돼요.`,
      items: dupItems
    });
  }

  // 2) 메모 없는 큰 금액
  const noMemo = monthTx
    .filter(t => !flaggedIds.has(t.id) && !t.installmentId && !t.recurringId
      && num(t.amount) >= BIG_MEMO_MISSING && !(t.memo && String(t.memo).trim()))
    .sort((a, b) => num(b.amount) - num(a.amount))
    .map(t => ({
      date: t.date, amount: num(t.amount), ownerIds: [t.userId],
      label: `${dayLabel(t.date)} ${catName(t.categoryId)} ${won(t.amount)} (메모 없음)`
    }));
  if (noMemo.length > 0) {
    findings.push({
      id: 'no-memo', level: 'check',
      title: `메모가 없는 큰 금액이 ${noMemo.length}건 있어요`,
      body: '무엇인지 적어 두면 다음 달 계획에 넣을지 판단하기 쉬워요.',
      items: noMemo
    });
  }

  // 3) 식비·카페 비중
  const focusCats = categoriesOut.filter(c => c.isFocus);
  if (focusCats.length > 0 && expenseExInstallment > 0) {
    const focusAmount = focusCats.reduce((s, c) => s + c.amount, 0);
    const focusCount = focusCats.reduce((s, c) => s + c.count, 0);
    const share = (focusAmount / expenseExInstallment) * 100;
    if (share >= 25) {
      findings.push({
        id: 'focus-share', level: share >= 35 ? 'warn' : 'check',
        title: `${focusCats.map(c => c.name.split('/')[0]).join(' + ')}가 지출의 ${pct1(share)}예요`,
        body: `${focusCount}건, 건당 평균 ${won(focusAmount / focusCount)}이에요. 10%만 줄여도 한 달에 약 ${won(focusAmount * 0.1)}이 남아요.`
          + (installmentAmount > 0 ? ' (비율은 할부금을 뺀 지출 기준이에요.)' : ''),
        items: focusCats.map(c => ({ label: `${c.name} ${c.count}건`, amount: c.amount, ownerIds: [] }))
      });
    }
  }

  // 4) 급여 외 수입 비중
  const salaryIds = new Set(cats.filter(c => c.type === 'income' && c.name === '급여').map(c => c.id));
  // 정기 수입을 표시해 둔 달은 아래 '정기 수입 대비 지출'에서 정기가 아닌 수입을 따로 다루므로 건너뜁니다.
  if (regularIncome === null && salaryIds.size > 0 && summary.totalIncome > 0) {
    const nonSalary = incomeCategories.filter(c => !salaryIds.has(c.id));
    const nonSalaryAmount = nonSalary.reduce((s, c) => s + c.amount, 0);
    const share = (nonSalaryAmount / summary.totalIncome) * 100;
    if (share >= 30) {
      findings.push({
        id: 'non-salary-income', level: 'check',
        title: `급여 밖의 수입이 수입의 ${pct1(share)}예요`,
        body: '부수입, 용돈, 환급 같은 수입이 다음 달에도 들어오는지 확인해 두면 계획하기 쉬워요.',
        items: nonSalary.map(c => ({ label: `${c.name} ${c.count}건`, amount: c.amount, ownerIds: [] }))
      });
    }
  }

  // 5) 수지와 저축률 (마감된 달만 — 월초에는 수입이 아직 안 들어와서 항상 적자로 보입니다)
  if (!isClosed) {
    // 시작 전(미래) 달은 안내 없이 넘어갑니다.
    if (!progress.isFuture) findings.push({
      id: 'in-progress', level: 'info',
      title: `아직 ${progress.daysRemaining}일이 남은 달이에요`,
      body: '수지와 저축률은 달이 끝난 뒤에 판단하도록 점검에서 뺐어요.',
      items: []
    });
  } else if (summary.totalIncome > 0 || summary.totalExpense > 0) {
    if (summary.balance < 0) {
      findings.push({
        id: 'deficit', level: 'warn',
        title: `${monthLabel(monthStr)}은 ${won(-summary.balance)} 적자예요`,
        body: '수입보다 지출이 컸어요. 큰 지출이 일회성이었는지 아래 항목에서 확인해 보세요.',
        items: []
      });
    } else if (summary.totalIncome > 0 && summary.savingsRate < 10) {
      findings.push({
        id: 'low-savings', level: 'check',
        title: `저축률이 ${pct1(summary.savingsRate)}로 낮아요`,
        body: `수입 ${won(summary.totalIncome)} 중 ${won(summary.balance)}이 남았어요.`,
        items: []
      });
    } else if (summary.savingsRate >= 20) {
      findings.push({
        id: 'good-savings', level: 'good',
        title: `저축률 ${pct1(summary.savingsRate)}, 잘 모으고 있어요`,
        body: `수입 ${won(summary.totalIncome)} 중 ${won(summary.balance)}이 남았어요.`,
        items: []
      });
    }
  }

  // 6) 큰 한 건
  const bigOne = [...expenses].sort((a, b) => num(b.amount) - num(a.amount))[0];
  if (bigOne && expenses.length >= 3 && summary.totalExpense > 0 && num(bigOne.amount) / summary.totalExpense >= BIG_SINGLE_RATIO) {
    const ratio = (num(bigOne.amount) / summary.totalExpense) * 100;
    const instNote = bigOne.installmentId
      ? ` 할부 ${bigOne.installmentMonths}회 중 ${bigOne.installmentSeq}회차예요.` : '';
    findings.push({
      id: 'big-single', level: 'info',
      title: `한 건이 지출의 ${pct1(ratio)}를 차지했어요`,
      body: `${bigOne.memo || catName(bigOne.categoryId)} ${won(bigOne.amount)}.${instNote}`,
      items: []
    });
  }

  // 7) 예산
  const monthBudgets = getBudgetsForMonth(budgets, monthStr).filter(b => num(b.amount) > 0);
  let budgetRows = [];
  if (monthBudgets.length === 0) {
    findings.push({
      id: 'no-budget', level: 'info',
      title: '예산이 설정되어 있지 않아요',
      body: '카테고리별 예산을 정해 두면 다음 달 리포트에서 초과 여부를 바로 알려드려요.',
      items: []
    });
  } else {
    budgetRows = calculateBudgetProgress(txs, budgets, cats, monthStr).filter(b => b.budgetAmount > 0);
    const over = budgetRows.filter(b => b.rawProgressPct >= 100);
    const near = budgetRows.filter(b => b.rawProgressPct >= 90 && b.rawProgressPct < 100);
    if (over.length > 0) {
      findings.push({
        id: 'budget-over', level: 'warn',
        title: `예산을 넘은 항목이 ${over.length}개 있어요`,
        body: '초과한 만큼 다음 달 예산을 조정할지 정해 보세요.',
        items: over.map(b => ({ label: `${b.categoryName} (예산 ${won(b.budgetAmount)})`, amount: b.usedAmount, ownerIds: [] }))
      });
    }
    if (near.length > 0) {
      findings.push({
        id: 'budget-near', level: 'check',
        title: `예산의 90%를 넘긴 항목이 ${near.length}개 있어요`,
        body: '다음 달에도 비슷하면 초과할 수 있어요.',
        items: near.map(b => ({ label: `${b.categoryName} (예산 ${won(b.budgetAmount)})`, amount: b.usedAmount, ownerIds: [] }))
      });
    }
    if (over.length === 0 && near.length === 0) {
      findings.push({
        id: 'budget-ok', level: 'good',
        title: '모든 예산 안에서 지냈어요', body: '', items: []
      });
    }
  }

  // 8) 지난달 대비 증가
  if (mom && mom.expenseChangePct !== null && mom.expenseChangePct >= 15) {
    findings.push({
      id: 'mom-up', level: 'check',
      title: `지출이 지난달보다 ${pct1(mom.expenseChangePct)} 늘었어요`,
      body: `${won(mom.expenseDiff)} 더 썼어요.`,
      items: mom.topIncreases.map(d => ({ label: `${d.name} (지난달 ${won(d.previous)})`, amount: d.current, ownerIds: [] }))
    });
  }

  // 9) 다음 달 확정 지출
  if (outlook.confirmedExpense > 0) {
    findings.push({
      id: 'next-fixed', level: 'info',
      title: `${monthLabel(nextMonthStr)}에 이미 정해진 지출이 ${won(outlook.confirmedExpense)} 있어요`,
      body: '할부 잔금과 반복 거래로 등록된 금액이에요.'
        + (outlook.candidateTotal > 0
          ? ` 매달 나갈 것 같은 지출 후보 ${won(outlook.candidateTotal)}까지 더하면 약 ${won(outlook.confirmedExpense + outlook.candidateTotal)}이에요.`
          : '')
        + (outlook.margin !== null
          ? ` 이번 달 정기 수입 ${won(regularIncome)}을 기준으로 하면 이 지출을 빼고 ${outlook.margin >= 0 ? '약 ' + won(outlook.margin) + '이 남아요' : won(-outlook.margin) + '이 모자라요'}.`
          : ''),
      items: [
        ...outlook.installments.map(x => ({
          label: `${x.name}${x.seq ? ` (${x.seq}/${x.months}회차)` : ''}`, amount: x.amount, ownerIds: []
        })),
        ...outlook.recurringExpense.map(x => ({
          label: `${x.name}${x.estimate ? ' (예상)' : ''}`, amount: x.amount, ownerIds: []
        }))
      ]
    });
  }

  // 10) 반복 의심 지출
  if (candidates.length > 0) {
    findings.push({
      id: 'recurring-candidates', level: 'check',
      title: `매달 나갈 것 같은 지출이 고정지출로 표시되지 않았어요 (${candidates.length}건)`,
      body: `합계 ${won(outlook.candidateTotal)}이에요. 고정지출로 표시하거나 반복 거래로 등록하면 다음 달 예측에 들어가요.`,
      items: [
        ...candidates.slice(0, 8).map(c => ({
          label: `${dayLabel(c.date)} ${c.label}`, amount: c.amount, ownerIds: [c.userId]
        })),
        ...(candidates.length > 8
          ? [{ label: `그 밖에 ${candidates.length - 8}건`, amount: candidates.slice(8).reduce((s, c) => s + c.amount, 0), ownerIds: [] }]
          : [])
      ]
    });
  }

  // 11) 정기 수입 대비 지출 (정기 수입 표시가 있을 때만 계산)
  if (regularIncome === null && summary.totalIncome > 0) {
    findings.push({
      id: 'no-regular-income', level: 'info',
      title: '정기 수입 표시가 없어서 안정적인 수입은 계산하지 못했어요',
      body: '수입을 입력할 때 상세 입력에서 "정기 수입"으로 표시하거나, 설정에서 반복 수입으로 등록하면 "정기 수입 대비 지출"을 볼 수 있어요.',
      items: []
    });
  } else if (regularIncome !== null && expenseExInstallment > 0) {
    const cov = (regularIncome / expenseExInstallment) * 100;
    const gap = expenseExInstallment - regularIncome;
    const note = installmentAmount > 0 ? ' (할부금은 뺀 지출 기준이에요.)' : '';
    if (gap > 0) {
      findings.push({
        id: 'regular-coverage', level: 'check',
        title: `정기 수입이 지출의 ${pct1(cov)}예요`,
        body: `정기 수입 ${won(regularIncome)}으로 지출 ${won(expenseExInstallment)}을 다 채우지 못했어요. 모자란 ${won(gap)}은 정기가 아닌 수입 ${won(irregularIncome)}`
          + (irregularIncome >= gap ? '이 채웠어요.' : '을 보태도 모자랐어요.') + note,
        items: []
      });
    } else {
      findings.push({
        id: 'regular-coverage', level: 'good',
        title: `정기 수입만으로 지출을 감당했어요 (${pct1(cov)})`,
        body: `정기 수입 ${won(regularIncome)}, 지출 ${won(expenseExInstallment)}.` + note,
        items: []
      });
    }
  }

  const order = { warn: 0, check: 1, info: 2, good: 3 };
  findings.sort((a, b) => order[a.level] - order[b.level]);
  findings.forEach(f => f.items.forEach(it => {
    it.owners = (it.ownerIds || []).map(userName).filter(Boolean);
  }));

  return {
    monthStr,
    monthLabel: monthLabel(monthStr),
    isClosed,
    progress,
    summary,
    installmentAmount,
    expenseExInstallment,
    regularIncome,
    irregularIncome,
    regularCoverage: regularIncome !== null && expenseExInstallment > 0 ? (regularIncome / expenseExInstallment) * 100 : null,
    incomeCategories,
    categories: categoriesOut,
    fixedVar,
    persons: {
      husbandName: userName('husband'),
      wifeName: userName('wife'),
      ...userBd
    },
    days,
    topDays,
    mom,
    budgets: budgetRows,
    outlook,
    findings,
    counts: {
      warn: findings.filter(f => f.level === 'warn').length,
      check: findings.filter(f => f.level === 'check').length
    }
  };
}
