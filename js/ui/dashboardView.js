/**
 * Dashboard View (Home / 메인 대시보드)
 */

import {
  formatCurrency,
  formatPercent,
  calculateMonthlySummary,
  calculateMonthOverMonth,
  calculateSpendingPace,
  calculateSettlement,
  calculateCategoryBreakdown,
  calculateBudgetProgress,
  calculateFixedVsVariable,
  calculateUserBreakdown
} from '../calculations.js';
import { StorageManager } from '../storage.js';
import { esc } from '../utils.js';

export function renderDashboardView(containerEl, currentMonthStr, onNavigateTab) {
  const transactions = StorageManager.getTransactions();
  const categories = StorageManager.getCategories();
  const budgets = StorageManager.getBudgets();
  const users = StorageManager.getUsers();
  const settings = StorageManager.getSettings();

  const summary = calculateMonthlySummary(transactions, currentMonthStr);
  const mom = calculateMonthOverMonth(transactions, currentMonthStr);
  const pace = calculateSpendingPace(transactions, currentMonthStr);
  const settlement = calculateSettlement(transactions, currentMonthStr, settings.settlementMode);

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

  /** 증감률 문구 — 비교 대상이 없으면 정직하게 "비교 불가"라고 씁니다 */
  const changeText = (pct, goodWhenDown) => {
    if (pct === null) {
      return `<span class="text-muted">${esc(mom.prevMonthStr)} 데이터 없음</span>`;
    }
    const up = pct >= 0;
    const good = goodWhenDown ? !up : up;
    const arrow = up ? '▲' : '▼';
    return `<span class="${good ? 'text-positive' : 'text-negative'}">${arrow} ${Math.abs(pct).toFixed(1)}%</span>`;
  };

  const settlementCard = `
    <div class="card dash-card settlement-card">
      <div class="card-title-row">
        <h3 class="card-title">🤝 이번 달 부부 정산</h3>
        <span class="badge badge-normal">${esc(settlement.ratioBasis)}</span>
      </div>

      ${settlement.sharedTotal === 0 ? `
        <div class="empty-state">
          <span class="empty-icon">🤝</span>
          <p>공동생활비로 기록된 지출이 없습니다.</p>
        </div>
      ` : `
        <div class="settle-headline ${settlement.settled ? 'settled' : ''}">
          ${settlement.settled
            ? '✅ 정산할 금액이 없습니다. 부담이 균형을 이루고 있어요.'
            : `<strong>${settlement.fromUserId === 'husband' ? `👨 ${husbandName}` : `👩 ${wifeName}`}</strong>
               님이
               <strong>${settlement.toUserId === 'husband' ? `👨 ${husbandName}` : `👩 ${wifeName}`}</strong>
               님에게 <strong class="settle-amount">${formatCurrency(settlement.amount)}</strong> 보내면 정산 완료`}
        </div>

        <div class="settle-grid">
          <div class="settle-row">
            <span>공동생활비 총액</span>
            <strong>${formatCurrency(settlement.sharedTotal)}</strong>
          </div>
          <div class="settle-row">
            <span>👨 ${husbandName} 실제 결제</span>
            <strong>${formatCurrency(settlement.husbandPaid)}</strong>
            <span class="settle-should">부담해야 할 몫 ${formatCurrency(settlement.husbandShouldPay)}</span>
          </div>
          <div class="settle-row">
            <span>👩 ${wifeName} 실제 결제</span>
            <strong>${formatCurrency(settlement.wifePaid)}</strong>
            <span class="settle-should">부담해야 할 몫 ${formatCurrency(settlement.wifeShouldPay)}</span>
          </div>
        </div>

        <div class="settle-bar">
          <div class="settle-seg settle-h" style="width: ${settlement.sharedTotal > 0 ? (settlement.husbandPaid / settlement.sharedTotal) * 100 : 0}%"></div>
          <div class="settle-seg settle-w" style="width: ${settlement.sharedTotal > 0 ? (settlement.wifePaid / settlement.sharedTotal) * 100 : 0}%"></div>
        </div>
        <div class="settle-legend">
          <span><span class="dot dot-h"></span> ${husbandName} 결제 비중</span>
          <span><span class="dot dot-w"></span> ${wifeName} 결제 비중</span>
        </div>
      `}
    </div>
  `;

  const paceCard = pace.isFuture ? '' : `
    <div class="card widget-card pace-card">
      <h4 class="widget-title">⏱️ 지출 속도</h4>
      <div class="pace-rows">
        <div class="pace-row">
          <span>일평균 지출</span>
          <strong>${formatCurrency(pace.dailyAverage)}</strong>
        </div>
        <div class="pace-row">
          <span>변동비 일평균</span>
          <strong>${formatCurrency(pace.dailyVariableAverage)}</strong>
        </div>
        ${pace.isCurrent ? `
          <div class="pace-row">
            <span>이 속도면 월말 지출</span>
            <strong class="text-amber">${formatCurrency(pace.projectedExpense)}</strong>
          </div>
          <div class="pace-row">
            <span>월말 예상 잔액</span>
            <strong class="${pace.projectedBalance >= 0 ? 'text-emerald' : 'text-rose'}">
              ${formatCurrency(pace.projectedBalance)}
            </strong>
          </div>
        ` : `
          <div class="pace-row">
            <span>마감된 달</span>
            <strong>${pace.daysInMonth}일 기준</strong>
          </div>
        `}
      </div>
      <p class="pace-note">
        ${pace.isCurrent
          ? `${pace.daysInMonth}일 중 ${pace.daysElapsed}일 경과 · 남은 ${pace.daysRemaining}일<br>
             예측은 고정비 ${formatCurrency(pace.fixedAmount)}는 그대로 두고 변동비만 늘려 계산합니다.`
          : '이미 마감된 달의 실제 값입니다.'}
      </p>
    </div>
  `;

  containerEl.innerHTML = `
    <!-- Top Summary Cards -->
    <div class="summary-grid">
      <div class="card summary-card income-card">
        <div class="card-header-sm">
          <span class="card-icon">💰</span>
          <span class="card-label">총수입</span>
        </div>
        <div class="card-value">${formatCurrency(summary.totalIncome)}</div>
        <div class="card-subtext">
          ${changeText(mom.incomeChangePct, false)}
          <span class="basis-label">${esc(mom.basisLabel)}</span>
        </div>
      </div>

      <div class="card summary-card expense-card">
        <div class="card-header-sm">
          <span class="card-icon">💸</span>
          <span class="card-label">총지출</span>
        </div>
        <div class="card-value">${formatCurrency(summary.totalExpense)}</div>
        <div class="card-subtext">
          ${changeText(mom.expenseChangePct, true)}
          <span class="basis-label">${esc(mom.basisLabel)}</span>
        </div>
      </div>

      <div class="card summary-card balance-card">
        <div class="card-header-sm">
          <span class="card-icon">🏦</span>
          <span class="card-label">이번 달 잔액</span>
        </div>
        <div class="card-value ${summary.balance >= 0 ? 'text-emerald' : 'text-rose'}">
          ${formatCurrency(summary.balance)}
        </div>
        <div class="card-subtext">수입 − 지출 (이체 제외)</div>
      </div>

      <div class="card summary-card savings-card">
        <div class="card-header-sm">
          <span class="card-icon">📈</span>
          <span class="card-label">가용 잔액률</span>
        </div>
        <div class="card-value text-indigo">${formatPercent(summary.savingsRate)}</div>
        <div class="card-subtext">
          ${changeText(mom.savingsRateDiff === null ? null : mom.savingsRateDiff, false)}
          <span class="basis-label">수입 대비 남은 돈의 비율</span>
        </div>
      </div>
    </div>

    <!-- Main Dashboard Grid -->
    <div class="dashboard-main-grid">
      <div class="dash-column">
        ${settlementCard}

        <!-- Category Breakdown -->
        <div class="card dash-card">
          <div class="card-title-row">
            <h3 class="card-title">📊 이번 달 카테고리 지출</h3>
            <button class="btn-text" id="btn-go-stats">자세히 보기 &rarr;</button>
          </div>

          ${catBreakdown.categories.length === 0 ? `
            <div class="empty-state">
              <span class="empty-icon">📝</span>
              <p>이번 달 등록된 지출 거래가 없습니다.</p>
            </div>
          ` : `
            <div class="progress-list">
              ${catBreakdown.categories.map(cat => `
                <div class="progress-item">
                  <div class="progress-info">
                    <div class="cat-label">
                      <span class="cat-icon-badge">${esc(cat.icon)}</span>
                      <span class="cat-name">${esc(cat.name)}</span>
                    </div>
                    <div class="cat-amount">
                      <strong>${formatCurrency(cat.amount)}</strong>
                      <span class="cat-pct">(${cat.percentage.toFixed(1)}%)</span>
                    </div>
                  </div>
                  <div class="progress-track">
                    <div class="progress-fill" style="width: ${cat.percentage}%; background-color: ${esc(cat.color)}"></div>
                  </div>
                </div>
              `).join('')}
            </div>
          `}
        </div>

        <div class="widgets-row">
          ${paceCard}

          <div class="card widget-card">
            <h4 class="widget-title">📌 고정지출 vs 변동지출</h4>
            <div class="fixed-var-bar">
              <div class="fv-segment fv-fixed" style="width: ${fixedVar.fixedRatio}%"></div>
              <div class="fv-segment fv-variable" style="width: ${fixedVar.variableRatio}%"></div>
            </div>
            <div class="fv-legend">
              <div><span class="dot dot-fixed"></span> 고정비: ${formatCurrency(fixedVar.fixedAmount)} (${fixedVar.fixedRatio.toFixed(1)}%)</div>
              <div><span class="dot dot-variable"></span> 변동비: ${formatCurrency(fixedVar.variableAmount)} (${fixedVar.variableRatio.toFixed(1)}%)</div>
            </div>
          </div>

          <div class="card widget-card">
            <h4 class="widget-title">👥 공동 vs 개인 지출</h4>
            <div class="user-split-list">
              <div class="split-item">
                <span>👫 공동생활비</span>
                <strong>${formatCurrency(userBreakdown.sharedAmount)}</strong>
              </div>
              <div class="split-item">
                <span>👨 ${husbandName} 개인</span>
                <strong>${formatCurrency(userBreakdown.husbandPersonalAmount)}</strong>
              </div>
              <div class="split-item">
                <span>👩 ${wifeName} 개인</span>
                <strong>${formatCurrency(userBreakdown.wifePersonalAmount)}</strong>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="dash-column">
        <!-- Budget Tracker -->
        <div class="card dash-card">
          <div class="card-title-row">
            <h3 class="card-title">💰 예산 현황</h3>
            <button class="btn-text" id="btn-go-settings">예산 설정 &rarr;</button>
          </div>

          ${budgetList.length === 0 ? `
            <div class="empty-state">
              <span class="empty-icon">⚙️</span>
              <p>설정된 예산이 없습니다. [설정]에서 카테고리별 예산을 설정해보세요!</p>
            </div>
          ` : `
            <div class="budget-list">
              ${budgetList.map(b => `
                <div class="budget-item">
                  <div class="budget-header">
                    <div class="budget-title">
                      <span>${esc(b.icon)} ${esc(b.categoryName)}</span>
                      <span class="badge ${b.statusBadgeClass}">${b.statusIcon} ${esc(b.statusLabel)}</span>
                    </div>
                    <div class="budget-vals">
                      <strong>${formatCurrency(b.usedAmount)}</strong> / ${formatCurrency(b.budgetAmount)}
                    </div>
                  </div>
                  <div class="progress-track">
                    <div class="progress-fill ${b.status}" style="width: ${b.progressPct}%; background-color: ${esc(b.color)}"></div>
                  </div>
                  <div class="budget-sub-info">
                    <span>잔여: ${formatCurrency(b.remainingAmount)}</span>
                    <span>진행률: ${b.rawProgressPct.toFixed(1)}%</span>
                  </div>
                  ${b.paceMessage ? `<div class="budget-pace-note ${b.status}">${esc(b.paceMessage)}</div>` : ''}
                </div>
              `).join('')}
            </div>
          `}
        </div>

        <!-- Recent Transactions -->
        <div class="card dash-card">
          <div class="card-title-row">
            <h3 class="card-title">📑 최근 거래</h3>
            <button class="btn-text" id="btn-go-tx">전체보기 &rarr;</button>
          </div>

          ${monthTxList.length === 0 ? `
            <div class="empty-state">
              <span class="empty-icon">💸</span>
              <p>최근 거래 내역이 없습니다.</p>
            </div>
          ` : `
            <div class="recent-tx-list">
              ${monthTxList.map(t => {
                const catObj = categories.find(c => c.id === t.categoryId);
                const isIncome = t.type === 'income';
                const isTransfer = t.type === 'transfer';
                const userTag = t.userId === 'husband' ? `👨 ${husbandName}` : `👩 ${wifeName}`;
                const sharedTag = t.sharedType === 'shared' ? '공동' : '개인';

                return `
                  <div class="tx-row-item">
                    <div class="tx-left">
                      <div class="tx-cat-badge" style="background: ${catObj ? esc(catObj.color) + '20' : '#e2e8f0'}">
                        ${isTransfer ? '🔄' : (catObj ? esc(catObj.icon) : '📦')}
                      </div>
                      <div class="tx-details">
                        <div class="tx-memo">
                          ${esc(t.memo) || (catObj ? esc(catObj.name) : '거래')}
                          ${t.recurringId ? '<span class="badge badge-fixed">🔁 반복</span>' : ''}
                        </div>
                        <div class="tx-meta">
                          <span class="tx-date">${esc(t.date)}</span>
                          <span class="tx-user">${userTag} · ${sharedTag}</span>
                        </div>
                      </div>
                    </div>
                    <div class="tx-right">
                      <div class="tx-amount ${isIncome ? 'income' : (isTransfer ? 'transfer' : 'expense')}">
                        ${isIncome ? '+' : (isTransfer ? '' : '-')}${formatCurrency(t.amount)}
                      </div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          `}
        </div>
      </div>
    </div>
  `;

  const btnStats = containerEl.querySelector('#btn-go-stats');
  if (btnStats) btnStats.addEventListener('click', () => onNavigateTab('statistics'));

  const btnSettings = containerEl.querySelector('#btn-go-settings');
  if (btnSettings) btnSettings.addEventListener('click', () => onNavigateTab('settings'));

  const btnTx = containerEl.querySelector('#btn-go-tx');
  if (btnTx) btnTx.addEventListener('click', () => onNavigateTab('transactions'));
}
