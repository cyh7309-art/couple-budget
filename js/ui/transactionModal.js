/**
 * Transaction Quick Entry & Edit Modal Controller
 * 빠른 입력(5~10초)을 목표로 하는 모달
 */

import { StorageManager } from '../storage.js';
import { esc, todayLocalStr, parseAmount, thousands } from '../utils.js';
import { buildInstallmentSchedule, formatCurrency } from '../calculations.js';

export class TransactionModal {
  constructor(modalOverlayEl, onSaveSuccess) {
    this.modalEl = modalOverlayEl;
    this.onSaveSuccess = onSaveSuccess;
    this.editingId = null;
    this.isSaving = false;

    this.selectedType = 'expense';      // 'expense' | 'income' | 'transfer'
    this.selectedUserId = 'husband';
    this.selectedSharedType = 'shared'; // 'shared' | 'husband' | 'wife'
    this.selectedCategoryId = '';
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
    this.accountSelect = this.modalEl.querySelector('#modal-select-account');
    this.accountGroup = this.modalEl.querySelector('#modal-group-account');
    this.fromAccountSelect = this.modalEl.querySelector('#modal-select-from');
    this.toAccountSelect = this.modalEl.querySelector('#modal-select-to');
    this.transferGroup = this.modalEl.querySelector('#modal-group-transfer');
    this.btnFixedToggle = this.modalEl.querySelector('#modal-btn-fixed');
    this.btnVariableToggle = this.modalEl.querySelector('#modal-btn-variable');
    this.fixedGroup = this.modalEl.querySelector('#modal-group-fixed');
    this.categoryGroup = this.modalEl.querySelector('#modal-group-category');
    this.labelAmount = this.modalEl.querySelector('#modal-label-amount');
    this.labelUser = this.modalEl.querySelector('#modal-label-user');
    this.sharedGroup = this.modalEl.querySelector('#modal-group-shared');
    this.paymentGroup = this.modalEl.querySelector('#modal-group-payment');
    this.dateRow = this.modalEl.querySelector('#modal-row-date');
    this.detailToggle = this.modalEl.querySelector('#modal-detail-toggle');
    this.detailPanel = this.modalEl.querySelector('#modal-detail');
    this.detailSummary = this.modalEl.querySelector('#modal-detail-summary');

    this.installmentGroup = this.modalEl.querySelector('#modal-group-installment');
    this.installmentSelect = this.modalEl.querySelector('#modal-select-installment');
    this.rateField = this.modalEl.querySelector('#modal-rate-field');
    this.rateInput = this.modalEl.querySelector('#modal-input-rate');
    this.installmentPreview = this.modalEl.querySelector('#modal-installment-preview');

    this.btnClose = this.modalEl.querySelector('#modal-btn-close');
    this.btnCancel = this.modalEl.querySelector('#modal-btn-cancel');
    this.btnSave = this.modalEl.querySelector('#modal-btn-save');
    this.modalTitle = this.modalEl.querySelector('#modal-title-text');

    // 금액 천단위 미리보기 영역을 동적으로 삽입
    this.amountHint = document.createElement('div');
    this.amountHint.className = 'amount-hint';
    this.amountHint.setAttribute('aria-live', 'polite');
    const amountBox = this.modalEl.querySelector('.amount-input-box');
    if (amountBox && amountBox.parentNode) {
      amountBox.parentNode.insertBefore(this.amountHint, amountBox.nextSibling);
    }

    // 모바일 숫자 키패드
    if (this.inputAmount) {
      this.inputAmount.setAttribute('inputmode', 'numeric');
      this.inputAmount.setAttribute('min', '0');
      this.inputAmount.setAttribute('step', '1');
    }
  }

  bindEvents() {
    this.modalEl.addEventListener('click', (e) => {
      if (e.target === this.modalEl) this.close();
    });

    if (this.btnClose) this.btnClose.addEventListener('click', () => this.close());
    if (this.btnCancel) this.btnCancel.addEventListener('click', () => this.close());

    this.typeExpenseBtn.addEventListener('click', () => this.setType('expense'));
    this.typeIncomeBtn.addEventListener('click', () => this.setType('income'));
    this.typeTransferBtn.addEventListener('click', () => this.setType('transfer'));

    this.userHusbandBtn.addEventListener('click', () => this.setUser('husband'));
    this.userWifeBtn.addEventListener('click', () => this.setUser('wife'));

    this.sharedBtn.addEventListener('click', () => this.setSharedType('shared'));
    this.husbandPersonalBtn.addEventListener('click', () => this.setSharedType('husband'));
    this.wifePersonalBtn.addEventListener('click', () => this.setSharedType('wife'));

    // 고정/변동은 '지금 무엇이 켜져 있는지'가 한눈에 보여야 해서
    // 다른 항목들처럼 두 개짜리 버튼으로 둡니다.
    const setFixed = (v) => {
      this.isFixed = v;
      this.updateFixedButton();
      this.updateDetailSummary();
    };
    if (this.btnFixedToggle) this.btnFixedToggle.addEventListener('click', () => setFixed(true));
    if (this.btnVariableToggle) this.btnVariableToggle.addEventListener('click', () => setFixed(false));

    this.btnSave.addEventListener('click', () => this.save());

    if (this.detailToggle) {
      this.detailToggle.addEventListener('click', () => this.setDetailOpen(!this.detailOpen));
    }

    // 금액 입력 시 천단위 미리보기 + 할부 미리보기
    if (this.inputAmount) {
      this.inputAmount.addEventListener('input', () => {
        this.updateAmountHint();
        this.updateInstallmentPreview();
      });
    }

    if (this.installmentSelect) {
      this.installmentSelect.addEventListener('change', () => {
        this.updateInstallmentPreview();
        this.updateDetailSummary();
      });
    }
    if (this.rateInput) {
      this.rateInput.addEventListener('input', () => this.updateInstallmentPreview());
    }
    if (this.inputDate) {
      this.inputDate.addEventListener('change', () => {
        this.updateInstallmentPreview();
        this.updateDetailSummary();
      });
    }
    if (this.paymentMethodSelect) {
      this.paymentMethodSelect.addEventListener('change', () => this.updateDetailSummary());
    }
    if (this.inputMemo) {
      this.inputMemo.addEventListener('input', () => this.updateDetailSummary());
    }

    // ESC 닫기 / Enter 저장 / Tab 포커스 트랩 (모달이 열려 있을 때만)
    this.keyHandler = (e) => {
      if (!this.isOpen()) return;

      if (e.key === 'Tab') {
        // 모달 밖으로 포커스가 새어나가지 않게 가둡니다 (접근성)
        const focusables = Array.from(this.modalEl.querySelectorAll(
          'button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )).filter(el => !el.disabled && el.offsetParent !== null);
        if (focusables.length === 0) return;

        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      } else if (e.key === 'Enter' && !e.isComposing) {
        // textarea 가 아닌 곳에서 Enter → 저장
        const tag = (e.target && e.target.tagName) || '';
        if (tag !== 'TEXTAREA') {
          e.preventDefault();
          this.save();
        }
      }
    };
    document.addEventListener('keydown', this.keyHandler);
  }

  renderAccountOptions(accountId, fromId, toId) {
    const accounts = StorageManager.getAccounts();
    const toOpt = (a) => {
      const icon = a.type === 'card' ? '💳' : (a.type === 'cash' ? '💵' : '🏦');
      return `<option value="${esc(a.id)}">${icon} ${esc(a.name)}</option>`;
    };
    const opts = accounts.map(toOpt).join('');

    // 수입은 카드로 들어올 수 없으므로 은행·현금 계좌만 보여줍니다
    const isIncome = this.selectedType === 'income';
    const singleAccounts = isIncome ? accounts.filter(a => a.type !== 'card') : accounts;

    if (this.accountSelect) {
      this.accountSelect.innerHTML = `<option value="">선택 안 함</option>${singleAccounts.map(toOpt).join('')}`;
      this.accountSelect.value = singleAccounts.some(a => a.id === accountId) ? accountId : '';
    }
    if (this.fromAccountSelect) {
      this.fromAccountSelect.innerHTML = `<option value="">출금 계좌 선택</option>${opts}`;
      this.fromAccountSelect.value = fromId || '';
    }
    if (this.toAccountSelect) {
      this.toAccountSelect.innerHTML = `<option value="">입금 계좌 선택</option>${opts}`;
      this.toAccountSelect.value = toId || '';
    }

    // 계좌가 하나도 없으면 안내 문구로 대체
    if (this.accountGroup) {
      const label = this.accountGroup.querySelector('.form-label');
      if (label) {
        const name = isIncome ? '입금 계좌' : '사용 계좌';
        label.textContent = accounts.length === 0
          ? `🏦 ${name} ([목표/계좌] 탭에서 먼저 등록하세요)`
          : `🏦 ${name} (선택)`;
      }
    }
  }

  /** 현재 선택된 할부 개월 수 (0 = 일시불) */
  getInstallmentMonths() {
    if (!this.installmentSelect) return 0;
    if (this.selectedType !== 'expense') return 0;
    return Number(this.installmentSelect.value) || 0;
  }

  updateInstallmentPreview() {
    if (!this.installmentPreview) return;

    const months = this.getInstallmentMonths();
    const isInstallment = months >= 2;

    if (this.rateField) this.rateField.style.display = isInstallment ? 'flex' : 'none';

    if (!isInstallment) {
      this.installmentPreview.innerHTML = '';
      return;
    }

    const amount = parseAmount(this.inputAmount.value);
    if (!amount || amount <= 0) {
      this.installmentPreview.innerHTML =
        '<span class="text-muted">구매 금액을 입력하면 회차별 납입액을 보여드립니다.</span>';
      return;
    }

    const rate = Number(parseAmount(this.rateInput ? this.rateInput.value : '0')) || 0;
    const startDate = this.inputDate.value || todayLocalStr();
    const schedule = buildInstallmentSchedule(amount, months, startDate, rate);

    const last = schedule.rows[schedule.rows.length - 1];
    const sameEveryMonth = schedule.rows.every(r => r.amount === schedule.rows[0].amount);

    this.installmentPreview.innerHTML = `
      <div class="inst-preview-main">
        ${sameEveryMonth
          ? `매월 <strong>${formatCurrency(schedule.rows[0].amount)}</strong> × ${months}회`
          : `1회차 <strong>${formatCurrency(schedule.rows[0].amount)}</strong>
             → 마지막 ${formatCurrency(last.amount)} (${months}회)`}
      </div>
      <div class="inst-preview-sub">
        원금 ${formatCurrency(schedule.principal)}
        ${schedule.totalFee > 0
          ? ` + 수수료 ${formatCurrency(schedule.totalFee)} = <strong>${formatCurrency(schedule.totalPayment)}</strong>`
          : ' · 무이자'}
        <br>${esc(schedule.rows[0].date)} ~ ${esc(last.date)} 동안 ${months}건의 거래로 나뉘어 기록됩니다.
      </div>
    `;
  }

  /**
   * 상세 영역 펼치기/접기.
   * 기본 입력은 금액·유형·카테고리·누가·구분 다섯 가지뿐이고,
   * 날짜·결제수단·계좌·할부·고정변동·메모는 여기 접혀 있습니다.
   */
  setDetailOpen(open) {
    this.detailOpen = !!open;
    if (this.detailPanel) this.detailPanel.hidden = !this.detailOpen;
    if (this.detailToggle) {
      this.detailToggle.setAttribute('aria-expanded', String(this.detailOpen));
      this.detailToggle.classList.toggle('open', this.detailOpen);
      const label = this.detailToggle.querySelector('.detail-toggle-label');
      if (label) label.textContent = this.detailOpen ? '상세 접기' : '상세 입력';
    }
    this.updateDetailSummary();
  }

  /** 접혀 있을 때, 안에 무엇이 들어 있는지 한 줄로 알려줍니다 */
  updateDetailSummary() {
    if (!this.detailSummary) return;
    if (this.detailOpen) { this.detailSummary.textContent = ''; return; }

    const parts = [];
    const d = this.inputDate.value;
    parts.push(d === todayLocalStr() ? '오늘' : (d || '날짜 없음'));

    // 결제 수단은 지출에만 해당합니다
    if (this.selectedType === 'expense') {
      const pm = this.paymentMethodSelect ? this.paymentMethodSelect.value : 'card';
      parts.push(pm === 'card' ? '카드' : (pm === 'bank' ? '계좌' : '현금'));
    }

    const months = this.getInstallmentMonths();
    if (months >= 2) parts.push(`${months}개월 할부`);

    if (this.selectedType === 'expense' && this.isFixed) parts.push('고정비');
    if (this.inputMemo.value.trim()) parts.push('메모 있음');

    this.detailSummary.textContent = parts.join(' · ');
  }

  isOpen() {
    return this.modalEl.classList.contains('open');
  }

  updateAmountHint() {
    if (!this.amountHint) return;
    const val = parseAmount(this.inputAmount.value);
    this.amountHint.textContent = (val && val > 0) ? `${thousands(val)}원` : '';
  }

  open(editingTxId = null, defaultMonthStr = null) {
    this.lastFocused = document.activeElement;
    this.editingId = editingTxId;
    this.isSaving = false;
    this.setSaveButtonState(false);

    const users = StorageManager.getUsers();
    this.userHusbandBtn.textContent = users.husband.name;
    this.userWifeBtn.textContent = users.wife.name;
    this.husbandPersonalBtn.textContent = `${users.husband.name} 개인`;
    this.wifePersonalBtn.textContent = `${users.wife.name} 개인`;

    let paymentMethod = 'card';
    let accountId = '';
    let fromAccountId = '';
    let toAccountId = '';

    if (editingTxId) {
      const tx = StorageManager.getTransactions().find(t => t.id === editingTxId);
      this.currentEditingTx = tx || null;
      if (tx) {
        this.modalTitle.textContent = '거래 수정';
        this.selectedType = tx.type || 'expense';
        this.selectedUserId = tx.userId || 'husband';
        this.selectedSharedType = tx.sharedType || 'shared';
        this.selectedCategoryId = tx.categoryId || '';
        this.isFixed = !!tx.isFixed;
        paymentMethod = tx.paymentMethod || 'card';
        accountId = tx.accountId || '';
        fromAccountId = tx.fromAccountId || '';
        toAccountId = tx.toAccountId || '';

        this.inputAmount.value = tx.amount || '';
        this.inputDate.value = tx.date || todayLocalStr();
        this.inputMemo.value = tx.memo || '';
      }
    } else {
      this.currentEditingTx = null;
      this.modalTitle.textContent = '거래 등록';
      this.selectedType = 'expense';
      this.selectedUserId = 'husband';
      this.selectedSharedType = 'shared';
      this.selectedCategoryId = '';
      this.isFixed = false;
      paymentMethod = 'card';

      this.inputAmount.value = '';
      this.inputMemo.value = '';

      // 로컬 타임존 기준 오늘 (UTC 기준이면 새벽에 하루 전으로 기록됨)
      const todayStr = todayLocalStr();
      this.inputDate.value = (defaultMonthStr && !todayStr.startsWith(defaultMonthStr))
        ? `${defaultMonthStr}-01`
        : todayStr;
    }

    // ✅ select 의 실제 DOM 값을 반드시 동기화 (미설정 시 항상 '카드'로 저장되던 버그)
    if (this.paymentMethodSelect) this.paymentMethodSelect.value = paymentMethod;
    this.renderAccountOptions(accountId, fromAccountId, toAccountId);

    // 할부는 신규 등록에서만 설정합니다 (기존 할부 회차 수정은 금액/메모만)
    if (this.installmentSelect) this.installmentSelect.value = '0';
    if (this.rateInput) this.rateInput.value = '0';
    this.editingInstallment = editingTxId ? this.currentEditingTx : null;

    // 이체는 계좌 지정이 필수라 자동으로 펼치고, 수정할 때도 전체를 보여줍니다
    this.setDetailOpen(this.selectedType === 'transfer' || !!editingTxId);

    this.updateTypeTabs();
    this.updateUserButtons();
    this.updateSharedButtons();
    this.updateFixedButton();
    this.renderCategoryChips();
    this.updateAmountHint();

    this.modalEl.classList.add('open');
    this.lockBodyScroll();
    setTimeout(() => this.inputAmount.focus(), 100);
  }

  /**
   * 모달이 열려 있는 동안 뒤 화면이 따라 스크롤되지 않게 고정합니다.
   * (iOS 에서 입력 중 배경과 하단 바가 흔들리던 원인)
   */
  lockBodyScroll() {
    if (document.body.classList.contains('modal-open')) return;
    this.savedScrollY = window.scrollY || 0;
    document.body.style.top = `-${this.savedScrollY}px`;
    document.body.classList.add('modal-open');
  }

  unlockBodyScroll() {
    if (!document.body.classList.contains('modal-open')) return;
    document.body.classList.remove('modal-open');
    document.body.style.top = '';
    window.scrollTo(0, this.savedScrollY || 0);
  }

  close() {
    this.modalEl.classList.remove('open');
    this.unlockBodyScroll();
    this.editingId = null;
    this.isSaving = false;
    this.setSaveButtonState(false);
    // 모달을 연 버튼으로 포커스를 되돌립니다
    if (this.lastFocused && typeof this.lastFocused.focus === 'function') {
      this.lastFocused.focus();
      this.lastFocused = null;
    }
  }

  setType(type) {
    if (this.selectedType === type) return;
    this.selectedType = type;
    // ✅ 타입이 바뀌면 카테고리 선택을 초기화 (수입 거래에 지출 카테고리가 붙던 버그)
    this.selectedCategoryId = '';
    this.renderAccountOptions(
      this.accountSelect ? this.accountSelect.value : '',
      this.fromAccountSelect ? this.fromAccountSelect.value : '',
      this.toAccountSelect ? this.toAccountSelect.value : ''
    );
    this.updateTypeTabs();
    this.renderCategoryChips();
    this.updateDetailSummary();
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

    if (this.fixedGroup) {
      this.fixedGroup.style.display = this.selectedType === 'expense' ? 'block' : 'none';
    }
    const isTransfer = this.selectedType === 'transfer';
    const isExpense = this.selectedType === 'expense';
    if (isTransfer && !this.detailOpen) this.setDetailOpen(true);

    // 유형별 문구 — 수입인데 '얼마를 썼나요', '누가 결제했나요'가 나오던 문제
    const COPY = {
      expense:  { amount: '얼마를 썼나요',   user: '누가 결제했나요',   memo: '예: 이마트 장보기' },
      income:   { amount: '얼마를 받았나요', user: '누구의 수입인가요', memo: '예: 9월 급여' },
      transfer: { amount: '얼마를 옮겼나요', user: '누가 이체했나요',   memo: '예: 생활비 통장으로 이체' }
    };
    const copy = COPY[this.selectedType] || COPY.expense;
    if (this.labelAmount) this.labelAmount.textContent = copy.amount;
    if (this.labelUser) this.labelUser.textContent = copy.user;
    if (this.inputMemo) this.inputMemo.placeholder = copy.memo;

    // 공동/개인 구분과 결제 수단은 지출에만 의미가 있습니다
    // (정산·통계는 지출의 공동/개인만 사용하고, 수입은 '누구의 수입'만 봅니다)
    if (this.sharedGroup) this.sharedGroup.style.display = isExpense ? '' : 'none';
    if (this.paymentGroup) this.paymentGroup.style.display = isExpense ? '' : 'none';
    if (this.dateRow) this.dateRow.classList.toggle('is-single', !isExpense);

    // 이체는 카테고리 개념이 없으므로 아예 숨깁니다
    if (this.categoryGroup) {
      this.categoryGroup.style.display = isTransfer ? 'none' : 'block';
    }
    // 이체는 단일 계좌 대신 출금/입금 계좌를 받습니다
    if (this.accountGroup) this.accountGroup.style.display = isTransfer ? 'none' : 'block';
    if (this.transferGroup) this.transferGroup.style.display = isTransfer ? 'block' : 'none';

    // 할부는 지출에서만, 그리고 신규 등록에서만 가능합니다
    if (this.installmentGroup) {
      const canInstallment = this.selectedType === 'expense' && !this.editingId;
      this.installmentGroup.style.display = canInstallment ? 'block' : 'none';
      if (!canInstallment && this.installmentSelect) this.installmentSelect.value = '0';
    }
    this.updateInstallmentPreview();
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
    if (!this.btnFixedToggle || !this.btnVariableToggle) return;
    this.btnFixedToggle.classList.toggle('active', this.isFixed);
    this.btnVariableToggle.classList.toggle('active', !this.isFixed);
  }

  renderCategoryChips() {
    if (this.selectedType === 'transfer') {
      this.selectedCategoryId = '';
      this.categoryGrid.innerHTML = '';
      return;
    }

    const categories = StorageManager.getCategories();
    const filteredCats = categories.filter(c => c.type === this.selectedType);

    if (filteredCats.length === 0) {
      this.selectedCategoryId = '';
      this.categoryGrid.innerHTML = '<div class="text-muted">선택 가능한 카테고리가 없습니다.</div>';
      return;
    }

    // 선택된 카테고리가 현재 타입에 없으면 첫 번째로 보정
    if (!filteredCats.some(c => c.id === this.selectedCategoryId)) {
      this.selectedCategoryId = filteredCats[0].id;
    }

    this.categoryGrid.innerHTML = filteredCats.map(cat => `
      <button type="button" class="chip-cat ${cat.id === this.selectedCategoryId ? 'active' : ''}" data-id="${esc(cat.id)}">
        <span>${esc(cat.icon)}</span>
        <span>${esc(cat.name)}</span>
      </button>
    `).join('');

    this.categoryGrid.querySelectorAll('.chip-cat').forEach(chip => {
      chip.addEventListener('click', (e) => {
        e.preventDefault();
        this.selectedCategoryId = chip.getAttribute('data-id');
        this.renderCategoryChips();
      });
    });
  }

  setSaveButtonState(saving) {
    if (!this.btnSave) return;
    this.btnSave.disabled = saving;
    this.btnSave.textContent = saving ? '저장 중…' : '저장하기';
  }

  async save() {
    if (this.isSaving) return; // 연타로 인한 중복 등록 방지

    const amountVal = parseAmount(this.inputAmount.value);
    if (amountVal === null || amountVal <= 0) {
      alert('금액을 올바르게 입력해주세요 (0원 초과).');
      this.inputAmount.focus();
      return;
    }

    const dateVal = this.inputDate.value;
    if (!dateVal) {
      alert('날짜를 선택해주세요.');
      this.inputDate.focus();
      return;
    }

    if (this.selectedType !== 'transfer' && !this.selectedCategoryId) {
      alert('카테고리를 선택해주세요.');
      return;
    }

    const accountCount = StorageManager.getAccounts().length;
    const fromId = this.fromAccountSelect ? this.fromAccountSelect.value : '';
    const toId = this.toAccountSelect ? this.toAccountSelect.value : '';

    if (this.selectedType === 'transfer' && accountCount > 0) {
      if (!fromId || !toId) {
        alert('이체는 출금 계좌와 입금 계좌를 모두 선택해주세요.');
        return;
      }
      if (fromId === toId) {
        alert('출금 계좌와 입금 계좌가 같습니다.');
        return;
      }
    }

    this.isSaving = true;
    this.setSaveButtonState(true);

    const txData = {
      date: dateVal,
      type: this.selectedType,
      amount: amountVal,
      userId: this.selectedUserId,
      // ✅ 이체는 카테고리를 비웁니다 (직전 카테고리가 따라붙던 버그)
      categoryId: this.selectedType === 'transfer' ? '' : this.selectedCategoryId,
      sharedType: this.selectedSharedType,
      // 결제 수단은 지출에만 저장합니다 (수입이 '카드'로 저장되던 문제)
      paymentMethod: this.selectedType === 'expense'
        ? (this.paymentMethodSelect ? this.paymentMethodSelect.value : 'card')
        : (this.selectedType === 'transfer' ? 'bank' : ''),
      isFixed: this.selectedType === 'expense' ? this.isFixed : false,
      memo: this.inputMemo.value.trim(),
      accountId: this.selectedType === 'transfer' ? '' : (this.accountSelect ? this.accountSelect.value : ''),
      fromAccountId: this.selectedType === 'transfer' ? fromId : '',
      toAccountId: this.selectedType === 'transfer' ? toId : ''
    };

    try {
      const months = this.getInstallmentMonths();

      if (this.editingId) {
        await StorageManager.updateTransaction(this.editingId, txData);
      } else if (months >= 2) {
        const rate = Number(parseAmount(this.rateInput ? this.rateInput.value : '0')) || 0;
        const result = await StorageManager.addInstallment(txData, { months, annualRate: rate });
        const sc = result.schedule;
        alert(
          `할부로 등록했습니다.\n\n` +
          `${months}개월 · 회차당 ${sc.rows[0].amount.toLocaleString('ko-KR')}원\n` +
          (sc.totalFee > 0
            ? `원금 ${sc.principal.toLocaleString('ko-KR')}원 + 수수료 ${sc.totalFee.toLocaleString('ko-KR')}원 = ${sc.totalPayment.toLocaleString('ko-KR')}원\n`
            : '무이자\n') +
          `${sc.rows[0].date} ~ ${sc.rows[sc.rows.length - 1].date}`
        );
      } else {
        await StorageManager.addTransaction(txData);
      }
      this.close();
      if (this.onSaveSuccess) this.onSaveSuccess();
    } catch (e) {
      console.error('거래 저장 실패:', e);
      alert('저장 중 문제가 발생했습니다. 다시 시도해주세요.');
      this.isSaving = false;
      this.setSaveButtonState(false);
    }
  }
}
