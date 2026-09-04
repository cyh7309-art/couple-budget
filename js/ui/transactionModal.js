/**
 * Transaction Quick Entry & Edit Modal Controller
 * Floating (+) Action Button Modal for Fast 5-10 second recording
 */

import { StorageManager } from '../storage.js';

export class TransactionModal {
  constructor(modalOverlayEl, onSaveSuccess) {
    this.modalEl = modalOverlayEl;
    this.onSaveSuccess = onSaveSuccess;
    this.editingId = null;
    this.selectedType = 'expense'; // 'expense' | 'income' | 'transfer'
    this.selectedUserId = 'husband';
    this.selectedSharedType = 'shared'; // 'shared' | 'husband' | 'wife'
    this.selectedCategoryId = '';
    this.selectedPaymentMethod = 'card';
    this.isFixed = false;

    this.initElements();
    this.bindEvents();
  }

  initElements() {
    this.typeExpenseBtn = this.modalEl.querySelector('#tab-modal-expense');
    this.typeIncomeBtn = this.modalEl.querySelector('#tab-modal-income');
    this.typeTransferBtn = this.modalEl.querySelector('#tab-modal-transfer');

    this.inputAmount = this.modalEl.querySelector('#modal-input-amount');
    this.inputDate = this.modalEl.querySelector('#modal-input-date');
    this.inputMemo = this.modalEl.querySelector('#modal-input-memo');
    this.categoryGrid = this.modalEl.querySelector('#modal-category-grid');

    this.userHusbandBtn = this.modalEl.querySelector('#modal-user-husband');
    this.userWifeBtn = this.modalEl.querySelector('#modal-user-wife');

    this.sharedBtn = this.modalEl.querySelector('#modal-shared-common');
    this.husbandPersonalBtn = this.modalEl.querySelector('#modal-shared-husband');
    this.wifePersonalBtn = this.modalEl.querySelector('#modal-shared-wife');

    this.paymentMethodSelect = this.modalEl.querySelector('#modal-select-payment');
    this.btnFixedToggle = this.modalEl.querySelector('#modal-btn-fixed');
    this.fixedGroup = this.modalEl.querySelector('#modal-group-fixed');

    this.btnClose = this.modalEl.querySelector('#modal-btn-close');
    this.btnCancel = this.modalEl.querySelector('#modal-btn-cancel');
    this.btnSave = this.modalEl.querySelector('#modal-btn-save');
    this.modalTitle = this.modalEl.querySelector('#modal-title-text');
  }

  bindEvents() {
    // Modal Overlay close on backdrop click
    this.modalEl.addEventListener('click', (e) => {
      if (e.target === this.modalEl) this.close();
    });

    if (this.btnClose) this.btnClose.addEventListener('click', () => this.close());
    if (this.btnCancel) this.btnCancel.addEventListener('click', () => this.close());

    // Type Switch Tabs
    this.typeExpenseBtn.addEventListener('click', () => this.setType('expense'));
    this.typeIncomeBtn.addEventListener('click', () => this.setType('income'));
    this.typeTransferBtn.addEventListener('click', () => this.setType('transfer'));

    // User Switch
    this.userHusbandBtn.addEventListener('click', () => this.setUser('husband'));
    this.userWifeBtn.addEventListener('click', () => this.setUser('wife'));

    // Shared Type Switch
    this.sharedBtn.addEventListener('click', () => this.setSharedType('shared'));
    this.husbandPersonalBtn.addEventListener('click', () => this.setSharedType('husband'));
    this.wifePersonalBtn.addEventListener('click', () => this.setSharedType('wife'));

    // Fixed / Variable toggle
    if (this.btnFixedToggle) {
      this.btnFixedToggle.addEventListener('click', () => {
        this.isFixed = !this.isFixed;
        this.updateFixedButton();
      });
    }

    // Submit Handler
    this.btnSave.addEventListener('click', () => this.save());
  }

  open(editingTxId = null, defaultMonthStr = null) {
    this.editingId = editingTxId;
    const users = StorageManager.getUsers();

    // Update user button names
    if (users.husband) this.userHusbandBtn.textContent = `👨 ${users.husband.name}`;
    if (users.wife) this.userWifeBtn.textContent = `👩 ${users.wife.name}`;

    if (users.husband) this.husbandPersonalBtn.textContent = `👨 ${users.husband.name} 개인`;
    if (users.wife) this.wifePersonalBtn.textContent = `👩 ${users.wife.name} 개인`;

    if (editingTxId) {
      // Edit Mode
      const transactions = StorageManager.getTransactions();
      const tx = transactions.find(t => t.id === editingTxId);
      if (tx) {
        this.modalTitle.textContent = '✏️ 거래 정보 수정';
        this.selectedType = tx.type;
        this.selectedUserId = tx.userId || 'husband';
        this.selectedSharedType = tx.sharedType || 'shared';
        this.selectedCategoryId = tx.categoryId || '';
        this.selectedPaymentMethod = tx.paymentMethod || 'card';
        this.isFixed = !!tx.isFixed;

        this.inputAmount.value = tx.amount || 0;
        this.inputDate.value = tx.date || new Date().toISOString().slice(0, 10);
        this.inputMemo.value = tx.memo || '';
      }
    } else {
      // New Mode
      this.modalTitle.textContent = '⚡ 빠른 거래 등록';
      this.selectedType = 'expense';
      this.selectedUserId = 'husband';
      this.selectedSharedType = 'shared';
      this.selectedCategoryId = '';
      this.selectedPaymentMethod = 'card';
      this.isFixed = false;

      this.inputAmount.value = '';
      this.inputMemo.value = '';

      // Default date logic
      const todayStr = new Date().toISOString().slice(0, 10);
      if (defaultMonthStr && !todayStr.startsWith(defaultMonthStr)) {
        this.inputDate.value = `${defaultMonthStr}-01`;
      } else {
        this.inputDate.value = todayStr;
      }
    }

    this.updateTypeTabs();
    this.updateUserButtons();
    this.updateSharedButtons();
    this.updateFixedButton();
    this.renderCategoryChips();

    this.modalEl.classList.add('open');
    setTimeout(() => this.inputAmount.focus(), 100);
  }

  close() {
    this.modalEl.classList.remove('open');
    this.editingId = null;
  }

  setType(type) {
    this.selectedType = type;
    this.updateTypeTabs();
    this.renderCategoryChips();
  }

  setUser(userId) {
    this.selectedUserId = userId;
    this.updateUserButtons();
  }

  setSharedType(sharedType) {
    this.selectedSharedType = sharedType;
    this.updateSharedButtons();
  }

  updateTypeTabs() {
    [this.typeExpenseBtn, this.typeIncomeBtn, this.typeTransferBtn].forEach(b => b.classList.remove('active'));
    if (this.selectedType === 'expense') this.typeExpenseBtn.classList.add('active');
    if (this.selectedType === 'income') this.typeIncomeBtn.classList.add('active');
    if (this.selectedType === 'transfer') this.typeTransferBtn.classList.add('active');

    // Show/hide expense-only groups
    if (this.selectedType === 'expense') {
      if (this.fixedGroup) this.fixedGroup.style.display = 'block';
    } else {
      if (this.fixedGroup) this.fixedGroup.style.display = 'none';
    }
  }

  updateUserButtons() {
    [this.userHusbandBtn, this.userWifeBtn].forEach(b => b.classList.remove('active'));
    if (this.selectedUserId === 'husband') this.userHusbandBtn.classList.add('active');
    if (this.selectedUserId === 'wife') this.userWifeBtn.classList.add('active');
  }

  updateSharedButtons() {
    [this.sharedBtn, this.husbandPersonalBtn, this.wifePersonalBtn].forEach(b => b.classList.remove('active'));
    if (this.selectedSharedType === 'shared') this.sharedBtn.classList.add('active');
    if (this.selectedSharedType === 'husband') this.husbandPersonalBtn.classList.add('active');
    if (this.selectedSharedType === 'wife') this.wifePersonalBtn.classList.add('active');
  }

  updateFixedButton() {
    if (!this.btnFixedToggle) return;
    if (this.isFixed) {
      this.btnFixedToggle.classList.add('active');
      this.btnFixedToggle.textContent = '📌 고정지출 (매월 고정)';
    } else {
      this.btnFixedToggle.classList.remove('active');
      this.btnFixedToggle.textContent = '🌊 변동지출 (변동)';
    }
  }

  renderCategoryChips() {
    const categories = StorageManager.getCategories();
    const filteredCats = categories.filter(c => c.type === this.selectedType);

    if (filteredCats.length === 0) {
      this.categoryGrid.innerHTML = '<div class="text-muted">선택 가능한 카테고리가 없습니다.</div>';
      return;
    }

    if (!this.selectedCategoryId && filteredCats.length > 0) {
      this.selectedCategoryId = filteredCats[0].id;
    }

    this.categoryGrid.innerHTML = filteredCats.map(cat => {
      const isSelected = cat.id === this.selectedCategoryId;
      return `
        <button class="chip-cat ${isSelected ? 'active' : ''}" data-id="${cat.id}">
          <span>${cat.icon}</span>
          <span>${cat.name}</span>
        </button>
      `;
    }).join('');

    this.categoryGrid.querySelectorAll('.chip-cat').forEach(chip => {
      chip.addEventListener('click', (e) => {
        e.preventDefault();
        this.selectedCategoryId = chip.getAttribute('data-id');
        this.renderCategoryChips();
      });
    });
  }

  async save() {
    const amountVal = Number(this.inputAmount.value);
    if (!amountVal || isNaN(amountVal) || amountVal <= 0) {
      alert('금액을 올바르게 입력해주세요 (0원 초과).');
      this.inputAmount.focus();
      return;
    }

    const dateVal = this.inputDate.value;
    if (!dateVal) {
      alert('날짜를 선택해주세요.');
      return;
    }

    const memoVal = this.inputMemo.value.trim();

    const txData = {
      date: dateVal,
      type: this.selectedType,
      amount: amountVal,
      userId: this.selectedUserId,
      categoryId: this.selectedCategoryId,
      sharedType: this.selectedSharedType,
      paymentMethod: this.paymentMethodSelect ? this.paymentMethodSelect.value : 'card',
      isFixed: this.selectedType === 'expense' ? this.isFixed : false,
      memo: memoVal
    };

    if (this.editingId) {
      await StorageManager.updateTransaction(this.editingId, txData);
    } else {
      await StorageManager.addTransaction(txData);
    }

    this.close();
    if (this.onSaveSuccess) this.onSaveSuccess();
  }
}
