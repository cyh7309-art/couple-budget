/**
 * Transactions View (거래 목록 & 필터 / 수정 / 삭제)
 */

import { formatCurrency } from '../calculations.js';
import { StorageManager } from '../storage.js';
import { esc } from '../utils.js';

/**
 * ✅ 필터 상태를 모듈 스코프에 보관합니다.
 *    (기존에는 재렌더 때마다 검색어/필터가 초기화되어, 삭제 한 건만 해도
 *     보고 있던 조건이 통째로 날아갔습니다)
 */
const filterState = {
  type: 'all',
  shared: 'all',
  user: 'all',
  category: 'all',
  search: ''
};

export function resetTransactionFilters() {
  filterState.type = 'all';
  filterState.shared = 'all';
  filterState.user = 'all';
  filterState.category = 'all';
  filterState.search = '';
}

export function renderTransactionsView(containerEl, currentMonthStr, openEditModal, refreshApp) {
  const transactions = StorageManager.getTransactions();
  const categories = StorageManager.getCategories();
  const users = StorageManager.getUsers();
  const accounts = StorageManager.getAccounts();
  const accountName = (id) => {
    const a = accounts.find(x => x.id === id);
    return a ? a.name : '';
  };

  const husbandName = users.husband.name;
  const wifeName = users.wife.name;

  // 삭제된 카테고리가 필터에 남아 있으면 초기화
  if (filterState.category !== 'all' && !categories.some(c => c.id === filterState.category)) {
    filterState.category = 'all';
  }

  function renderList() {
    let filtered = transactions.filter(t => t.date && t.date.startsWith(currentMonthStr));

    if (filterState.type !== 'all') filtered = filtered.filter(t => t.type === filterState.type);
    if (filterState.shared !== 'all') filtered = filtered.filter(t => t.sharedType === filterState.shared);
    if (filterState.user !== 'all') filtered = filtered.filter(t => t.userId === filterState.user);
    if (filterState.category !== 'all') filtered = filtered.filter(t => t.categoryId === filterState.category);

    if (filterState.search.trim() !== '') {
      const q = filterState.search.toLowerCase();
      filtered = filtered.filter(t => {
        const memoMatch = t.memo && t.memo.toLowerCase().includes(q);
        const cat = categories.find(c => c.id === t.categoryId);
        const catMatch = cat && cat.name.toLowerCase().includes(q);
        return memoMatch || catMatch;
      });
    }

    filtered.sort((a, b) => String(b.date).localeCompare(String(a.date)));

    const groups = {};
    filtered.forEach(t => {
      if (!groups[t.date]) groups[t.date] = [];
      groups[t.date].push(t);
    });
    const dateKeys = Object.keys(groups).sort((a, b) => b.localeCompare(a));

    const listContainer = containerEl.querySelector('#tx-list-container');
    const countBadge = containerEl.querySelector('#tx-count-badge');
    if (countBadge) countBadge.textContent = `${filtered.length}건`;

    if (dateKeys.length === 0) {
      listContainer.innerHTML = `
        <div class="empty-state card">
          <span class="empty-icon">🔍</span>
          <p>조건에 맞는 거래 내역이 없습니다.</p>
        </div>
      `;
      return;
    }

    listContainer.innerHTML = dateKeys.map(dateStr => {
      const dayTx = groups[dateStr];
      let dayIncomeTotal = 0;
      let dayExpenseTotal = 0;

      dayTx.forEach(t => {
        if (t.type === 'income') dayIncomeTotal += Number(t.amount || 0);
        if (t.type === 'expense') dayExpenseTotal += Number(t.amount || 0);
      });

      return `
        <div class="tx-date-group">
          <div class="tx-date-header">
            <span class="date-title">${esc(dateStr)}</span>
            <div class="date-totals">
              ${dayIncomeTotal > 0 ? `<span class="inc-sum">+${formatCurrency(dayIncomeTotal)}</span>` : ''}
              ${dayExpenseTotal > 0 ? `<span class="exp-sum">-${formatCurrency(dayExpenseTotal)}</span>` : ''}
            </div>
          </div>
          <div class="tx-cards-list">
            ${dayTx.map(t => {
              const catObj = categories.find(c => c.id === t.categoryId);
              const isIncome = t.type === 'income';
              const isTransfer = t.type === 'transfer';
              const userTag = t.userId === 'husband' ? esc(husbandName) : esc(wifeName);

              let sharedBadgeText = '공동';
              let sharedBadgeClass = 'badge-shared';
              if (t.sharedType === 'husband') {
                sharedBadgeText = `${esc(husbandName)} 개인`;
                sharedBadgeClass = 'badge-husband';
              } else if (t.sharedType === 'wife') {
                sharedBadgeText = `${esc(wifeName)} 개인`;
                sharedBadgeClass = 'badge-wife';
              }

              const catColor = catObj ? esc(catObj.color) : '#334155';
              const catBg = catObj ? esc(catObj.color) + '20' : '#e2e8f0';

              return `
                <div class="card tx-item-card" data-id="${esc(t.id)}">
                  <div class="tx-main">
                    <div class="tx-cat-icon" style="background: ${catBg}; color: ${catColor}">
                      ${isTransfer ? '🔄' : (catObj ? esc(catObj.icon) : '📦')}
                    </div>
                    <div class="tx-info-content">
                      <div class="tx-title-row">
                        <span class="tx-name">${esc(t.memo) || (catObj ? esc(catObj.name) : '거래')}</span>
                        <div class="tx-badges">
                          <span class="badge ${sharedBadgeClass}">${sharedBadgeText}</span>
                          ${t.recurringId ? '<span class="badge badge-fixed">반복</span>' : ''}
                          ${t.autoGenerated ? '<span class="badge badge-shared">자동 카드결제</span>' : ''}
                          ${t.installmentId
                            ? `<span class="badge badge-installment" title="원금 ${Number(t.installmentPrincipal || 0).toLocaleString('ko-KR')}원">할부 ${t.installmentSeq}/${t.installmentMonths}</span>`
                            : ''}
                          ${t.type === 'expense' ? `
                            <span class="badge ${t.isFixed ? 'badge-fixed' : 'badge-variable'}">
                              ${t.isFixed ? '고정비' : '변동비'}
                            </span>
                          ` : ''}
                        </div>
                      </div>
                      <div class="tx-sub-row">
                        <span>${userTag}</span>
                        <span>·</span>
                        <span>${catObj ? esc(catObj.name) : (isTransfer ? '계좌이체' : '미분류')}</span>
                        ${t.paymentMethod ? `<span>·</span><span>💳 ${t.paymentMethod === 'card' ? '카드' : (t.paymentMethod === 'bank' ? '계좌' : '현금')}</span>` : ''}
                        ${isTransfer && (t.fromAccountId || t.toAccountId)
                          ? `<span>·</span><span>🏦 ${esc(accountName(t.fromAccountId)) || '?'} → ${esc(accountName(t.toAccountId)) || '?'}</span>`
                          : (t.accountId && accountName(t.accountId) ? `<span>·</span><span>🏦 ${esc(accountName(t.accountId))}</span>` : '')}
                      </div>
                    </div>
                    <div class="tx-amount-col">
                      <div class="tx-amount-text ${isIncome ? 'income' : (isTransfer ? 'transfer' : 'expense')}">
                        ${isIncome ? '+' : (isTransfer ? '' : '-')}${formatCurrency(t.amount)}
                      </div>
                      <div class="tx-actions">
                        <button class="btn-icon btn-edit-tx" data-id="${esc(t.id)}" title="수정">✏️</button>
                        <button class="btn-icon btn-del-tx" data-id="${esc(t.id)}" title="삭제">🗑️</button>
                      </div>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }).join('');

    listContainer.querySelectorAll('.btn-edit-tx').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openEditModal(btn.getAttribute('data-id'));
      });
    });

    listContainer.querySelectorAll('.btn-del-tx').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        const tx = transactions.find(t => t.id === id);

        // 할부는 "이 회차만" 지우면 나머지가 남아 헷갈리므로 전체 삭제를 먼저 제안합니다
        if (tx && tx.installmentId) {
          const siblings = transactions.filter(t => t.installmentId === tx.installmentId);
          const wholePlan = confirm(
            `이 거래는 할부 ${tx.installmentSeq}/${tx.installmentMonths} 회차입니다.\n\n` +
            `[확인] 할부 전체 ${siblings.length}건을 삭제\n` +
            `[취소] 이 회차만 삭제할지 다시 물어봅니다`
          );

          btn.disabled = true;
          if (wholePlan) {
            const n = await StorageManager.deleteInstallment(tx.installmentId);
            alert(`할부 ${n}건을 삭제했습니다.`);
          } else if (confirm(`${tx.installmentSeq}회차 한 건만 삭제할까요?\n(나머지 회차는 그대로 남습니다)`)) {
            await StorageManager.deleteTransaction(id);
          } else {
            btn.disabled = false;
            return;
          }
          refreshApp();
          return;
        }

        if (!confirm('이 거래 항목을 정말로 삭제하시겠습니까?')) return;
        btn.disabled = true;
        await StorageManager.deleteTransaction(id);
        refreshApp();
      });
    });
  }

  const selected = (val, current) => (val === current ? 'selected' : '');

  containerEl.innerHTML = `
    <div class="card filter-bar-card">
      <div class="filter-header">
        <h3 class="filter-title">검색 &amp; 필터</h3>
        <div class="filter-header-right">
          <span class="badge badge-normal" id="tx-count-badge">0건</span>
          <button class="btn-text" id="btn-reset-filters">필터 초기화</button>
        </div>
      </div>

      <div class="filter-inputs-grid">
        <div class="filter-group filter-search">
          <input type="text" id="input-search" class="form-input" placeholder="메모 또는 카테고리 검색..." value="${esc(filterState.search)}" />
        </div>

        <div class="filter-group">
          <select id="select-type" class="form-select">
            <option value="all" ${selected('all', filterState.type)}>모든 거래 유형</option>
            <option value="expense" ${selected('expense', filterState.type)}>지출</option>
            <option value="income" ${selected('income', filterState.type)}>수입</option>
            <option value="transfer" ${selected('transfer', filterState.type)}>이체</option>
          </select>
        </div>

        <div class="filter-group">
          <select id="select-shared" class="form-select">
            <option value="all" ${selected('all', filterState.shared)}>모든 구분 (공동/개인)</option>
            <option value="shared" ${selected('shared', filterState.shared)}>공동생활비</option>
            <option value="husband" ${selected('husband', filterState.shared)}>👨 ${esc(husbandName)} 개인</option>
            <option value="wife" ${selected('wife', filterState.shared)}>👩 ${esc(wifeName)} 개인</option>
          </select>
        </div>

        <div class="filter-group">
          <select id="select-user" class="form-select">
            <option value="all" ${selected('all', filterState.user)}>모든 작성자</option>
            <option value="husband" ${selected('husband', filterState.user)}>👨 ${esc(husbandName)}</option>
            <option value="wife" ${selected('wife', filterState.user)}>👩 ${esc(wifeName)}</option>
          </select>
        </div>

        <div class="filter-group">
          <select id="select-category" class="form-select">
            <option value="all" ${selected('all', filterState.category)}>모든 카테고리</option>
            ${categories.map(c => `<option value="${esc(c.id)}" ${selected(c.id, filterState.category)}>${esc(c.icon)} ${esc(c.name)}</option>`).join('')}
          </select>
        </div>
      </div>
    </div>

    <div id="tx-list-container"></div>
  `;

  const inputSearch = containerEl.querySelector('#input-search');
  inputSearch.addEventListener('input', (e) => {
    filterState.search = e.target.value;
    renderList();
  });

  containerEl.querySelector('#select-type').addEventListener('change', (e) => {
    filterState.type = e.target.value; renderList();
  });
  containerEl.querySelector('#select-shared').addEventListener('change', (e) => {
    filterState.shared = e.target.value; renderList();
  });
  containerEl.querySelector('#select-user').addEventListener('change', (e) => {
    filterState.user = e.target.value; renderList();
  });
  containerEl.querySelector('#select-category').addEventListener('change', (e) => {
    filterState.category = e.target.value; renderList();
  });

  containerEl.querySelector('#btn-reset-filters').addEventListener('click', () => {
    resetTransactionFilters();
    refreshApp();
  });

  renderList();
}
