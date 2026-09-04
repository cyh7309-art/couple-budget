/**
 * Financial Calculation Logic & Metrics Calculator
 * Couple Finance Dashboard ("우리집 가계부")
 */

import { todayLocalStr } from './utils.js';

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
