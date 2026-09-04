/**
 * Goals & Accounts View (재정 목표 / 계좌 관리)
 */

import { formatCurrency, calculateAccountBalances } from '../calculations.js';
import { StorageManager } from '../storage.js';
import { esc, parseAmount, thousands } from '../utils.js';

const ACCOUNT_TYPES = [
  { value: 'bank', label: '🏦 입출금 통장' },
  { value: 'card', label: '💳 신용/체크카드' },
  { value: 'cash', label: '💵 현금' }
];

export function renderGoalsView(containerEl, refreshApp) {
  const goals = StorageManager.getGoals();
  const accounts = StorageManager.getAccounts();
  const transactions = StorageManager.getTransactions();
  const users = StorageManager.getUsers();

  const husbandName = esc(users.husband.name);
  const wifeName = esc(users.wife.name);

  // ✅ 잔액을 수동 입력값이 아니라 실제 거래로부터 계산합니다
  const balances = calculateAccountBalances(accounts, transactions);

  const ownerLabelOf = (owner) => {
    if (owner === 'husband') return `👨 ${husbandName}`;
    if (owner === 'wife') return `👩 ${wifeName}`;
    return '👫 공동';
  };

  const accountFormHtml = (acc) => `
    <div class="account-form" id="account-form" data-editing="${acc ? esc(acc.id) : ''}">
      <div class="form-row-2">
        <div class="form-group">
          <label class="form-label">계좌 이름</label>
          <input type="text" id="acc-name" class="form-input" maxlength="30"
                 placeholder="예: 공동 생활비 통장" value="${acc ? esc(acc.name) : ''}" />
        </div>
        <div class="form-group">
          <label class="form-label">은행/카드사</label>
          <input type="text" id="acc-bank" class="form-input" maxlength="20"
                 placeholder="예: 국민은행" value="${acc ? esc(acc.bankName) : ''}" />
        </div>
      </div>
      <div class="form-row-2">
        <div class="form-group">
          <label class="form-label">종류</label>
          <select id="acc-type" class="form-select">
            ${ACCOUNT_TYPES.map(t => `
              <option value="${t.value}" ${acc && acc.type === t.value ? 'selected' : ''}>${t.label}</option>
            `).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">소유</label>
          <select id="acc-owner" class="form-select">
            <option value="shared" ${!acc || acc.owner === 'shared' ? 'selected' : ''}>👫 공동</option>
            <option value="husband" ${acc && acc.owner === 'husband' ? 'selected' : ''}>👨 ${husbandName}</option>
            <option value="wife" ${acc && acc.owner === 'wife' ? 'selected' : ''}>👩 ${wifeName}</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">시작 잔액 (원)</label>
        <input type="text" inputmode="numeric" id="acc-opening" class="form-input" placeholder="0"
               value="${acc ? thousands(Number(acc.openingBalance) || 0) : ''}" />
        <p class="card-desc">이 계좌를 가계부에 등록하는 시점의 잔액입니다. 이후 잔액은 거래 내역으로 자동 계산됩니다.</p>
      </div>
      <div class="form-actions">
        <button class="btn-secondary-sm" id="acc-cancel">취소</button>
        <button class="btn-primary-sm" id="acc-save">${acc ? '수정 저장' : '계좌 추가'}</button>
      </div>
    </div>
  `;

  function render(editingAccountId = null, showForm = false) {
    const editing = editingAccountId ? accounts.find(a => a.id === editingAccountId) : null;

    containerEl.innerHTML = `
      <!-- Accounts -->
      <div class="card goals-accounts-card">
        <div class="card-title-row">
          <h3 class="card-title">🏦 부부 자산 및 계좌 현황</h3>
          <button class="btn-primary-sm" id="btn-add-account">+ 계좌 추가</button>
        </div>

        ${showForm ? accountFormHtml(editing) : ''}

        ${accounts.length === 0 ? `
          <div class="empty-state">
            <span class="empty-icon">🏦</span>
            <p>등록된 계좌가 없습니다.</p>
            <p class="text-muted" style="font-size:0.85rem">
              계좌를 등록하면 거래를 입력할 때 계좌를 지정할 수 있고, 잔액이 자동으로 계산됩니다.
            </p>
          </div>
        ` : `
          <div class="accounts-grid">
            ${balances.accounts.map(acc => {
              const isCard = acc.type === 'card';
              const negative = acc.computedBalance < 0;
              const delta = acc.computedBalance - acc.openingBalance;

              return `
                <div class="account-item-card">
                  <div class="acc-top">
                    <span class="acc-bank-badge">${esc(acc.bankName) || '기타'}</span>
                    <span class="acc-owner">${ownerLabelOf(acc.owner)}</span>
                  </div>
                  <div class="acc-name">${esc(acc.name)}</div>
                  <div class="acc-balance ${negative ? 'text-rose' : 'text-emerald'}">
                    ${formatCurrency(acc.computedBalance)}
                  </div>
                  <div class="acc-sub">
                    시작 ${formatCurrency(acc.openingBalance)}
                    ${delta !== 0 ? `<span class="${delta > 0 ? 'text-positive' : 'text-negative'}">
                      ${delta > 0 ? '+' : ''}${formatCurrency(delta)}</span>` : ''}
                    · 거래 ${acc.txCount}건
                    ${isCard ? '<span class="badge badge-variable">카드</span>' : ''}
                  </div>
                  <div class="acc-actions">
                    <button class="btn-icon btn-edit-acc" data-id="${esc(acc.id)}" title="수정">✏️</button>
                    <button class="btn-icon btn-del-acc" data-id="${esc(acc.id)}" title="삭제">🗑️</button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>

          <div class="total-asset-row">
            <span>순자산 (자산 ${formatCurrency(balances.assetTotal)} · 부채 ${formatCurrency(balances.debtTotal)})</span>
            <strong class="total-asset-val ${balances.totalBalance < 0 ? 'text-rose' : ''}">
              ${formatCurrency(balances.totalBalance)}
            </strong>
          </div>

          ${balances.hasUnassigned ? `
            <p class="card-desc warn-note">
              ⚠️ 계좌가 지정되지 않은 거래가 있어 잔액에 반영되지 않았습니다
              (지출 ${formatCurrency(balances.unassignedExpense)} · 수입 ${formatCurrency(balances.unassignedIncome)}).
              거래를 수정해 계좌를 지정하면 잔액이 정확해집니다.
            </p>
          ` : ''}
        `}
      </div>

      <!-- Goals -->
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
              const monthsLeft = monthsUntil(g.targetDate);
              const perMonth = (monthsLeft && monthsLeft > 0) ? remaining / monthsLeft : null;

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
                    <span class="g-pct-text">
                      달성률 ${pct.toFixed(1)}% · 남은 금액 ${formatCurrency(remaining)}
                      ${perMonth !== null ? `<br>목표일까지 월 ${formatCurrency(perMonth)} 저축 필요` : ''}
                    </span>
                    <button class="btn-secondary-sm btn-update-goal-amt" data-id="${esc(g.id)}">금액 적립/수정</button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>
    `;

    bindEvents(showForm, editingAccountId);
  }

  function bindEvents(showForm, editingAccountId) {
    containerEl.querySelector('#btn-add-account').addEventListener('click', () => render(null, true));

    containerEl.querySelectorAll('.btn-edit-acc').forEach(btn => {
      btn.addEventListener('click', () => render(btn.getAttribute('data-id'), true));
    });

    containerEl.querySelectorAll('.btn-del-acc').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const acc = accounts.find(a => a.id === id);
        if (!acc) return;

        const linked = transactions.filter(t =>
          t.accountId === id || t.fromAccountId === id || t.toAccountId === id).length;
        const msg = linked > 0
          ? `[${acc.name}] 을(를) 삭제합니다.\n이 계좌를 사용하는 거래 ${linked}건은 삭제되지 않지만 계좌 연결이 끊어집니다.\n\n계속할까요?`
          : `[${acc.name}] 을(를) 삭제하시겠습니까?`;
        if (!confirm(msg)) return;

        await StorageManager.deleteAccount(id);
        refreshApp();
      });
    });

    if (showForm) {
      const form = containerEl.querySelector('#account-form');
      form.querySelector('#acc-cancel').addEventListener('click', () => render(null, false));
      form.querySelector('#acc-save').addEventListener('click', async () => {
        const name = form.querySelector('#acc-name').value.trim();
        if (!name) { alert('계좌 이름을 입력해주세요.'); return; }

        const opening = parseAmount(form.querySelector('#acc-opening').value) ?? 0;
        const payload = {
          name,
          bankName: form.querySelector('#acc-bank').value.trim(),
          type: form.querySelector('#acc-type').value,
          owner: form.querySelector('#acc-owner').value,
          openingBalance: opening
        };

        const list = StorageManager.getAccounts();
        if (editingAccountId) {
          const idx = list.findIndex(a => a.id === editingAccountId);
          if (idx !== -1) list[idx] = { ...list[idx], ...payload };
        } else {
          list.push({ id: 'acc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), ...payload });
        }

        await StorageManager.saveAccounts(list);
        refreshApp();
      });
    }

    const btnAddGoal = containerEl.querySelector('#btn-add-goal');
    btnAddGoal.addEventListener('click', async () => {
      const name = prompt('새 목표 명칭을 입력하세요 (예: 🚗 새 차 구입 펀드):');
      if (!name || !name.trim()) return;

      const targetStr = prompt('목표 금액(원)을 입력하세요:', '5000000');
      if (targetStr === null) return;
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
        if (val === null || val < 0) { alert('숫자를 올바르게 입력해주세요.'); return; }

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

  render(null, false);
}

/** 오늘부터 목표일까지 남은 개월 수 (반올림, 최소 0) */
function monthsUntil(targetDate) {
  if (!targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) return null;
  const now = new Date();
  const target = new Date(targetDate + 'T00:00:00');
  const months = (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth());
  return months > 0 ? months : null;
}
