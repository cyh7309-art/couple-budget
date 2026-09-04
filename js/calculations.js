/**
 * Financial Calculation Logic & Metrics Calculator
 * Couple Finance Dashboard ("우리집 가계부")
 */

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
export function calculateMonthlySummary(transactions, monthStr) {
  const monthTx = filterTransactionsByMonth(transactions, monthStr);

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
 * Budget vs Actual Expense Tracker per Category
 */
export function calculateBudgetProgress(transactions, budgets, categories, monthStr) {
  const categoryExpenses = calculateCategoryBreakdown(transactions, categories, monthStr).categories;
  const monthBudgets = budgets.filter(b => b.month === monthStr || !b.month);

  const budgetList = categories.filter(c => c.type === 'expense').map(cat => {
    const budgetObj = monthBudgets.find(b => b.categoryId === cat.id);
    const budgetAmount = budgetObj ? Number(budgetObj.amount) : 0;

    const expObj = categoryExpenses.find(e => e.id === cat.id);
    const usedAmount = expObj ? expObj.amount : 0;
    const remainingAmount = budgetAmount - usedAmount;
    const progressPct = budgetAmount > 0 ? (usedAmount / budgetAmount) * 100 : 0;

    // Status Determination:
    // 0 ~ 69%: normal (정상)
    // 70 ~ 89%: caution (주의)
    // 90 ~ 99%: warning (경고)
    // 100%+: over (초과)
    let status = 'normal';
    let statusLabel = '정상';
    let statusBadgeClass = 'badge-normal';
    let statusIcon = '🟢';

    if (progressPct >= 100) {
      status = 'over';
      statusLabel = '초과';
      statusBadgeClass = 'badge-over';
      statusIcon = '🚨';
    } else if (progressPct >= 90) {
      status = 'warning';
      statusLabel = '경고';
      statusBadgeClass = 'badge-warning';
      statusIcon = '⚠️';
    } else if (progressPct >= 70) {
      status = 'caution';
      statusLabel = '주의';
      statusBadgeClass = 'badge-caution';
      statusIcon = '🟡';
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
