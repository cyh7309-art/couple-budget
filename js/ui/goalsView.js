/**
 * Goals & Accounts View (재정 목표 / 계좌 관리)
 */

import { formatCurrency } from '../calculations.js';
import { StorageManager } from '../storage.js';
import { esc, parseAmount, thousands } from '../utils.js';

export function renderGoalsView(containerEl, refreshApp) {
  const goals = StorageManager.getGoals();
  const accounts = StorageManager.getAccounts();
  const users = StorageManager.getUsers();

  const husbandName = esc(users.husband.name);
  const wifeName = esc(users.wife.name);

  const totalBankBalance = accounts.reduce((sum, a) => sum + Number(a.balance || 0), 0);

  const accountsSection = accounts.length === 0 ? `
    <div class="card goals-accounts-card">
      <div class="card-title-row">
        <h3 class="card-title">🏦 부부 자산 및 계좌 현황</h3>
      </div>
      <div class="empty-state">
        <span class="empty-icon">🏦</span>
        <p>등록된 계좌가 없습니다.</p>
        <p class="text-muted" style="font-size:0.85rem">
          ⚠️ 계좌 잔액은 아직 거래 내역과 자동 연동되지 않습니다.
          연동 기능이 준비되기 전까지는 실제 잔액과 다를 수 있어 표시하지 않습니다.
        </p>
      </div>
    </div>
  ` : `
    <div class="card goals-accounts-card">
      <div class="card-title-row">
        <h3 class="card-title">🏦 부부 자산 및 계좌 현황</h3>
        <span class="badge badge-normal">총 ${accounts.length}개 계좌/카드</span>
      </div>

      <p class="card-desc">⚠️ 아래 잔액은 수동 입력값이며 거래 내역과 자동 연동되지 않습니다.</p>

      <div class="accounts-grid">
        ${accounts.map(acc => {
          let ownerLabel = '👫 공동';
          if (acc.owner === 'husband') ownerLabel = `👨 ${husbandName}`;
          if (acc.owner === 'wife') ownerLabel = `👩 ${wifeName}`;
          const isCard = acc.type === 'card';

          return `
            <div class="account-item-card">
              <div class="acc-top">
                <span class="acc-bank-badge">${esc(acc.bankName)}</span>
                <span class="acc-owner">${ownerLabel}</span>
              </div>
              <div class="acc-name">${esc(acc.name)}</div>
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
  `;

  containerEl.innerHTML = `
    ${accountsSection}

    <div class="card goals-main-card margin-top">
      <div class="card-title-row">
        <h3 class="card-title">🎯 부부 재정 목표 (Goals)</h3>
        <button class="btn-primary-sm" id="btn-add-goal">+ 새 목표 추가</button>
      </div>

      ${goals.length === 0 ? `
        <div class="empty-state">
          <span class="empty-icon">🎯</span>
          <p>아직 등록된 목표가 없습니다. 첫 목표를 만들어보세요!</p>
        </div>
      ` : `
        <div class="goals-grid">
          ${goals.map(g => {
            const target = Number(g.targetAmount) || 0;
            const current = Number(g.currentAmount) || 0;
            const pct = target > 0 ? Math.min((current / target) * 100, 100) : 0;
            const remaining = Math.max(target - current, 0);

            return `
              <div class="goal-card" style="border-top: 4px solid ${esc(g.color) || '#6366f1'}">
                <div class="goal-header">
                  <span class="goal-icon">${esc(g.icon)}</span>
                  <div class="goal-info">
                    <h4 class="goal-name">${esc(g.name)}</h4>
                    <div class="goal-date">목표일: ${esc(g.targetDate) || '미정'}</div>
                  </div>
                  <button class="btn-icon btn-del-goal" data-id="${esc(g.id)}" title="목표 삭제">🗑️</button>
                </div>

                <div class="goal-amounts">
                  <div class="g-curr">${formatCurrency(current)}</div>
                  <div class="g-target">목표: ${formatCurrency(target)}</div>
                </div>

                <div class="progress-track">
                  <div class="progress-fill" style="width: ${pct}%; background-color: ${esc(g.color) || '#6366f1'}"></div>
                </div>

                <div class="goal-footer">
                  <span class="g-pct-text">달성률 ${pct.toFixed(1)}% · 남은 금액 ${formatCurrency(remaining)}</span>
                  <button class="btn-secondary-sm btn-update-goal-amt" data-id="${esc(g.id)}">금액 적립/수정</button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `}
    </div>
  `;

  const btnAddGoal = containerEl.querySelector('#btn-add-goal');
  if (btnAddGoal) {
    btnAddGoal.addEventListener('click', async () => {
      const name = prompt('새 목표 명칭을 입력하세요 (예: 🚗 새 차 구입 펀드):');
      if (!name || !name.trim()) return;

      const targetStr = prompt('목표 금액(원)을 입력하세요:', '5000000');
      if (targetStr === null) return;

      // ✅ '5,000,000' 처럼 쉼표가 들어와도 정상 처리, 0/빈값은 거부
      const targetAmount = parseAmount(targetStr);
      if (targetAmount === null || targetAmount <= 0) {
        alert('목표 금액을 0원보다 큰 숫자로 입력해주세요.');
        return;
      }

      const dateStr = prompt('목표 달성 예정일 (YYYY-MM-DD):', '2027-12-31');
      const targetDate = (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) ? dateStr.trim() : '';

      const goalsNow = StorageManager.getGoals();
      goalsNow.push({
        id: 'g_' + Date.now(),
        name: name.trim(),
        targetAmount,
        currentAmount: 0,
        targetDate,
        icon: '🎯',
        color: '#6366f1'
      });

      await StorageManager.saveGoals(goalsNow);
      refreshApp();
    });
  }

  containerEl.querySelectorAll('.btn-update-goal-amt').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      const goalsNow = StorageManager.getGoals();
      const goal = goalsNow.find(g => g.id === id);
      if (!goal) return;

      const valStr = prompt(
        `[${goal.name}] 현재 적립 완료 금액(원)을 입력하세요:`,
        thousands(Number(goal.currentAmount) || 0)
      );
      if (valStr === null) return;

      const val = parseAmount(valStr);
      if (val === null || val < 0) {
        alert('숫자를 올바르게 입력해주세요.');
        return;
      }

      goal.currentAmount = val;
      await StorageManager.saveGoals(goalsNow);
      refreshApp();
    });
  });

  containerEl.querySelectorAll('.btn-del-goal').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      const goal = StorageManager.getGoals().find(g => g.id === id);
      if (!goal) return;
      if (!confirm(`[${goal.name}] 목표를 삭제하시겠습니까?`)) return;

      await StorageManager.deleteGoal(id);
      refreshApp();
    });
  });
}
