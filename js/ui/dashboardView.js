/**
 * Dashboard View (Home / 메인 대시보드)
 */

import { 
  formatCurrency, 
  formatPercent, 
  calculateMonthlySummary, 
  calculateMoM, 
  getPreviousMonthStr, 
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

  const prevMonthStr = getPreviousMonthStr(currentMonthStr);
  const currentSummary = calculateMonthlySummary(transactions, currentMonthStr);
  const prevSummary = calculateMonthlySummary(transactions, prevMonthStr);
  const mom = calculateMoM(currentSummary, prevSummary);

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

  containerEl.innerHTML = `
    <!-- Top Summary Cards -->
    <div class="summary-grid">
      <div class="card summary-card income-card">
        <div class="card-header-sm">
          <span class="card-icon">💰</span>
          <span class="card-label">총수입</span>
        </div>
        <div class="card-value">${formatCurrency(currentSummary.totalIncome)}</div>
        <div class="card-subtext ${mom.incomeChangePct >= 0 ? 'text-positive' : 'text-negative'}">
          ${mom.incomeChangePct >= 0 ? '▲' : '▼'} 지난달 대비 ${Math.abs(mom.incomeChangePct).toFixed(1)}%
        </div>
      </div>

      <div class="card summary-card expense-card">
        <div class="card-header-sm">
          <span class="card-icon">💸</span>
          <span class="card-label">총지출</span>
        </div>
        <div class="card-value">${formatCurrency(currentSummary.totalExpense)}</div>
        <div class="card-subtext ${mom.expenseChangePct <= 0 ? 'text-positive' : 'text-negative'}">
          ${mom.expenseChangePct <= 0 ? '▼ 지출 절감' : '▲ 지출 증가'} ${Math.abs(mom.expenseChangePct).toFixed(1)}%
        </div>
      </div>

      <div class="card summary-card balance-card">
        <div class="card-header-sm">
          <span class="card-icon">🏦</span>
          <span class="card-label">이번 달 잔액</span>
        </div>
        <div class="card-value ${currentSummary.balance >= 0 ? 'text-emerald' : 'text-rose'}">
          ${formatCurrency(currentSummary.balance)}
        </div>
        <div class="card-subtext">수입 - 지출 잔액</div>
      </div>

      <div class="card summary-card savings-card">
        <div class="card-header-sm">
          <span class="card-icon">📈</span>
          <span class="card-label">저축률</span>
        </div>
        <div class="card-value text-indigo">${formatPercent(currentSummary.savingsRate)}</div>
        <div class="card-subtext ${mom.savingsRateDiff >= 0 ? 'text-positive' : 'text-negative'}">
          ${mom.savingsRateDiff >= 0 ? '▲' : '▼'} 지난달 대비 ${Math.abs(mom.savingsRateDiff).toFixed(1)}%p
        </div>
      </div>
    </div>

    <!-- Main Dashboard Grid (2 Columns on Desktop) -->
    <div class="dashboard-main-grid">

      <!-- Left Column: Spending Breakdown & Fixed vs Variable -->
      <div class="dash-column">
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

        <!-- Fixed vs Variable & Personal Split Widgets -->
        <div class="widgets-row">
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

      <!-- Right Column: Budget Status & Recent Transactions -->
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
                      <span class="badge ${b.statusBadgeClass}">${b.statusIcon} ${b.statusLabel}</span>
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
                </div>
              `).join('')}
            </div>
          `}
        </div>

        <!-- Recent Transactions Preview -->
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
                        <div class="tx-memo">${esc(t.memo) || (catObj ? esc(catObj.name) : '거래')}</div>
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

  // Attach Event Listeners for Quick Navigation buttons
  const btnStats = containerEl.querySelector('#btn-go-stats');
  if (btnStats) btnStats.addEventListener('click', () => onNavigateTab('statistics'));

  const btnSettings = containerEl.querySelector('#btn-go-settings');
  if (btnSettings) btnSettings.addEventListener('click', () => onNavigateTab('settings'));

  const btnTx = containerEl.querySelector('#btn-go-tx');
  if (btnTx) btnTx.addEventListener('click', () => onNavigateTab('transactions'));
}
