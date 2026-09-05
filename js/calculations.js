/**
 * Financial Calculation Logic & Metrics Calculator
 * Couple Finance Dashboard ("우리집 가계부")
 */

import { todayLocalStr, toLocalDateStr } from './utils.js';

/**
 * 해당 월의 "진행 상황"을 계산합니다.
 * 진행 중인 달을 지난 달과 그대로 비교하면 항상 "지출 급감"으로 보이기 때문에,
 * 거의 모든 지표가 이 값을 기준으로 보정됩니다.
 */
export function getMonthProgress(monthStr, todayStr) {
  const today = todayStr || todayLocalStr();
  const [y, m] = monthStr.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const currentMonth = today.slice(0, 7);

  let daysElapsed;
  let isCurrent = false;
  let isFuture = false;

  if (monthStr < currentMonth) {
    daysElapsed = daysInMonth;             // 이미 끝난 달
  } else if (monthStr > currentMonth) {
    daysElapsed = 0;                       // 아직 오지 않은 달
    isFuture = true;
  } else {
    daysElapsed = Number(today.slice(8, 10));
    isCurrent = true;
  }

  return {
    daysInMonth,
    daysElapsed,
    daysRemaining: Math.max(daysInMonth - daysElapsed, 0),
    isCurrent,
    isFuture,
    isComplete: !isCurrent && !isFuture,
    elapsedRatio: daysInMonth > 0 ? daysElapsed / daysInMonth : 0
  };
}

export function formatCurrency(amount) {
  if (amount === undefined || amount === null || isNaN(amount)) return '0원';
  return Math.round(amount).toLocaleString('ko-KR') + '원';
}

export function formatPercent(rate) {
  if (rate === undefined || rate === null || isNaN(rate)) return '0.0%';
  return rate.toFixed(1) + '%';
}

/**
 * Filter transactions for a given month string 'YYYY-MM'
 */
export function filterTransactionsByMonth(transactions, monthStr) {
  return transactions.filter(t => t.date && t.date.startsWith(monthStr));
}

/**
 * Calculate previous month string YYYY-MM
 */
export function getPreviousMonthStr(monthStr) {
  const [yearStr, mStr] = monthStr.split('-');
  let year = parseInt(yearStr, 10);
  let month = parseInt(mStr, 10) - 1;
  if (month < 1) {
    month = 12;
    year -= 1;
  }
  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * Calculate next month string YYYY-MM
 */
export function getNextMonthStr(monthStr) {
  const [yearStr, mStr] = monthStr.split('-');
  let year = parseInt(yearStr, 10);
  let month = parseInt(mStr, 10) + 1;
  if (month > 12) {
    month = 1;
    year += 1;
  }
  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * Core Monthly Summary Calculator
 * Excludes transfers ('type === transfer') from Income and Expense
 */
export function calculateMonthlySummary(transactions, monthStr, maxDay = null) {
  let monthTx = filterTransactionsByMonth(transactions, monthStr);

  // maxDay 가 주어지면 그 날짜까지만 집계합니다 (전월 동기간 비교용)
  if (maxDay !== null) {
    monthTx = monthTx.filter(t => Number(String(t.date).slice(8, 10)) <= maxDay);
  }

  let totalIncome = 0;
  let totalExpense = 0;

  monthTx.forEach(t => {
    if (t.type === 'income') {
      totalIncome += Number(t.amount || 0);
    } else if (t.type === 'expense') {
      totalExpense += Number(t.amount || 0);
    }
  });

  const balance = totalIncome - totalExpense;
  const savingsRate = totalIncome > 0 ? (balance / totalIncome) * 100 : 0;

  return {
    month: monthStr,
    totalIncome,
    totalExpense,
    balance,
    savingsRate,
    count: monthTx.length
  };
}

/**
 * Calculate Month over Month (MoM) change percentage
 */
export function calculateMoM(currentSummary, prevSummary) {
  const expenseDiff = currentSummary.totalExpense - prevSummary.totalExpense;
  const expenseChangePct = prevSummary.totalExpense > 0 
    ? (expenseDiff / prevSummary.totalExpense) * 100 
    : 0;

  const incomeDiff = currentSummary.totalIncome - prevSummary.totalIncome;
  const incomeChangePct = prevSummary.totalIncome > 0 
    ? (incomeDiff / prevSummary.totalIncome) * 100 
    : 0;

  const savingsRateDiff = currentSummary.savingsRate - prevSummary.savingsRate;

  return {
    expenseDiff,
    expenseChangePct,
    incomeDiff,
    incomeChangePct,
    savingsRateDiff
  };
}

/**
 * Category Breakdown for Expenses in monthStr
 */
export function calculateCategoryBreakdown(transactions, categories, monthStr) {
  const monthTx = filterTransactionsByMonth(transactions, monthStr).filter(t => t.type === 'expense');
  let totalExpense = 0;
  const categoryMap = {};

  // Initialize expense categories
  categories.filter(c => c.type === 'expense').forEach(cat => {
    categoryMap[cat.id] = {
      ...cat,
      amount: 0,
      count: 0,
      percentage: 0
    };
  });

  monthTx.forEach(t => {
    totalExpense += Number(t.amount || 0);
    if (categoryMap[t.categoryId]) {
      categoryMap[t.categoryId].amount += Number(t.amount || 0);
      categoryMap[t.categoryId].count += 1;
    } else {
      // Uncategorized / Unknown category fallback
      categoryMap[t.categoryId] = {
        id: t.categoryId,
        name: '기타',
        icon: '📦',
        color: '#94a3b8',
        amount: Number(t.amount || 0),
        count: 1,
        percentage: 0
      };
    }
  });

  const list = Object.values(categoryMap)
    .filter(item => item.amount > 0)
    .map(item => ({
      ...item,
      percentage: totalExpense > 0 ? (item.amount / totalExpense) * 100 : 0
    }))
    .sort((a, b) => b.amount - a.amount);

  return {
    totalExpense,
    categories: list
  };
}

/**
 * User & Shared / Personal Breakdown
 */
export function calculateUserBreakdown(transactions, monthStr) {
  const monthTx = filterTransactionsByMonth(transactions, monthStr).filter(t => t.type === 'expense');

  let sharedAmount = 0;
  let husbandPersonalAmount = 0;
  let wifePersonalAmount = 0;
  let husbandTotalSpent = 0;
  let wifeTotalSpent = 0;

  monthTx.forEach(t => {
    const amt = Number(t.amount || 0);
    if (t.userId === 'husband') husbandTotalSpent += amt;
    if (t.userId === 'wife') wifeTotalSpent += amt;

    if (t.sharedType === 'shared') {
      sharedAmount += amt;
    } else if (t.sharedType === 'husband') {
      husbandPersonalAmount += amt;
    } else if (t.sharedType === 'wife') {
      wifePersonalAmount += amt;
    }
  });

  return {
    sharedAmount,
    husbandPersonalAmount,
    wifePersonalAmount,
    husbandTotalSpent,
    wifeTotalSpent
  };
}

/**
 * Fixed vs Variable Expenses
 */
export function calculateFixedVsVariable(transactions, monthStr) {
  const monthTx = filterTransactionsByMonth(transactions, monthStr).filter(t => t.type === 'expense');
  let fixedAmount = 0;
  let variableAmount = 0;

  monthTx.forEach(t => {
    const amt = Number(t.amount || 0);
    if (t.isFixed) {
      fixedAmount += amt;
    } else {
      variableAmount += amt;
    }
  });

  const total = fixedAmount + variableAmount;
  return {
    fixedAmount,
    variableAmount,
    fixedRatio: total > 0 ? (fixedAmount / total) * 100 : 0,
    variableRatio: total > 0 ? (variableAmount / total) * 100 : 0
  };
}

/**
 * 해당 월의 예산을 반환합니다.
 * 그 달에 설정된 예산이 하나도 없으면, 가장 최근 이전 달의 예산을 그대로 이월해서 보여줍니다.
 * (기존에는 month 가 고정 문자열이라 달이 바뀌면 예산이 통째로 사라졌습니다)
 */
export function getBudgetsForMonth(budgets, monthStr) {
  const list = Array.isArray(budgets) ? budgets : [];

  const exact = list.filter(b => b.month === monthStr);
  if (exact.length > 0) return exact;

  // month 가 비어 있는 항목은 "모든 달 공통 예산"으로 취급
  const evergreen = list.filter(b => !b.month);
  if (evergreen.length > 0) return evergreen.map(b => ({ ...b, month: monthStr, inherited: true }));

  const earlierMonths = Array.from(
    new Set(list.map(b => b.month).filter(m => m && m < monthStr))
  ).sort();

  const prevMonth = earlierMonths[earlierMonths.length - 1];
  if (!prevMonth) return [];

  return list
    .filter(b => b.month === prevMonth)
    .map(b => ({ ...b, month: monthStr, inherited: true, inheritedFrom: prevMonth }));
}

/**
 * Budget vs Actual Expense Tracker per Category
 */

export function calculateBudgetProgress(transactions, budgets, categories, monthStr) {
  const categoryExpenses = calculateCategoryBreakdown(transactions, categories, monthStr).categories;
  const monthBudgets = getBudgetsForMonth(budgets, monthStr);
  const progress = getMonthProgress(monthStr);

  // 카테고리별 고정비/변동비 분리 — 예측에 필요합니다
  const splitByCat = {};
  filterTransactionsByMonth(transactions, monthStr)
    .filter(t => t.type === 'expense')
    .forEach(t => {
      const key = t.categoryId || '';
      if (!splitByCat[key]) splitByCat[key] = { fixed: 0, variable: 0 };
      const amt = Number(t.amount || 0);
      if (t.isFixed) splitByCat[key].fixed += amt;
      else splitByCat[key].variable += amt;
    });

  const budgetList = categories.filter(c => c.type === 'expense').map(cat => {
    const budgetObj = monthBudgets.find(b => b.categoryId === cat.id);
    const budgetAmount = budgetObj ? Number(budgetObj.amount) || 0 : 0;

    const expObj = categoryExpenses.find(e => e.id === cat.id);
    const usedAmount = expObj ? expObj.amount : 0;
    const remainingAmount = budgetAmount - usedAmount;
    const progressPct = budgetAmount > 0 ? (usedAmount / budgetAmount) * 100 : 0;

    // 이 속도로 계속 쓰면 월말에 얼마가 될지 (run-rate)
    // ⚠️ 고정비(월세·보험료처럼 월 1회)는 외삽하지 않습니다.
    //    그대로 곱하면 1일에 낸 월세가 30번 나가는 것처럼 계산됩니다.
    const split = splitByCat[cat.id] || { fixed: 0, variable: 0 };
    const projectedAmount = progress.elapsedRatio > 0
      ? split.fixed + (split.variable / progress.elapsedRatio)
      : usedAmount;
    const projectedPct = budgetAmount > 0 ? (projectedAmount / budgetAmount) * 100 : 0;

    // 페이스 = 월말 예상 지출 ÷ 예산. 1.0 이면 예산에 딱 맞게 끝날 속도.
    // (단순 '소진율 ÷ 경과율' 은 월초에 낸 고정비 때문에 수백 % 로 튀어서 쓰지 않습니다)
    const paceRatio = budgetAmount > 0 ? projectedAmount / budgetAmount : 0;

    // 남은 날 동안 하루 얼마까지 쓸 수 있는지
    const dailyAllowance = progress.daysRemaining > 0
      ? Math.max(remainingAmount, 0) / progress.daysRemaining
      : 0;

    let status = 'normal';
    let statusLabel = '정상';
    let statusBadgeClass = 'badge-normal';
    let statusIcon = '🟢';
    let paceMessage = '';

    if (progressPct >= 100) {
      status = 'over';
      statusLabel = '초과';
      statusBadgeClass = 'badge-over';
      statusIcon = '🚨';
      paceMessage = `예산보다 ${formatCurrency(usedAmount - budgetAmount)} 초과했습니다.`;
    } else if (progress.isCurrent && budgetAmount > 0 && progress.daysElapsed >= 3 && projectedPct >= 100) {
      // ✅ 핵심 개선: 아직 초과하지 않았어도 "이 속도면 초과"를 미리 알립니다
      status = 'projected_over';
      statusLabel = '초과 예상';
      statusBadgeClass = 'badge-over';
      statusIcon = '📈';
      paceMessage = `이 속도면 월말 ${formatCurrency(projectedAmount)} (예산의 ${projectedPct.toFixed(0)}%)`;
    } else if (progress.isCurrent && budgetAmount > 0 && progress.daysElapsed >= 3 && projectedPct >= 85) {
      status = 'caution';
      statusLabel = '빠듯함';
      statusBadgeClass = 'badge-caution';
      statusIcon = '🟡';
      paceMessage = `이 속도면 월말 ${formatCurrency(projectedAmount)} (예산의 ${projectedPct.toFixed(0)}%) — 여유가 크지 않습니다.`;
    } else if (!progress.isCurrent && progressPct >= 90) {
      status = 'warning';
      statusLabel = '경고';
      statusBadgeClass = 'badge-warning';
      statusIcon = '⚠️';
    } else if (!progress.isCurrent && progressPct >= 70) {
      status = 'caution';
      statusLabel = '주의';
      statusBadgeClass = 'badge-caution';
      statusIcon = '🟡';
    } else if (progress.isCurrent && budgetAmount > 0 && progress.daysRemaining > 0) {
      paceMessage = `남은 ${progress.daysRemaining}일 동안 하루 ${formatCurrency(dailyAllowance)}까지`;
    }

    return {
      categoryId: cat.id,
      categoryName: cat.name,
      icon: cat.icon,
      color: cat.color,
      budgetAmount,
      usedAmount,
      remainingAmount,
      progressPct: Math.min(progressPct, 100),
      rawProgressPct: progressPct,
      projectedAmount,
      projectedPct,
      paceRatio,
      dailyAllowance,
      paceMessage,
      status,
      statusLabel,
      statusBadgeClass,
      statusIcon
    };
  }).filter(item => item.budgetAmount > 0 || item.usedAmount > 0);

  return budgetList;
}

/**
 * Historical Monthly Trends (last N months)
 */
export function calculateHistoricalTrends(transactions, currentMonthStr, count = 6) {
  const trends = [];
  let curr = currentMonthStr;

  for (let i = 0; i < count; i++) {
    const summary = calculateMonthlySummary(transactions, curr);
    trends.unshift(summary);
    curr = getPreviousMonthStr(curr);
  }

  return trends;
}

/* ==========================================================================
   전월 동기간(MTD) 비교 · 지출 속도 · 부부 정산
   ========================================================================== */

/**
 * 전월 대비 비교.
 * ⚠️ 진행 중인 달은 "지난달 같은 날짜까지"와 비교합니다.
 *    (9월 4일 지출을 8월 한 달과 비교하면 항상 '지출 급감'으로 보입니다)
 */
export function calculateMonthOverMonth(transactions, monthStr) {
  const progress = getMonthProgress(monthStr);
  const prevMonthStr = getPreviousMonthStr(monthStr);

  const current = calculateMonthlySummary(transactions, monthStr);
  const prevFull = calculateMonthlySummary(transactions, prevMonthStr);

  // 진행 중인 달이면 지난달도 같은 일수까지만 잘라서 비교
  const comparable = progress.isCurrent && progress.daysElapsed < progress.daysInMonth;
  const prevBase = comparable
    ? calculateMonthlySummary(transactions, prevMonthStr, progress.daysElapsed)
    : prevFull;

  const pct = (curr, base) => (base > 0 ? ((curr - base) / base) * 100 : null);

  return {
    current,
    prevFull,
    prevBase,
    comparable,
    daysElapsed: progress.daysElapsed,
    prevMonthStr,
    expenseDiff: current.totalExpense - prevBase.totalExpense,
    expenseChangePct: pct(current.totalExpense, prevBase.totalExpense),
    incomeDiff: current.totalIncome - prevBase.totalIncome,
    incomeChangePct: pct(current.totalIncome, prevBase.totalIncome),
    savingsRateDiff: current.savingsRate - prevBase.savingsRate,
    // 비교 기준 설명 문구 (화면에 그대로 노출합니다)
    basisLabel: comparable
      ? `지난달 1~${progress.daysElapsed}일 대비`
      : '지난달 전체 대비'
  };
}

/**
 * 지출 속도 — 경과일 기준 일평균과 월말 예상 지출.
 * 기존에는 총지출을 '그 달 전체 일수'로 나눠서 월초에 심하게 과소평가됐습니다.
 */
export function calculateSpendingPace(transactions, monthStr) {
  const progress = getMonthProgress(monthStr);
  const summary = calculateMonthlySummary(transactions, monthStr);
  const fv = calculateFixedVsVariable(transactions, monthStr);

  const dailyAverage = progress.daysElapsed > 0
    ? summary.totalExpense / progress.daysElapsed
    : 0;

  // 변동비만 남은 일수만큼 늘려 잡고, 고정비는 이미 나간 금액을 그대로 둡니다
  const dailyVariable = progress.daysElapsed > 0 ? fv.variableAmount / progress.daysElapsed : 0;
  const projectedExpense = progress.isCurrent
    ? fv.fixedAmount + (dailyVariable * progress.daysInMonth)
    : summary.totalExpense;

  const projectedBalance = summary.totalIncome - projectedExpense;

  return {
    ...progress,
    totalExpense: summary.totalExpense,
    totalIncome: summary.totalIncome,
    dailyAverage,
    dailyVariableAverage: dailyVariable,
    fixedAmount: fv.fixedAmount,
    variableAmount: fv.variableAmount,
    projectedExpense,
    projectedBalance,
    projectedSavingsRate: summary.totalIncome > 0
      ? (projectedBalance / summary.totalIncome) * 100
      : 0
  };
}

/**
 * 부부 정산 — 공동생활비를 누가 얼마나 더 냈는지.
 *
 * @param mode 'half'  = 반반 부담
 *             'income' = 그 달 수입 비율대로 부담
 */
export function calculateSettlement(transactions, monthStr, mode = 'half') {
  const monthTx = filterTransactionsByMonth(transactions, monthStr);

  const sharedExpenses = monthTx.filter(t => t.type === 'expense' && t.sharedType === 'shared');

  let husbandPaid = 0;
  let wifePaid = 0;
  sharedExpenses.forEach(t => {
    const amt = Number(t.amount || 0);
    if (t.userId === 'wife') wifePaid += amt;
    else husbandPaid += amt;
  });
  const sharedTotal = husbandPaid + wifePaid;

  // 수입 비율 (income 모드용)
  let husbandIncome = 0;
  let wifeIncome = 0;
  monthTx.filter(t => t.type === 'income').forEach(t => {
    const amt = Number(t.amount || 0);
    if (t.userId === 'wife') wifeIncome += amt;
    else husbandIncome += amt;
  });
  const totalIncome = husbandIncome + wifeIncome;

  let husbandShareRatio = 0.5;
  let ratioBasis = '반반 부담 기준';

  if (mode === 'income') {
    if (totalIncome > 0) {
      husbandShareRatio = husbandIncome / totalIncome;
      ratioBasis = '수입 비율 기준';
    } else {
      ratioBasis = '수입 기록이 없어 반반 기준으로 계산';
    }
  }

  const husbandShouldPay = sharedTotal * husbandShareRatio;
  const wifeShouldPay = sharedTotal - husbandShouldPay;

  const husbandDiff = husbandPaid - husbandShouldPay; // 양수 = 더 냄

  // 1,000원 미만 차이는 정산할 필요가 없다고 봅니다
  const settled = Math.abs(husbandDiff) < 1000;

  return {
    mode,
    ratioBasis,
    sharedTotal,
    husbandPaid,
    wifePaid,
    husbandIncome,
    wifeIncome,
    husbandShareRatio,
    wifeShareRatio: 1 - husbandShareRatio,
    husbandShouldPay,
    wifeShouldPay,
    husbandDiff,
    settled,
    // 누가 누구에게 얼마를 보내면 되는지
    fromUserId: settled ? null : (husbandDiff > 0 ? 'wife' : 'husband'),
    toUserId: settled ? null : (husbandDiff > 0 ? 'husband' : 'wife'),
    amount: Math.abs(husbandDiff)
  };
}

/**
 * 계좌 잔액 자동 계산.
 * 시작 잔액(openingBalance)에 실제 거래를 반영합니다.
 *  - 수입: 입금 계좌 +
 *  - 지출: 결제 계좌 −  (카드 계좌는 음수 = 갚아야 할 금액)
 *  - 이체: 출금 계좌 − / 입금 계좌 +
 */
export function calculateAccountBalances(accounts, transactions) {
  const map = new Map();
  accounts.forEach(a => map.set(a.id, {
    ...a,
    openingBalance: Number(a.openingBalance ?? a.balance ?? 0),
    computedBalance: Number(a.openingBalance ?? a.balance ?? 0),
    txCount: 0
  }));

  let unassignedExpense = 0;
  let unassignedIncome = 0;

  transactions.forEach(t => {
    const amt = Number(t.amount || 0);

    if (t.type === 'transfer') {
      const from = map.get(t.fromAccountId);
      const to = map.get(t.toAccountId);
      if (from) { from.computedBalance -= amt; from.txCount++; }
      if (to) { to.computedBalance += amt; to.txCount++; }
      return;
    }

    const acc = map.get(t.accountId);
    if (!acc) {
      if (t.type === 'expense') unassignedExpense += amt;
      else if (t.type === 'income') unassignedIncome += amt;
      return;
    }

    if (t.type === 'income') acc.computedBalance += amt;
    else if (t.type === 'expense') acc.computedBalance -= amt;
    acc.txCount++;
  });

  const list = Array.from(map.values());
  return {
    accounts: list,
    totalBalance: list.reduce((sum, a) => sum + a.computedBalance, 0),
    assetTotal: list.filter(a => a.computedBalance > 0).reduce((s, a) => s + a.computedBalance, 0),
    debtTotal: list.filter(a => a.computedBalance < 0).reduce((s, a) => s + a.computedBalance, 0),
    unassignedExpense,
    unassignedIncome,
    hasUnassigned: unassignedExpense > 0 || unassignedIncome > 0
  };
}

/* ==========================================================================
   카드 청구 주기 (결산일 → 결제일)
   ========================================================================== */

/** 해당 연/월에서 day 를 유효한 날짜로 보정 (31일 지정 + 2월 → 28/29일) */
function clampDate(year, month1, day) {
  const daysInMonth = new Date(year, month1, 0).getDate();
  const d = Math.min(Math.max(Number(day) || 1, 1), daysInMonth);
  return `${year}-${String(month1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function addDays(dateStr, delta) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  return toLocalDateStr(d);
}

function shiftMonth(monthStr, delta) {
  const [y, m] = monthStr.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * 카드의 청구 주기를 계산합니다.
 *
 * 한국 카드사는 크게 두 가지 형태입니다.
 *   ① 1일~말일 사용분을 다음 달 25일 결제  → statementDay 31, paymentMonthOffset 1, paymentDay 25
 *   ② 전월 14일~당월 13일 사용분을 당월 27일 결제 → statementDay 13, paymentMonthOffset 0, paymentDay 27
 *
 * @param paymentMonthStr 결제가 일어나는 달 'YYYY-MM'
 * @returns { periodStart, periodEnd, paymentDate } 모두 'YYYY-MM-DD'
 */
export function getCardBillingCycle(card, paymentMonthStr) {
  const statementDay = Number(card.statementDay) || 31;
  const paymentDay = Number(card.paymentDay) || 25;
  const offset = card.paymentMonthOffset === 0 ? 0 : 1;

  const [py, pm] = paymentMonthStr.split('-').map(Number);
  const paymentDate = clampDate(py, pm, paymentDay);

  const statementMonth = shiftMonth(paymentMonthStr, -offset);
  const [sy, sm] = statementMonth.split('-').map(Number);
  const periodEnd = clampDate(sy, sm, statementDay);

  const prevMonth = shiftMonth(statementMonth, -1);
  const [vy, vm] = prevMonth.split('-').map(Number);
  const periodStart = addDays(clampDate(vy, vm, statementDay), 1);

  return { periodStart, periodEnd, paymentDate, statementMonth };
}

/**
 * 해당 결제월에 빠져나갈 카드 사용액을 집계합니다.
 * (카드 결제 이체 자체는 type 'transfer' 이므로 사용액에 포함되지 않습니다)
 */
export function calculateCardBilling(card, transactions, paymentMonthStr) {
  const cycle = getCardBillingCycle(card, paymentMonthStr);

  let amount = 0;
  let txCount = 0;
  transactions.forEach(t => {
    if (t.type !== 'expense') return;
    if (t.accountId !== card.id) return;
    const d = String(t.date || '');
    if (d < cycle.periodStart || d > cycle.periodEnd) return;
    amount += Number(t.amount || 0);
    txCount += 1;
  });

  return { ...cycle, cardId: card.id, amount, txCount };
}

/**
 * 오늘 기준 "다음 결제 예정"을 반환합니다.
 * 이번 달 결제일이 이미 지났으면 다음 달 건을 돌려줍니다.
 */
export function getUpcomingCardPayment(card, transactions, todayStr) {
  const today = todayStr || todayLocalStr();
  const thisMonth = today.slice(0, 7);

  const current = calculateCardBilling(card, transactions, thisMonth);
  if (current.paymentDate >= today) return current;

  return calculateCardBilling(card, transactions, shiftMonth(thisMonth, 1));
}

/**
 * 지금 "쌓이는 중"인 청구분을 반환합니다.
 * 즉, 오늘 긁은 카드값이 언제 얼마로 빠져나갈지에 해당하는 주기입니다.
 *
 * 다음 결제일과 다를 수 있습니다. 예를 들어 9월 4일에 '말일 마감 / 다음 달 25일 결제' 카드라면
 *  - 다음 결제일   = 9/25 (8월 사용분)
 *  - 쌓이는 중     = 9/1~9/30 사용분, 10/25 결제
 * 사용자가 실제로 궁금한 쪽은 후자입니다.
 */
export function getAccruingCardCycle(card, transactions, todayStr) {
  const today = todayStr || todayLocalStr();
  const thisMonth = today.slice(0, 7);

  for (const offset of [0, 1, -1]) {
    const billing = calculateCardBilling(card, transactions, shiftMonth(thisMonth, offset));
    if (today >= billing.periodStart && today <= billing.periodEnd) return billing;
  }
  // 안전망: 못 찾으면 다음 결제 건을 돌려줍니다
  return getUpcomingCardPayment(card, transactions, today);
}

/* ==========================================================================
   할부 (Installment)
   ==========================================================================
   회계 방식: 구매 금액을 구매한 달에 통째로 잡지 않고 회차별로 나눠 기록합니다.
   가계부의 월 예산·부부 정산·카드 결제액이 모두 "그 달에 실제로 빠져나가는 돈"
   기준이기 때문입니다. 120만원 12개월 할부를 구매월에 통째로 잡으면
   그 달 예산이 터지고 정산 금액도 실제와 달라집니다.

   수수료 계산은 국내 카드사 방식(원금 균등 + 잔액 기준 수수료)을 따릅니다.
     회차 원금  = 할부원금 / 개월수   (나머지 원 단위는 1회차에 몰아줌)
     회차 수수료 = 남은 원금 × (연이율 / 12)
   ========================================================================== */

/** 구매일에서 n개월 뒤 (말일 자동 보정: 1/31 + 1개월 → 2/28) */
export function addMonthsClamped(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(y, m - 1 + n, 1);
  return clampDate(target.getFullYear(), target.getMonth() + 1, d);
}

/**
 * 할부 상환 스케줄을 만듭니다.
 * @param totalAmount 할부 원금(구매 금액)
 * @param months      할부 개월 수 (2 이상)
 * @param startDate   구매일 'YYYY-MM-DD' — 1회차가 이 날짜에 청구됩니다
 * @param annualRate  연 수수료율 % (0 이면 무이자)
 */
export function buildInstallmentSchedule(totalAmount, months, startDate, annualRate = 0) {
  const principal = Math.round(Number(totalAmount) || 0);
  const n = Math.max(2, Math.round(Number(months) || 2));
  const rate = Math.max(0, Number(annualRate) || 0) / 100 / 12;

  const basePrincipal = Math.floor(principal / n);
  const remainder = principal - basePrincipal * n; // 나머지 원 단위

  const rows = [];
  let outstanding = principal;

  for (let seq = 1; seq <= n; seq++) {
    // 나머지는 1회차에 얹습니다 (카드사 관행)
    const principalPart = seq === 1 ? basePrincipal + remainder : basePrincipal;
    const feePart = rate > 0 ? Math.round(outstanding * rate) : 0;

    rows.push({
      seq,
      date: addMonthsClamped(startDate, seq - 1),
      principal: principalPart,
      fee: feePart,
      amount: principalPart + feePart,
      outstandingBefore: outstanding,
      outstandingAfter: outstanding - principalPart
    });

    outstanding -= principalPart;
  }

  const totalFee = rows.reduce((s, r) => s + r.fee, 0);
  return {
    months: n,
    principal,
    annualRate: Number(annualRate) || 0,
    totalFee,
    totalPayment: principal + totalFee,
    monthlyAmount: rows[0].amount, // 1회차 기준 (안내용)
    rows
  };
}

/**
 * 거래 목록에서 할부 건들을 모아 현황을 계산합니다.
 * @param monthStr 기준 월 — 이 달에 나갈 할부금 합계를 함께 돌려줍니다
 */
export function calculateInstallments(transactions, monthStr, todayStr) {
  const today = todayStr || todayLocalStr();
  const groups = new Map();

  transactions.forEach(t => {
    if (!t.installmentId) return;
    if (!groups.has(t.installmentId)) groups.set(t.installmentId, []);
    groups.get(t.installmentId).push(t);
  });

  const plans = [];
  let monthlyBurden = 0;
  let remainingTotal = 0;

  groups.forEach((rows, id) => {
    rows.sort((a, b) => (Number(a.installmentSeq) || 0) - (Number(b.installmentSeq) || 0));
    const first = rows[0];
    const months = Number(first.installmentMonths) || rows.length;

    const paidRows = rows.filter(r => String(r.date) <= today);
    const remainingRows = rows.filter(r => String(r.date) > today);

    const thisMonthRows = rows.filter(r => String(r.date).startsWith(monthStr));
    const thisMonthAmount = thisMonthRows.reduce((s, r) => s + Number(r.amount || 0), 0);
    monthlyBurden += thisMonthAmount;

    const remainingAmount = remainingRows.reduce((s, r) => s + Number(r.amount || 0), 0);
    remainingTotal += remainingAmount;

    plans.push({
      installmentId: id,
      name: first.memo || '할부 결제',
      months,
      paidCount: paidRows.length,
      remainingCount: remainingRows.length,
      totalAmount: rows.reduce((s, r) => s + Number(r.amount || 0), 0),
      principal: Number(first.installmentPrincipal) || rows.reduce((s, r) => s + Number(r.amount || 0), 0),
      remainingAmount,
      thisMonthAmount,
      accountId: first.accountId || '',
      categoryId: first.categoryId || '',
      userId: first.userId || 'husband',
      sharedType: first.sharedType || 'shared',
      startDate: rows[0].date,
      endDate: rows[rows.length - 1].date,
      isActive: remainingRows.length > 0,
      rows
    });
  });

  plans.sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return String(a.endDate).localeCompare(String(b.endDate));
  });

  return {
    plans,
    activePlans: plans.filter(p => p.isActive),
    monthlyBurden,
    remainingTotal
  };
}
