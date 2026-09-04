/**
 * Transactions View (거래 목록 & 필터 / 수정 / 삭제)
 */

import { formatCurrency } from '../calculations.js';
import { StorageManager } from '../storage.js';

export function renderTransactionsView(containerEl, currentMonthStr, openEditModal, refreshApp) {
  const transactions = StorageManager.getTransactions();
  const categories = StorageManager.getCategories();
  const users = StorageManager.getUsers();

  const husbandName = users.husband ? users.husband.name : '남편';
  const wifeName = users.wife ? users.wife.name : '아내';

  // State variables for filter
  let filterType = 'all';
  let filterShared = 'all';
  let filterUser = 'all';
  let filterCategory = 'all';
  let searchQuery = '';

  function renderList() {
    // 1. Filter by current month
    let filtered = transactions.filter(t => t.date && t.date.startsWith(currentMonthStr));

    // 2. Filter by Type
    if (filterType !== 'all') {
      filtered = filtered.filter(t => t.type === filterType);
    }

    // 3. Filter by Shared
    if (filterShared !== 'all') {
      filtered = filtered.filter(t => t.sharedType === filterShared);
    }

    // 4. Filter by User
    if (filterUser !== 'all') {
      filtered = filtered.filter(t => t.userId === filterUser);
    }

    // 5. Filter by Category
    if (filterCategory !== 'all') {
      filtered = filtered.filter(t => t.categoryId === filterCategory);
    }

    // 6. Search Query
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(t => {
        const memoMatch = t.memo && t.memo.toLowerCase().includes(q);
        const cat = categories.find(c => c.id === t.categoryId);
        const catMatch = cat && cat.name.toLowerCase().includes(q);
        return memoMatch || catMatch;
      });
    }

    // Sort by date descending
    filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Group by Date
    const groups = {};
    filtered.forEach(t => {
      if (!groups[t.date]) groups[t.date] = [];
      groups[t.date].push(t);
    });

    const dateKeys = Object.keys(groups).sort((a, b) => new Date(b) - new Date(a));

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
            <span class="date-title">📅 ${dateStr}</span>
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
              const userTag = t.userId === 'husband' ? `👨 ${husbandName}` : `👩 ${wifeName}`;
              
              let sharedBadgeText = '👫 공동';
              let sharedBadgeClass = 'badge-shared';
              if (t.sharedType === 'husband') {
                sharedBadgeText = `👨 ${husbandName} 개인`;
                sharedBadgeClass = 'badge-husband';
              } else if (t.sharedType === 'wife') {
                sharedBadgeText = `👩 ${wifeName} 개인`;
                sharedBadgeClass = 'badge-wife';
              }

              return `
                <div class="card tx-item-card" data-id="${t.id}">
                  <div class="tx-main">
                    <div class="tx-cat-icon" style="background: ${catObj ? catObj.color + '20' : '#e2e8f0'}; color: ${catObj ? catObj.color : '#334155'}">
                      ${isTransfer ? '🔄' : (catObj ? catObj.icon : '📦')}
                    </div>
                    <div class="tx-info-content">
                      <div class="tx-title-row">
                        <span class="tx-name">${t.memo || (catObj ? catObj.name : '거래')}</span>
                        <div class="tx-badges">
                          <span class="badge ${sharedBadgeClass}">${sharedBadgeText}</span>
                          ${t.type === 'expense' ? `
                            <span class="badge ${t.isFixed ? 'badge-fixed' : 'badge-variable'}">
                              ${t.isFixed ? '📌 고정비' : '🌊 변동비'}
                            </span>
                          ` : ''}
                        </div>
                      </div>
                      <div class="tx-sub-row">
                        <span>${userTag}</span>
                        <span>·</span>
                        <span>${catObj ? catObj.name : (isTransfer ? '계좌이체' : '기타')}</span>
                        ${t.paymentMethod ? `<span>·</span><span>💳 ${t.paymentMethod === 'card' ? '카드' : (t.paymentMethod === 'bank' ? '계좌' : '현금')}</span>` : ''}
                      </div>
                    </div>
                    <div class="tx-amount-col">
                      <div class="tx-amount-text ${isIncome ? 'income' : (isTransfer ? 'transfer' : 'expense')}">
                        ${isIncome ? '+' : (isTransfer ? '' : '-')}${formatCurrency(t.amount)}
                      </div>
                      <div class="tx-actions">
                        <button class="btn-icon btn-edit-tx" data-id="${t.id}" title="수정">✏️</button>
                        <button class="btn-icon btn-del-tx" data-id="${t.id}" title="삭제">🗑️</button>
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

    // Attach Event Listeners for Edit & Delete buttons
    listContainer.querySelectorAll('.btn-edit-tx').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        openEditModal(id);
      });
    });

    listContainer.querySelectorAll('.btn-del-tx').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        if (confirm('이 거래 항목을 정말로 삭제하시겠습니까?')) {
          await StorageManager.deleteTransaction(id);
          refreshApp();
        }
      });
    });
  }

  // Render Shell Controls
  containerEl.innerHTML = `
    <div class="card filter-bar-card">
      <div class="filter-header">
        <h3 class="filter-title">🔎 거래 내역 검색 & 필터</h3>
        <span class="badge badge-normal" id="tx-count-badge">0건</span>
      </div>

      <div class="filter-inputs-grid">
        <!-- Search Input -->
        <div class="filter-group filter-search">
          <input type="text" id="input-search" class="form-input" placeholder="메모 또는 카테고리 검색..." />
        </div>

        <!-- Type Filter -->
        <div class="filter-group">
          <select id="select-type" class="form-select">
            <option value="all">모든 거래 유형</option>
            <option value="expense">💸 지출</option>
            <option value="income">💰 수입</option>
            <option value="transfer">🔄 이체</option>
          </select>
        </div>

        <!-- Shared Filter -->
        <div class="filter-group">
          <select id="select-shared" class="form-select">
            <option value="all">모든 구분 (공동/개인)</option>
            <option value="shared">👫 공동생활비</option>
            <option value="husband">👨 ${husbandName} 개인</option>
            <option value="wife">👩 ${wifeName} 개인</option>
          </select>
        </div>

        <!-- User Filter -->
        <div class="filter-group">
          <select id="select-user" class="form-select">
            <option value="all">모든 작성자</option>
            <option value="husband">👨 ${husbandName}</option>
            <option value="wife">👩 ${wifeName}</option>
          </select>
        </div>

        <!-- Category Filter -->
        <div class="filter-group">
          <select id="select-category" class="form-select">
            <option value="all">모든 카테고리</option>
            ${categories.map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('')}
          </select>
        </div>
      </div>
    </div>

    <!-- Transactions List Container -->
    <div id="tx-list-container"></div>
  `;

  // Bind filter input events
  const inputSearch = containerEl.querySelector('#input-search');
  const selectType = containerEl.querySelector('#select-type');
  const selectShared = containerEl.querySelector('#select-shared');
  const selectUser = containerEl.querySelector('#select-user');
  const selectCategory = containerEl.querySelector('#select-category');

  inputSearch.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    renderList();
  });

  selectType.addEventListener('change', (e) => {
    filterType = e.target.value;
    renderList();
  });

  selectShared.addEventListener('change', (e) => {
    filterShared = e.target.value;
    renderList();
  });

  selectUser.addEventListener('change', (e) => {
    filterUser = e.target.value;
    renderList();
  });

  selectCategory.addEventListener('change', (e) => {
    filterCategory = e.target.value;
    renderList();
  });

  // Initial render of list
  renderList();
}
