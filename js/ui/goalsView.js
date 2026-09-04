/**
 * Goals & Accounts View (재정 목표 / 계좌 관리)
 */

import { formatCurrency } from '../calculations.js';
import { StorageManager } from '../storage.js';

export function renderGoalsView(containerEl, refreshApp) {
  const goals = StorageManager.getGoals();
  const accounts = StorageManager.getAccounts();
  const users = StorageManager.getUsers();

  const husbandName = users.husband ? users.husband.name : '남편';
  const wifeName = users.wife ? users.wife.name : '아내';

  let totalBankBalance = 0;
  accounts.forEach(a => {
    totalBankBalance += Number(a.balance || 0);
  });

  containerEl.innerHTML = `
    <!-- Top Accounts Summary -->
    <div class="card goals-accounts-card">
      <div class="card-title-row">
        <h3 class="card-title">🏦 부부 자산 및 계좌 현황</h3>
        <span class="badge badge-normal">총 ${accounts.length}개 계좌/카드</span>
      </div>

      <div class="accounts-grid">
        ${accounts.map(acc => {
          let ownerLabel = '👫 공동';
          if (acc.owner === 'husband') ownerLabel = `👨 ${husbandName}`;
          if (acc.owner === 'wife') ownerLabel = `👩 ${wifeName}`;

          const isCard = acc.type === 'card';

          return `
            <div class="account-item-card">
              <div class="acc-top">
                <span class="acc-bank-badge">${acc.bankName}</span>
                <span class="acc-owner">${ownerLabel}</span>
              </div>
              <div class="acc-name">${acc.name}</div>
              <div class="acc-balance ${isCard ? 'text-rose' : 'text-emerald'}">
                ${formatCurrency(acc.balance)}
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <div class="total-asset-row">
        <span>합산 금융 잔액:</span>
        <strong class="total-asset-val">${formatCurrency(totalBankBalance)}</strong>
      </div>
    </div>

    <!-- Financial Goals Section -->
    <div class="card goals-main-card margin-top">
      <div class="card-title-row">
        <h3 class="card-title">🎯 부부 재정 목표 (Goals)</h3>
        <button class="btn-primary-sm" id="btn-add-goal">+ 새 목표 추가</button>
      </div>

      <div class="goals-grid">
        ${goals.map(g => {
          const pct = Math.min((g.currentAmount / g.targetAmount) * 100, 100);

          return `
            <div class="goal-card" style="border-top: 4px solid ${g.color}">
              <div class="goal-header">
                <span class="goal-icon">${g.icon}</span>
                <div class="goal-info">
                  <h4 class="goal-name">${g.name}</h4>
                  <div class="goal-date">목표일: ${g.targetDate}</div>
                </div>
              </div>

              <div class="goal-amounts">
                <div class="g-curr">${formatCurrency(g.currentAmount)}</div>
                <div class="g-target">목표: ${formatCurrency(g.targetAmount)}</div>
              </div>

              <div class="progress-track">
                <div class="progress-fill" style="width: ${pct}%; background-color: ${g.color}"></div>
              </div>

              <div class="goal-footer">
                <span class="g-pct-text">달성률 ${pct.toFixed(1)}%</span>
                <button class="btn-secondary-sm btn-update-goal-amt" data-id="${g.id}">금액 적립/수정</button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;

  // Bind Goal Add / Update buttons
  const btnAddGoal = containerEl.querySelector('#btn-add-goal');
  if (btnAddGoal) {
    btnAddGoal.addEventListener('click', () => {
      const name = prompt('새 목표 명칭을 입력하세요 (예: 🚗 새 차 구입 펀드):');
      if (!name) return;
      const targetStr = prompt('목표 금액(원)을 입력하세요:', '5000000');
      if (!targetStr || isNaN(targetStr)) return;

      const newGoal = {
        id: 'g_' + Date.now(),
        name,
        targetAmount: Number(targetStr),
        currentAmount: 0,
        targetDate: '2027-12-31',
        icon: '🎯',
        color: '#6366f1'
      };

      const existingGoals = StorageManager.getGoals();
      existingGoals.push(newGoal);
      StorageManager.saveGoals(existingGoals);
      refreshApp();
    });
  }

  containerEl.querySelectorAll('.btn-update-goal-amt').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const existingGoals = StorageManager.getGoals();
      const goal = existingGoals.find(g => g.id === id);
      if (!goal) return;

      const valStr = prompt(`[${goal.name}] 현재 적립 완료 금액(원)을 입력하세요:`, goal.currentAmount);
      if (valStr !== null && !isNaN(valStr)) {
        goal.currentAmount = Number(valStr);
        StorageManager.saveGoals(existingGoals);
        refreshApp();
      }
    });
  });
}
