/**
 * Dashboard View (Home / 메인 대시보드)
 *
 * 구성 원칙
 *  1. 이번 달에 남은 돈 하나를 가장 크게 둔다. 수입·지출은 그 아래 작게.
 *  2. 손이 가야 하는 일(금액 확인)은 큰 카드가 아니라 한 줄짜리 행으로 위에 모은다.
 *  3. 구역 제목에는 이모지를 쓰지 않는다. 카테고리 이모지는 데이터라 남긴다.
 */

import {
  formatCurrency,
  formatPercent,
  calculateMonthlySummary,
  calculateMonthOverMonth,
  calculateSpendingPace,
  calculateCategoryBreakdown,
  calculateBudgetProgress,
  calculateFixedVsVariable,
  calculateUserBreakdown,
  calculateInstallments
} from '../calculations.js';
import { StorageManager } from '../storage.js';
import { esc, thousands, parseAmount } from '../utils.js';

export function renderDashboardView(containerEl, currentMonthStr, onNavigateTab, refreshApp) {
  const transactions = StorageManager.getTransactions();
  const categories = StorageManager.getCategories();
  const budgets = StorageManager.getBudgets();
  const users = StorageManager.getUsers();

  const summary = calculateMonthlySummary(transactions, currentMonthStr);
  const mom = calculateMonthOverMonth(transactions, currentMonthStr);
  const pace = calculateSpendingPace(transactions, currentMonthStr);
  const pendingRecurring = StorageManager.getPendingRecurring(currentMonthStr);
  const installments = calculateInstallments(transactions, currentMonthStr);

  const catBreakdown = calculateCategoryBreakdown(transactions, categories, currentMonthStr);
  const budgetList = calculateBudgetProgress(transactions, budgets, categories, currentMonthStr);
  const fixedVar = calculateFixedVsVariable(transactions, currentMonthStr);
  const userBreakdown = calculateUserBreakdown(transactions, currentMonthStr);

  const monthTxList = transactions
    .filter(t => t.date && t.date.startsWith(currentMonthStr))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 5);

  const husbandName = esc(users.husband.name);
  const wifeName = esc(users.wife.name);

  /* ---------- 히어로 ---------- */
  const expenseShare = summary.totalIncome > 0
    ? Math.min((summary.totalExpense / summary.totalIncome) * 100, 100)
    : (summary.totalExpense > 0 ? 100 : 0);

  // 히어로에 띄우는 숫자가 '남은 돈'이므로 증감도 잔액끼리 비교합니다
  const prevBalance = mom.prevBase.balance;
  const balanceChangePct = prevBalance > 0
    ? ((summary.balance - prevBalance) / prevBalance) * 100
    : null;

  const deltaHtml = (pct, goodWhenDown) => {
    if (pct === null) {
      return `<span class="hero-delta muted">${esc(mom.prevMonthStr)} 기록 없음</span>`;
    }
    const up = pct >= 0;
    const good = goodWhenDown ? !up : up;
    return `<span class="hero-delta ${good ? 'good' : 'bad'}">
      ${up ? '▲' : '▼'} ${Math.abs(pct).toFixed(1)}%
    </span>`;
  };

  const heroHtml = `
    <section class="hero">
      <span class="hero-label">${esc(String(parseInt(currentMonthStr.split('-')[1], 10)))}월에 남은 돈</span>
      <div class="hero-amount">
        <strong>${Math.round(summary.balance).toLocaleString('ko-KR')}</strong>
        <span class="hero-unit">원</span>
      </div>
      <div class="hero-sub">
        ${deltaHtml(balanceChangePct, false)}
        <span class="hero-basis">${esc(mom.basisLabel)}</span>
      </div>

      <div class="hero-bar" role="img" aria-label="수입 대비 지출 비율 ${expenseShare.toFixed(0)}%">
        <div class="hero-bar-fill" style="width: ${expenseShare}%"></div>
      </div>

      <div class="hero-stats">
        <div class="hero-stat">
          <span class="hero-stat-label">수입</span>
          <strong>${formatCurrency(summary.totalIncome)}</strong>
        </div>
        <div class="hero-stat">
          <span class="hero-stat-label">지출</span>
          <strong class="text-expense">${formatCurrency(summary.totalExpense)}</strong>
        </div>
        <div class="hero-stat">
          <span class="hero-stat-label">남긴 비율</span>
          <strong>${formatPercent(summary.savingsRate)}</strong>
        </div>
      </div>
    </section>
  `;

  /* ---------- 처리할 일 ---------- */
  const todoItems = [];

  pendingRecurring.forEach(item => {
    todoItems.push(`
      <div class="todo-row" data-id="${esc(item.template.id)}">
        <div class="todo-icon warn" aria-hidden="true">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"></path><path d="M12 17h.01"></path><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"></path></svg>
        </div>
        <div class="todo-text">
          <span class="todo-title">${esc(item.template.name)} 금액 확인</span>
          <span class="todo-meta">
            ${item.lastMonth
              ? `${esc(item.lastMonth)} 실제 ${formatCurrency(item.suggestedAmount)}`
              : '이전 기록 없음'} · 매월 ${Number(item.template.dayOfMonth) || 1}일
          </span>
        </div>
        <div class="todo-action">
          <input type="text" inputmode="numeric" class="form-input pending-amount"
                 data-id="${esc(item.template.id)}" aria-label="${esc(item.template.name)} 금액"
                 value="${thousands(item.suggestedAmount)}" />
          <button class="btn-primary-sm btn-confirm-rec" data-id="${esc(item.template.id)}">확정</button>
          <button class="btn-text btn-skip-rec" data-id="${esc(item.template.id)}">이번 달 없음</button>
        </div>
      </div>
    `);
  });

  const todoHtml = todoItems.length === 0 ? '' : `
    <section class="board-section">
      <h2 class="section-label">처리할 일</h2>
      <div class="todo-list">${todoItems.join('')}</div>
    </section>
  `;

  /* ---------- 예산 ---------- */
  const budgetHtml = `
    <section class="board-section">
      <div class="section-head">
        <h2 class="section-label">예산</h2>
        <button class="btn-text" id="btn-go-settings">설정</button>
      </div>

      ${budgetList.length === 0 ? `
        <div class="card empty-state">
          <span class="empty-icon">📝</span>
          <p>설정된 예산이 없습니다. 설정에서 카테고리별 예산을 정해보세요.</p>
        </div>
      ` : `
        <div class="card budget-list">
          ${budgetList.map(b => `
            <div class="budget-item">
              <div class="budget-header">
                <span class="budget-name">${esc(b.categoryName)}</span>
                <span class="budget-vals">
                  <strong>${Math.round(b.usedAmount).toLocaleString('ko-KR')}</strong>
                  <span class="budget-cap">/ ${Math.round(b.budgetAmount).toLocaleString('ko-KR')}</span>
                </span>
              </div>
              <div class="progress-track">
                <div class="progress-fill ${b.status}" style="width: ${b.progressPct}%"></div>
              </div>
              <div class="budget-foot">
                <span class="badge ${b.statusBadgeClass}">${esc(b.statusLabel)}</span>
                ${b.paceMessage ? `<span class="budget-pace">${esc(b.paceMessage)}</span>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      `}
    </section>
  `;

  /* ---------- 지출 속도 · 고정변동 · 공동개인 ---------- */
  const paceHtml = pace.isFuture ? '' : `
    <section class="board-section">
      <h2 class="section-label">이번 달 흐름</h2>
      <div class="widgets-row">
        <div class="card widget-card">
          <h3 class="widget-title">지출 속도</h3>
          <div class="pace-rows">
            <div class="pace-row"><span>일평균</span><strong>${formatCurrency(pace.dailyAverage)}</strong></div>
            <div class="pace-row"><span>변동비 일평균</span><strong>${formatCurrency(pace.dailyVariableAverage)}</strong></div>
            ${pace.isCurrent ? `
              <div class="pace-row"><span>월말 예상</span><strong class="text-warn">${formatCurrency(pace.projectedExpense)}</strong></div>
              <div class="pace-row"><span>월말 예상 잔액</span>
                <strong class="${pace.projectedBalance >= 0 ? 'text-income' : 'text-expense'}">${formatCurrency(pace.projectedBalance)}</strong>
              </div>
            ` : ''}
          </div>
          <p class="pace-note">
            ${pace.isCurrent
              ? `${pace.daysInMonth}일 중 ${pace.daysElapsed}일 지남 · 예측은 고정비 ${formatCurrency(pace.fixedAmount)}를 그대로 두고 변동비만 늘려 계산합니다.`
              : '마감된 달의 실제 값입니다.'}
          </p>
        </div>

        <div class="card widget-card">
          <h3 class="widget-title">고정비와 변동비</h3>
          <div class="fixed-var-bar">
            <div class="fv-segment fv-fixed" style="width: ${fixedVar.fixedRatio}%"></div>
            <div class="fv-segment fv-variable" style="width: ${fixedVar.variableRatio}%"></div>
          </div>
          <div class="fv-legend">
            <div><span class="dot dot-fixed"></span> 고정 ${formatCurrency(fixedVar.fixedAmount)} (${fixedVar.fixedRatio.toFixed(0)}%)</div>
            <div><span class="dot dot-variable"></span> 변동 ${formatCurrency(fixedVar.variableAmount)} (${fixedVar.variableRatio.toFixed(0)}%)</div>
          </div>
        </div>

        <div class="card widget-card">
          <h3 class="widget-title">공동과 개인</h3>
          <div class="user-split-list">
            <div class="split-item"><span>공동생활비</span><strong>${formatCurrency(userBreakdown.sharedAmount)}</strong></div>
            <div class="split-item"><span><span class="who-dot who-h"></span> ${husbandName} 개인</span><strong>${formatCurrency(userBreakdown.husbandPersonalAmount)}</strong></div>
            <div class="split-item"><span><span class="who-dot who-w"></span> ${wifeName} 개인</span><strong>${formatCurrency(userBreakdown.wifePersonalAmount)}</strong></div>
          </div>
        </div>
      </div>
    </section>
  `;

  /* ---------- 카테고리 ---------- */
  const categoryHtml = `
    <section class="board-section">
      <div class="section-head">
        <h2 class="section-label">어디에 썼나</h2>
        <button class="btn-text" id="btn-go-stats">통계</button>
      </div>

      ${catBreakdown.categories.length === 0 ? `
        <div class="card empty-state">
          <span class="empty-icon">📝</span>
          <p>이번 달 등록된 지출이 없습니다.</p>
        </div>
      ` : `
        <div class="card cat-rows">
          ${catBreakdown.categories.slice(0, 6).map(cat => `
            <div class="cat-row">
              <span class="cat-row-icon">${esc(cat.icon)}</span>
              <span class="cat-row-name">${esc(cat.name)}</span>
              <span class="cat-row-vals">
                <strong>${formatCurrency(cat.amount)}</strong>
                <span class="cat-row-pct">${cat.percentage.toFixed(1)}%</span>
              </span>
            </div>
          `).join('')}
        </div>
      `}
    </section>
  `;

  /* ---------- 할부 ---------- */
  const installmentHtml = installments.activePlans.length === 0 ? '' : `
    <section class="board-section">
      <div class="section-head">
        <h2 class="section-label">진행 중인 할부 ${installments.activePlans.length}건</h2>
        <span class="section-note">
          이번 달 ${formatCurrency(installments.monthlyBurden)}
          · 앞으로 남은 총액 ${formatCurrency(installments.remainingTotal)}
        </span>
      </div>

      <div class="card inst-list">
        ${installments.activePlans.map(p => {
          const done = p.months - p.remainingCount;
          const pct = p.months > 0 ? (done / p.months) * 100 : 0;
          return `
            <div class="inst-item">
              <div class="inst-head">
                <span class="inst-name">${esc(p.name)}</span>
                <span class="inst-count">${done}/${p.months}회</span>
              </div>
              <div class="progress-track">
                <div class="progress-fill inst" style="width: ${pct}%"></div>
              </div>
              <div class="inst-meta">
                <span>월 ${formatCurrency(p.rows[0].amount)}</span>
                <span>잔여 ${formatCurrency(p.remainingAmount)}</span>
                <span>${esc(p.endDate)} 종료</span>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </section>
  `;

  /* ---------- 최근 거래 ---------- */
  const recentHtml = `
    <section class="board-section">
      <div class="section-head">
        <h2 class="section-label">최근 거래</h2>
        <button class="btn-text" id="btn-go-tx">전체보기</button>
      </div>

      ${monthTxList.length === 0 ? `
        <div class="card empty-state">
          <span class="empty-icon">💸</span>
          <p>이번 달 거래 내역이 없습니다.</p>
        </div>
      ` : `
        <div class="card recent-tx-list">
          ${monthTxList.map(t => {
            const catObj = categories.find(c => c.id === t.categoryId);
            const isIncome = t.type === 'income';
            const isTransfer = t.type === 'transfer';
            return `
              <div class="tx-row-item">
                <div class="tx-left">
                  <div class="tx-cat-badge">${isTransfer ? '🔄' : (catObj ? esc(catObj.icon) : '📦')}</div>
                  <div class="tx-details">
                    <div class="tx-memo">
                      ${esc(t.memo) || (catObj ? esc(catObj.name) : '거래')}
                      ${t.recurringId ? '<span class="badge badge-fixed">반복</span>' : ''}
                      ${t.installmentId ? `<span class="badge badge-installment">할부 ${t.installmentSeq}/${t.installmentMonths}</span>` : ''}
                    </div>
                    <div class="tx-meta">
                      <span>${esc(t.date)}</span>
                      ${t.type === 'expense' ? `<span>${t.sharedType === 'shared' ? '공동' : (t.sharedType === 'wife' ? wifeName : husbandName) + ' 개인'}</span>` : ''}
                    </div>
                  </div>
                </div>
                <div class="tx-amount ${isIncome ? 'income' : (isTransfer ? 'transfer' : 'expense')}">
                  ${isIncome ? '+' : (isTransfer ? '' : '−')}${formatCurrency(t.amount)}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `}
    </section>
  `;

  containerEl.innerHTML = `
    <div class="board">
      ${heroHtml}
      ${todoHtml}
      ${budgetHtml}
      ${paceHtml}
      ${categoryHtml}
      ${installmentHtml}
      ${recentHtml}
    </div>
  `;

  /* ===================== 이벤트 ===================== */

  const on = (sel, fn) => {
    const el = containerEl.querySelector(sel);
    if (el) el.addEventListener('click', fn);
  };

  on('#btn-go-stats', () => onNavigateTab('statistics'));
  on('#btn-go-settings', () => onNavigateTab('settings'));
  on('#btn-go-tx', () => onNavigateTab('transactions'));

  containerEl.querySelectorAll('.btn-confirm-rec').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      const input = containerEl.querySelector(`.pending-amount[data-id="${id}"]`);
      const amount = parseAmount(input ? input.value : '');
      if (amount === null || amount <= 0) {
        alert('금액을 0원보다 크게 입력해주세요.');
        if (input) input.focus();
        return;
      }
      btn.disabled = true;
      await StorageManager.confirmRecurring(id, currentMonthStr, amount);
      if (refreshApp) refreshApp();
    });
  });

  containerEl.querySelectorAll('.btn-skip-rec').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      await StorageManager.skipRecurring(btn.getAttribute('data-id'), currentMonthStr);
      if (refreshApp) refreshApp();
    });
  });

  containerEl.querySelectorAll('.pending-amount').forEach(input => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) {
        const btn = containerEl.querySelector(`.btn-confirm-rec[data-id="${input.getAttribute('data-id')}"]`);
        if (btn) btn.click();
      }
    });
  });
}
