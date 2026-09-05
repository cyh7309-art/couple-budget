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
  const settings = StorageManager.getSharedSettings();
  const settledRecord = StorageManager.getSettlementFor(currentMonthStr);
  const pendingRecurring = StorageManager.getPendingRecurring(currentMonthStr);
  const installments = calculateInstallments(transactions, currentMonthStr);

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

  // 정산 완료로 표시한 뒤에 공동지출이 더 들어왔는지 확인
  const settledDrift = settledRecord
    ? Math.round(settlement.sharedTotal) - Math.round(settledRecord.sharedTotal || 0)
    : 0;

  const recentSettlements = StorageManager.getSettlements()
    .filter(x => x.month !== currentMonthStr)
    .slice(0, 3);

  const nameOf = (userId) => (userId === 'wife' ? `👩 ${wifeName}` : `👨 ${husbandName}`);

  const settlementCard = `
    <div class="card dash-card settlement-card">
      <div class="card-title-row">
        <h3 class="card-title">🤝 이번 달 부부 정산</h3>
        <span class="badge ${settledRecord ? 'badge-normal' : 'badge-shared'}">${esc(settlement.ratioBasis)}</span>
      </div>

      ${settlement.sharedTotal === 0 ? `
        <div class="empty-state">
          <span class="empty-icon">🤝</span>
          <p>공동생활비로 기록된 지출이 없습니다.</p>
        </div>
      ` : `
        ${settledRecord ? `
          <div class="settle-headline settled">
            ✅ <strong>${esc(currentMonthStr)} 정산 완료</strong>
            ${settledRecord.amount > 0
              ? `— ${nameOf(settledRecord.fromUserId)} → ${nameOf(settledRecord.toUserId)}
                 <strong>${formatCurrency(settledRecord.amount)}</strong>`
              : '— 정산할 금액이 없었습니다'}
            <div class="settle-meta">
              ${esc(String(settledRecord.settledAt || '').slice(0, 10))} 에 완료 표시함
            </div>
          </div>

          ${settledDrift !== 0 ? `
            <div class="settle-drift">
              ⚠️ 정산 완료 이후 공동생활비가
              <strong>${formatCurrency(Math.abs(settledDrift))}</strong>
              ${settledDrift > 0 ? '늘었습니다' : '줄었습니다'}
              (기록 당시 ${formatCurrency(settledRecord.sharedTotal)} → 현재 ${formatCurrency(settlement.sharedTotal)}).
              <br>지금 기준 정산액은
              ${settlement.settled ? '0원' : `${nameOf(settlement.fromUserId)} → ${nameOf(settlement.toUserId)} ${formatCurrency(settlement.amount)}`} 입니다.
              <button class="btn-secondary-sm" id="btn-resettle">🔄 현재 기준으로 다시 정산</button>
            </div>
          ` : ''}

          <button class="btn-text settle-undo" id="btn-unsettle">정산 완료 취소</button>
        ` : `
          <div class="settle-headline">
            ${settlement.settled
              ? '✅ 정산할 금액이 없습니다. 부담이 균형을 이루고 있어요.'
              : `<strong>${nameOf(settlement.fromUserId)}</strong> 님이
                 <strong>${nameOf(settlement.toUserId)}</strong> 님에게
                 <strong class="settle-amount">${formatCurrency(settlement.amount)}</strong> 보내면 정산 완료`}
          </div>
          <button class="btn-primary-sm settle-done-btn" id="btn-settle">✅ 정산 완료로 표시</button>
        `}

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

        ${recentSettlements.length > 0 ? `
          <div class="settle-history">
            <div class="settle-history-title">지난 정산 기록</div>
            ${recentSettlements.map(h => `
              <div class="settle-history-row">
                <span>${esc(h.month)}</span>
                <span>${h.amount > 0
                  ? `${nameOf(h.fromUserId)} → ${nameOf(h.toUserId)} ${formatCurrency(h.amount)}`
                  : '정산 없음'}</span>
              </div>
            `).join('')}
          </div>
        ` : ''}
      `}
    </div>
  `;

  const pendingCard = pendingRecurring.length === 0 ? '' : `
    <div class="card dash-card pending-card">
      <div class="card-title-row">
        <h3 class="card-title">📝 이번 달 금액 확인이 필요합니다</h3>
        <span class="badge badge-caution">${pendingRecurring.length}건</span>
      </div>
      <p class="card-desc">
        관리비처럼 매달 금액이 달라지는 항목입니다.
        확인하지 않은 금액이 장부에 들어가지 않도록 자동 생성하지 않았습니다.
      </p>

      <div class="pending-list">
        ${pendingRecurring.map(item => `
          <div class="pending-item" data-id="${esc(item.template.id)}">
            <div class="pending-info">
              <strong>${esc(item.template.name)}</strong>
              <div class="pending-meta">
                매월 ${Number(item.template.dayOfMonth) || 1}일 ·
                ${item.lastMonth
                  ? `${esc(item.lastMonth)} 실제 금액 ${formatCurrency(item.suggestedAmount)}`
                  : '이전 기록 없음'}
              </div>
            </div>
            <div class="pending-actions">
              <div class="pending-input-group">
                <input type="text" inputmode="numeric" class="form-input pending-amount"
                       data-id="${esc(item.template.id)}"
                       value="${thousands(item.suggestedAmount)}" />
                <span class="unit-text">원</span>
              </div>
              <button class="btn-primary-sm btn-confirm-rec" data-id="${esc(item.template.id)}">확정</button>
              <button class="btn-text btn-skip-rec" data-id="${esc(item.template.id)}">이번 달 없음</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  const installmentCard = installments.activePlans.length === 0 ? '' : `
    <div class="card dash-card installment-card">
      <div class="card-title-row">
        <h3 class="card-title">🧾 진행 중인 할부</h3>
        <span class="badge badge-installment">${installments.activePlans.length}건</span>
      </div>

      <div class="inst-summary">
        <div class="inst-summary-item">
          <span>이번 달 할부금</span>
          <strong class="text-rose">${formatCurrency(installments.monthlyBurden)}</strong>
        </div>
        <div class="inst-summary-item">
          <span>앞으로 남은 총액</span>
          <strong>${formatCurrency(installments.remainingTotal)}</strong>
        </div>
      </div>

      <div class="inst-list">
        ${installments.activePlans.map(p => {
          const done = p.months - p.remainingCount;
          const pct = p.months > 0 ? (done / p.months) * 100 : 0;
          const cat = categories.find(c => c.id === p.categoryId);

          return `
            <div class="inst-item">
              <div class="inst-head">
                <span class="inst-name">${cat ? esc(cat.icon) + ' ' : ''}${esc(p.name)}</span>
                <span class="inst-count">${done}/${p.months}회</span>
              </div>
              <div class="progress-track">
                <div class="progress-fill" style="width: ${pct}%; background-color: ${cat ? esc(cat.color) : '#6366f1'}"></div>
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
        ${pendingCard}
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
        ${installmentCard}

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

  /* ---------- 정산 완료 / 취소 / 재정산 ---------- */
  const doSettle = async (btn) => {
    btn.disabled = true;
    await StorageManager.markSettled(currentMonthStr, settlement);
    if (refreshApp) refreshApp();
  };

  const btnSettle = containerEl.querySelector('#btn-settle');
  if (btnSettle) btnSettle.addEventListener('click', () => doSettle(btnSettle));

  const btnResettle = containerEl.querySelector('#btn-resettle');
  if (btnResettle) btnResettle.addEventListener('click', () => doSettle(btnResettle));

  const btnUnsettle = containerEl.querySelector('#btn-unsettle');
  if (btnUnsettle) {
    btnUnsettle.addEventListener('click', async () => {
      if (!confirm(`${currentMonthStr} 정산 완료 표시를 취소하시겠습니까?`)) return;
      btnUnsettle.disabled = true;
      await StorageManager.unmarkSettled(currentMonthStr);
      if (refreshApp) refreshApp();
    });
  }

  /* ---------- 변동 반복 거래 확정 / 건너뛰기 ---------- */
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
      const id = btn.getAttribute('data-id');
      btn.disabled = true;
      await StorageManager.skipRecurring(id, currentMonthStr);
      if (refreshApp) refreshApp();
    });
  });

  // Enter 로 바로 확정
  containerEl.querySelectorAll('.pending-amount').forEach(input => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) {
        const id = input.getAttribute('data-id');
        const btn = containerEl.querySelector(`.btn-confirm-rec[data-id="${id}"]`);
        if (btn) btn.click();
      }
    });
  });
}
