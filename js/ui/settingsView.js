/**
 * Settings View (설정 / 예산 / 반복거래 / 카테고리 / 데이터)
 */

import { getBudgetsForMonth, formatCurrency } from '../calculations.js';
import { StorageManager, isDemoMode } from '../storage.js';
import { esc, parseAmount, todayLocalStr, thousands } from '../utils.js';
import { isAuthenticated, getSession, showLoginGate, signOut, clearSkipLogin } from '../auth.js';
import { applyTheme } from '../theme.js';

export function renderSettingsView(containerEl, currentMonthStr, refreshApp) {
  let showRecurringForm = false;
  let editingRecurringId = null;

  function render() {
    const users = StorageManager.getUsers();
    const categories = StorageManager.getCategories();
    const budgets = StorageManager.getBudgets();
    const accounts = StorageManager.getAccounts();
    const recurring = StorageManager.getRecurring();
    const deviceSettings = StorageManager.getDeviceSettings();
    const sharedSettings = StorageManager.getSharedSettings();

    const husbandName = users.husband.name;
    const wifeName = users.wife.name;

    const monthBudgets = getBudgetsForMonth(budgets, currentMonthStr);
    const inheritedFrom = monthBudgets.length > 0 && monthBudgets[0].inherited
      ? (monthBudgets[0].inheritedFrom || null)
      : null;

    const pendingCount = StorageManager.getPendingCount();
    const editingRec = editingRecurringId ? recurring.find(r => r.id === editingRecurringId) : null;

    containerEl.innerHTML = `
      ${isDemoMode() ? `
        <div class="card settings-card" style="border-left:4px solid #f59e0b">
          <h3 class="card-title">지금은 데모 모드입니다</h3>
          <p class="card-desc">
            화면에 보이는 거래·예산·목표·계좌는 전부 <strong>가짜 샘플 데이터</strong>이며,
            클라우드에 저장되지 않고 배우자 기기와도 공유되지 않습니다.
          </p>
          <button class="btn-primary-sm margin-top-sm" id="btn-exit-demo">✅ 실사용 모드로 전환 (샘플 삭제하고 빈 가계부로 시작)</button>
        </div>
      ` : ''}

      ${pendingCount > 0 ? `
        <div class="card settings-card margin-top" style="border-left:4px solid #f59e0b">
          <h3 class="card-title">⏳ 클라우드에 올리지 못한 변경 ${pendingCount}건</h3>
          <p class="card-desc">
            오프라인 상태에서 입력한 내용은 이 기기에 안전하게 보관되어 있으며,
            인터넷이 연결되면 자동으로 전송됩니다.
          </p>
          <button class="btn-primary-sm margin-top-sm" id="btn-retry-sync">🔄 지금 다시 전송</button>
        </div>
      ` : ''}

      <!-- 계정 -->
      ${isDemoMode() ? '' : `
        <div class="card settings-card margin-top">
          <h3 class="card-title">계정과 동기화</h3>
          ${isAuthenticated() ? `
            <p class="card-desc">
              <strong>${esc((getSession() && getSession().user && getSession().user.email) || '')}</strong> 계정으로 로그인되어 있습니다.
              배우자 기기와 실시간으로 동기화됩니다.
            </p>
            <button class="btn-secondary-sm margin-top-sm" id="btn-signout">로그아웃</button>
          ` : `
            <p class="card-desc">
              현재 <strong>로그인하지 않은 상태</strong>입니다. 입력한 내용은 이 기기에만 저장되며
              배우자 기기와 공유되지 않습니다.
            </p>
            <button class="btn-primary-sm margin-top-sm" id="btn-signin">로그인 / 계정 만들기</button>
          `}
        </div>
      `}

      <!-- 화면 (기기별) -->
      <div class="card settings-card margin-top">
        <div class="card-title-row">
          <h3 class="card-title">화면</h3>
          <span class="badge badge-variable">이 기기에만</span>
        </div>

        <div class="form-group">
          <label class="form-label">테마</label>
          <select id="select-theme" class="form-select">
            <option value="system" ${deviceSettings.theme === 'system' ? 'selected' : ''}>시스템 설정 따르기</option>
            <option value="light" ${deviceSettings.theme === 'light' ? 'selected' : ''}>라이트</option>
            <option value="dark" ${deviceSettings.theme === 'dark' ? 'selected' : ''}>다크</option>
          </select>
        </div>
        <p class="card-desc">테마는 기기마다 다르게 쓰는 게 자연스러워서 이 기기에만 저장됩니다.</p>
      </div>

      <!-- 부부 공유 설정 -->
      <div class="card settings-card margin-top">
        <div class="card-title-row">
          <h3 class="card-title">부부 공유 설정</h3>
          <span class="badge badge-shared">두 기기 모두</span>
        </div>

        <div class="form-group">
          <label class="form-label">정산 기준</label>
          <select id="select-settlement" class="form-select">
            <option value="half" ${sharedSettings.settlementMode === 'half' ? 'selected' : ''}>반반 부담 (50:50)</option>
            <option value="income" ${sharedSettings.settlementMode === 'income' ? 'selected' : ''}>수입 비율대로 부담</option>
          </select>
          <p class="card-desc">공동생활비를 누가 얼마나 부담해야 하는지 계산하는 기준입니다.</p>
        </div>

        <label class="check-row margin-top-sm">
          <input type="checkbox" id="check-card-settle" ${sharedSettings.cardSettlementEnabled !== false ? 'checked' : ''} />
          <span>카드 결제일이 지나면 <strong>결제 통장 → 카드</strong> 이체를 자동으로 만들기</span>
        </label>
        <p class="card-desc">
          카드별 결제일·결제 통장은 <strong>[목표/계좌]</strong> 탭에서 카드를 수정해 설정합니다.
          이 항목을 끄면 모든 카드의 자동 생성이 멈춥니다.
        </p>
      </div>

      <!-- 사용자 이름 -->
      <div class="card settings-card margin-top">
        <h3 class="card-title">사용자 이름</h3>
        <p class="card-desc">가계부에서 사용할 부부의 명칭을 설정하세요.</p>

        <div class="setting-form-row">
          <div class="form-group">
            <label class="form-label">남편 이름</label>
            <input type="text" id="input-husband-name" class="form-input" maxlength="20" value="${esc(husbandName)}" />
          </div>
          <div class="form-group">
            <label class="form-label">아내 이름</label>
            <input type="text" id="input-wife-name" class="form-input" maxlength="20" value="${esc(wifeName)}" />
          </div>
        </div>
        <button class="btn-primary-sm margin-top-sm" id="btn-save-users">사용자 이름 저장</button>
      </div>

      <!-- 반복 거래 -->
      <div class="card settings-card margin-top">
        <div class="card-title-row">
          <div>
            <h3 class="card-title">반복 거래</h3>
            <p class="card-desc">
              월세·보험료·구독료처럼 매달 반복되는 항목을 등록해두면 자동으로 거래가 만들어집니다.
              같은 달에 두 번 생성되지 않습니다.
            </p>
          </div>
          <button class="btn-primary-sm" id="btn-add-recurring">+ 반복 거래 추가</button>
        </div>

        ${showRecurringForm ? recurringFormHtml(editingRec, categories, accounts, husbandName, wifeName) : ''}

        ${recurring.length === 0 ? `
          <div class="empty-state">
            <span class="empty-icon">🔁</span>
            <p>등록된 반복 거래가 없습니다.</p>
          </div>
        ` : `
          <div class="recurring-list">
            ${recurring.map(r => {
              const cat = categories.find(c => c.id === r.categoryId);
              const acc = accounts.find(a => a.id === r.accountId);
              const inactive = r.active === false;
              return `
                <div class="recurring-item ${inactive ? 'inactive' : ''}">
                  <div class="rec-main">
                    <div class="rec-title">
                      <strong>${esc(r.name)}</strong>
                      <span class="badge ${r.type === 'income' ? 'badge-income' : 'badge-expense'}">
                        ${r.type === 'income' ? '수입' : '지출'}
                      </span>
                      ${r.amountMode === 'variable' ? '<span class="badge badge-caution">변동</span>' : ''}
                      ${inactive ? '<span class="badge badge-variable">일시중지</span>' : ''}
                    </div>
                    <div class="rec-meta">
                      매월 ${Number(r.dayOfMonth) || 1}일 ·
                      ${cat ? esc(cat.icon) + ' ' + esc(cat.name) : '카테고리 없음'} ·
                      ${r.sharedType === 'shared' ? '👫 공동' : (r.sharedType === 'wife' ? `👩 ${esc(wifeName)} 개인` : `👨 ${esc(husbandName)} 개인`)}
                      ${acc ? ' · 🏦 ' + esc(acc.name) : ''}
                    </div>
                  </div>
                  <div class="rec-right">
                    <strong class="rec-amount">
                      ${formatCurrency(r.amount)}${r.amountMode === 'variable' ? '<span class="rec-approx">쯤</span>' : ''}
                    </strong>
                    <div class="rec-actions">
                      <button class="btn-icon btn-toggle-rec" data-id="${esc(r.id)}" title="${inactive ? '재개' : '일시중지'}">${inactive ? '▶️' : '⏸️'}</button>
                      <button class="btn-icon btn-edit-rec" data-id="${esc(r.id)}" title="수정">✏️</button>
                      <button class="btn-icon btn-del-rec" data-id="${esc(r.id)}" title="삭제">🗑️</button>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
          <button class="btn-secondary-sm margin-top-sm" id="btn-run-recurring">
            ${esc(currentMonthStr)} 반복 거래 생성
          </button>
          <button class="btn-secondary-sm margin-top-sm" id="btn-run-card">
            ${esc(currentMonthStr)} 카드 결제 갱신
          </button>
        `}
      </div>

      <!-- 예산 -->
      <div class="card settings-card margin-top">
        <div class="card-title-row">
          <div>
            <h3 class="card-title">${esc(currentMonthStr)} 예산</h3>
            <p class="card-desc">
              ${inheritedFrom
                ? `이 달에는 아직 예산이 없어 <strong>${esc(inheritedFrom)}</strong> 예산을 그대로 불러왔습니다. 확인 후 저장하면 이 달 예산으로 확정됩니다.`
                : '이번 달 카테고리별 목표 예산을 설정합니다.'}
            </p>
          </div>
        </div>

        <div class="budget-settings-grid">
          ${categories.filter(c => c.type === 'expense').map(cat => {
            const bObj = monthBudgets.find(b => b.categoryId === cat.id);
            const amt = bObj ? Number(bObj.amount) || 0 : 0;
            return `
              <div class="budget-set-item">
                <div class="cat-set-label">
                  <span class="cat-icon-badge">${esc(cat.icon)}</span>
                  <span>${esc(cat.name)}</span>
                </div>
                <div class="budget-input-group">
                  <input type="number" inputmode="numeric" min="0" step="10000"
                         class="form-input input-cat-budget"
                         data-catid="${esc(cat.id)}" value="${amt}" placeholder="0" />
                  <span class="unit-text">원</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
        <button class="btn-primary-sm margin-top-sm" id="btn-save-budgets">예산 일괄 저장</button>
      </div>

      <!-- 카테고리 -->
      <div class="card settings-card margin-top">
        <div class="card-title-row">
          <h3 class="card-title">카테고리</h3>
          <button class="btn-secondary-sm" id="btn-add-category">+ 카테고리 추가</button>
        </div>

        <div class="categories-manage-grid">
          ${categories.map(cat => `
            <div class="cat-manage-card" style="border-left: 4px solid ${esc(cat.color)}">
              <div class="cat-manage-left">
                <span class="cat-manage-icon">${esc(cat.icon)}</span>
                <div>
                  <strong class="cat-manage-name">${esc(cat.name)}</strong>
                  <span class="badge ${cat.type === 'income' ? 'badge-income' : 'badge-expense'}">
                    ${cat.type === 'income' ? '수입' : '지출'}
                  </span>
                </div>
              </div>
              <div class="cat-manage-actions">
                <button class="btn-icon btn-rename-cat" data-id="${esc(cat.id)}" title="이름 변경">✏️</button>
                ${String(cat.id).startsWith('cat_custom_')
                  ? `<button class="btn-icon btn-del-cat" data-id="${esc(cat.id)}" title="삭제">🗑️</button>`
                  : ''}
              </div>
            </div>
          `).join('')}
        </div>
        <p class="card-desc margin-top-sm">기본 카테고리는 통계 연속성을 위해 삭제할 수 없지만 이름은 바꿀 수 있습니다.</p>
      </div>

      <!-- 데이터 -->
      <div class="card settings-card margin-top">
        <h3 class="card-title">데이터 백업과 복원</h3>
        <p class="card-desc">가계부 데이터를 JSON 파일로 내보내거나, 기존 백업 파일을 복원할 수 있습니다.</p>

        <div class="backup-btn-group">
          <button class="btn-primary-sm" id="btn-export-json">백업 파일 내려받기</button>
          <label class="btn-secondary-sm" style="cursor: pointer; display: inline-block;">
            백업 파일 복원
            <input type="file" id="input-import-json" accept=".json,application/json" style="display: none;" />
          </label>
          <button class="btn-secondary-sm" id="btn-purge-sample">샘플 데이터 정리</button>
          <button class="btn-danger-sm" id="btn-clear-all">모든 데이터 초기화</button>
        </div>
        <p class="card-desc margin-top-sm">
          <strong>샘플 데이터 정리</strong>는 초기 버전이 자동으로 심어둔 예시 데이터만 골라서 삭제합니다.
          직접 입력하신 내역은 건드리지 않습니다.
        </p>
      </div>
    `;

    bindEvents();
  }

  function recurringFormHtml(rec, categories, accounts, husbandName, wifeName) {
    const type = rec ? rec.type : 'expense';
    return `
      <div class="account-form" id="recurring-form">
        <div class="form-row-2">
          <div class="form-group">
            <label class="form-label">이름</label>
            <input type="text" id="rec-name" class="form-input" maxlength="40"
                   placeholder="예: 넷플릭스 구독료" value="${rec ? esc(rec.name) : ''}" />
          </div>
          <div class="form-group">
            <label class="form-label">금액 (원)</label>
            <input type="text" inputmode="numeric" id="rec-amount" class="form-input"
                   placeholder="0" value="${rec ? thousands(Number(rec.amount) || 0) : ''}" />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">금액 유형</label>
          <select id="rec-amount-mode" class="form-select">
            <option value="fixed" ${!rec || rec.amountMode !== 'variable' ? 'selected' : ''}>
              고정 — 매달 같은 금액, 자동 생성
            </option>
            <option value="variable" ${rec && rec.amountMode === 'variable' ? 'selected' : ''}>
              변동 — 매달 금액이 다름, 확인 후 입력
            </option>
          </select>
          <p class="card-desc">
            <strong>변동</strong>으로 두면 자동 생성하지 않고, 매달 홈 화면에 "금액 확인 필요"로 올라옵니다.
            지난달 금액이 미리 채워지므로 숫자만 고쳐서 확정하면 됩니다. (관리비·전기요금 등)
          </p>
        </div>

        <div class="form-row-2">
          <div class="form-group">
            <label class="form-label">유형</label>
            <select id="rec-type" class="form-select">
              <option value="expense" ${type === 'expense' ? 'selected' : ''}>지출</option>
              <option value="income" ${type === 'income' ? 'selected' : ''}>수입</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">매월 며칠</label>
            <input type="number" id="rec-day" class="form-input" min="1" max="31"
                   value="${rec ? (Number(rec.dayOfMonth) || 1) : 1}" />
          </div>
        </div>

        <div class="form-row-2">
          <div class="form-group">
            <label class="form-label">카테고리</label>
            <select id="rec-category" class="form-select">
              ${categories.map(c => `
                <option value="${esc(c.id)}" data-type="${esc(c.type)}"
                        ${rec && rec.categoryId === c.id ? 'selected' : ''}>
                  ${esc(c.icon)} ${esc(c.name)} (${c.type === 'income' ? '수입' : '지출'})
                </option>
              `).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">계좌 (선택)</label>
            <select id="rec-account" class="form-select">
              <option value="">선택 안 함</option>
              ${accounts.map(a => `
                <option value="${esc(a.id)}" data-acc-type="${esc(a.type)}" ${rec && rec.accountId === a.id ? 'selected' : ''}>${esc(a.name)}</option>
              `).join('')}
            </select>
          </div>
        </div>

        <div class="form-row-2">
          <div class="form-group">
            <label class="form-label" id="rec-user-label">${type === 'income' ? '누구의 수입' : '결제자'}</label>
            <select id="rec-user" class="form-select">
              <option value="husband" ${!rec || rec.userId === 'husband' ? 'selected' : ''}>👨 ${esc(husbandName)}</option>
              <option value="wife" ${rec && rec.userId === 'wife' ? 'selected' : ''}>👩 ${esc(wifeName)}</option>
            </select>
          </div>
          <div class="form-group" id="rec-shared-group" ${type === 'income' ? 'style="display:none"' : ''}>
            <label class="form-label">공동/개인</label>
            <select id="rec-shared" class="form-select">
              <option value="shared" ${!rec || rec.sharedType === 'shared' ? 'selected' : ''}>👫 공동생활비</option>
              <option value="husband" ${rec && rec.sharedType === 'husband' ? 'selected' : ''}>👨 ${esc(husbandName)} 개인</option>
              <option value="wife" ${rec && rec.sharedType === 'wife' ? 'selected' : ''}>👩 ${esc(wifeName)} 개인</option>
            </select>
          </div>
        </div>

        <div class="form-actions">
          <button class="btn-secondary-sm" id="rec-cancel">취소</button>
          <button class="btn-primary-sm" id="rec-save">${rec ? '수정 저장' : '반복 거래 추가'}</button>
        </div>
      </div>
    `;
  }

  function bindEvents() {
    const $ = (sel) => containerEl.querySelector(sel);

    /* --- 계정 --- */
    const btnSignOut = $('#btn-signout');
    if (btnSignOut) btnSignOut.addEventListener('click', async () => {
      if (!confirm('로그아웃하시겠습니까? 이 기기의 데이터는 그대로 남아 있습니다.')) return;
      await signOut();
      window.location.reload();
    });

    const btnSignIn = $('#btn-signin');
    if (btnSignIn) btnSignIn.addEventListener('click', () => {
      clearSkipLogin();
      showLoginGate({ onSuccess: () => window.location.reload(), onSkip: () => refreshApp() });
    });

    /* --- 테마 (기기별) --- */
    $('#select-theme').addEventListener('change', (e) => {
      StorageManager.saveDeviceSettings({ theme: e.target.value });
      applyTheme(e.target.value);
    });

    /* --- 공유 설정 (클라우드 동기화) --- */
    $('#select-settlement').addEventListener('change', async (e) => {
      await StorageManager.saveSharedSettings({ settlementMode: e.target.value });
      refreshApp();
    });

    $('#check-card-settle').addEventListener('change', async (e) => {
      await StorageManager.saveSharedSettings({ cardSettlementEnabled: e.target.checked });
      refreshApp();
    });

    /* --- 사용자 이름 --- */
    const btnSaveUsers = $('#btn-save-users');
    btnSaveUsers.addEventListener('click', async () => {
      const hName = $('#input-husband-name').value.trim() || '남편';
      const wName = $('#input-wife-name').value.trim() || '아내';
      const currentUsers = StorageManager.getUsers();
      currentUsers.husband.name = hName;
      currentUsers.wife.name = wName;

      btnSaveUsers.disabled = true;
      await StorageManager.saveUsers(currentUsers);
      btnSaveUsers.disabled = false;
      refreshApp();
    });

    /* --- 반복 거래 --- */
    $('#btn-add-recurring').addEventListener('click', () => {
      showRecurringForm = true;
      editingRecurringId = null;
      render();
    });

    containerEl.querySelectorAll('.btn-edit-rec').forEach(btn => {
      btn.addEventListener('click', () => {
        showRecurringForm = true;
        editingRecurringId = btn.getAttribute('data-id');
        render();
      });
    });

    containerEl.querySelectorAll('.btn-toggle-rec').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const item = StorageManager.getRecurring().find(r => r.id === id);
        if (!item) return;
        await StorageManager.updateRecurring(id, { active: item.active === false });
        render();
      });
    });

    containerEl.querySelectorAll('.btn-del-rec').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const item = StorageManager.getRecurring().find(r => r.id === id);
        if (!item) return;
        if (!confirm(`[${item.name}] 반복 거래를 삭제하시겠습니까?\n이미 만들어진 과거 거래는 삭제되지 않습니다.`)) return;
        await StorageManager.deleteRecurring(id);
        render();
      });
    });

    const recForm = $('#recurring-form');
    if (recForm) {
      recForm.querySelector('#rec-cancel').addEventListener('click', () => {
        showRecurringForm = false;
        editingRecurringId = null;
        render();
      });

      // 수입/지출 전환 시: 카테고리·계좌 목록과 '결제자/공동·개인' 항목을 유형에 맞춥니다
      const syncRecType = () => {
        const t = recForm.querySelector('#rec-type').value;
        const isIncome = t === 'income';
        const catSel = recForm.querySelector('#rec-category');
        Array.from(catSel.options).forEach(o => { o.hidden = o.dataset.type !== t; o.disabled = o.dataset.type !== t; });
        if (catSel.selectedOptions[0] && catSel.selectedOptions[0].disabled) {
          const first = Array.from(catSel.options).find(o => !o.disabled);
          catSel.value = first ? first.value : '';
        }
        const accSel = recForm.querySelector('#rec-account');
        Array.from(accSel.options).forEach(o => {
          const off = isIncome && o.dataset.accType === 'card';
          o.hidden = off; o.disabled = off;
        });
        if (accSel.selectedOptions[0] && accSel.selectedOptions[0].disabled) accSel.value = '';
        const lbl = recForm.querySelector('#rec-user-label');
        if (lbl) lbl.textContent = isIncome ? '누구의 수입' : '결제자';
        const sg = recForm.querySelector('#rec-shared-group');
        if (sg) sg.style.display = isIncome ? 'none' : '';
      };
      recForm.querySelector('#rec-type').addEventListener('change', syncRecType);
      syncRecType();

      recForm.querySelector('#rec-save').addEventListener('click', async () => {
        const name = recForm.querySelector('#rec-name').value.trim();
        if (!name) { alert('이름을 입력해주세요.'); return; }

        const amount = parseAmount(recForm.querySelector('#rec-amount').value);
        if (amount === null || amount <= 0) { alert('금액을 0원보다 크게 입력해주세요.'); return; }

        const type = recForm.querySelector('#rec-type').value;
        const categoryId = recForm.querySelector('#rec-category').value;
        const catObj = StorageManager.getCategories().find(c => c.id === categoryId);
        if (!catObj || catObj.type !== type) {
          alert(`선택한 카테고리가 '${type === 'income' ? '수입' : '지출'}' 유형과 맞지 않습니다.`);
          return;
        }

        const payload = {
          name,
          amount,
          type,
          categoryId,
          accountId: recForm.querySelector('#rec-account').value,
          userId: recForm.querySelector('#rec-user').value,
          sharedType: recForm.querySelector('#rec-shared').value,
          dayOfMonth: Math.min(Math.max(Number(recForm.querySelector('#rec-day').value) || 1, 1), 31),
          amountMode: recForm.querySelector('#rec-amount-mode').value === 'variable' ? 'variable' : 'fixed',
          paymentMethod: 'bank',
          memo: name
        };

        if (editingRecurringId) await StorageManager.updateRecurring(editingRecurringId, payload);
        else await StorageManager.addRecurring(payload);

        showRecurringForm = false;
        editingRecurringId = null;
        render();
      });
    }

    const btnRunRec = $('#btn-run-recurring');
    if (btnRunRec) {
      btnRunRec.addEventListener('click', async () => {
        btnRunRec.disabled = true;
        const created = await StorageManager.applyRecurring(currentMonthStr);
        btnRunRec.disabled = false;
        alert(created.length > 0
          ? `${currentMonthStr} 반복 거래 ${created.length}건을 생성했습니다.`
          : `${currentMonthStr} 에 새로 생성할 반복 거래가 없습니다. (이미 모두 생성되었습니다)`);
        refreshApp();
      });
    }

    const btnRunCard = $('#btn-run-card');
    if (btnRunCard) {
      btnRunCard.addEventListener('click', async () => {
        btnRunCard.disabled = true;
        const r = await StorageManager.applyCardSettlements(currentMonthStr);
        btnRunCard.disabled = false;
        const n = r.created.length + r.updated.length + r.removed.length;
        alert(n === 0
          ? '갱신할 카드 결제 거래가 없습니다.\n(결제일이 아직 안 지났거나, 카드에 결제일/결제 통장이 설정되지 않았습니다)'
          : `카드 결제 거래를 갱신했습니다. 생성 ${r.created.length}건 · 금액 보정 ${r.updated.length}건 · 삭제 ${r.removed.length}건`);
        refreshApp();
      });
    }

    /* --- 예산 --- */
    const btnSaveBudgets = $('#btn-save-budgets');
    btnSaveBudgets.addEventListener('click', async () => {
      const entries = Array.from(containerEl.querySelectorAll('.input-cat-budget')).map(input => ({
        categoryId: input.getAttribute('data-catid'),
        amount: parseAmount(input.value) || 0
      }));

      btnSaveBudgets.disabled = true;
      btnSaveBudgets.textContent = '저장 중…';
      const ok = await StorageManager.setCategoryBudgets(currentMonthStr, entries);
      btnSaveBudgets.disabled = false;
      btnSaveBudgets.textContent = '예산 일괄 저장';

      alert(ok
        ? '예산 설정이 저장되었습니다!'
        : '이 기기에는 저장했지만 클라우드 전송에 실패했습니다.\n인터넷이 연결되면 자동으로 다시 전송됩니다.');
      refreshApp();
    });

    /* --- 카테고리 --- */
    $('#btn-add-category').addEventListener('click', async () => {
      const name = prompt('새 카테고리 이름을 입력하세요 (예: 반려동물):');
      if (!name || !name.trim()) return;

      const type = confirm('수입 카테고리인가요?\n\n[확인] 수입   /   [취소] 지출') ? 'income' : 'expense';
      const icon = (prompt('카테고리 아이콘 이모지를 입력하세요:', '📌') || '📌').trim() || '📌';

      const currentCats = StorageManager.getCategories();
      currentCats.push({
        id: 'cat_custom_' + Date.now(),
        type, name: name.trim(), icon,
        color: type === 'income' ? '#10b981' : '#f59e0b'
      });
      await StorageManager.saveCategories(currentCats);
      refreshApp();
    });

    containerEl.querySelectorAll('.btn-rename-cat').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const cats = StorageManager.getCategories();
        const cat = cats.find(c => c.id === id);
        if (!cat) return;

        const name = prompt('카테고리 이름을 입력하세요:', cat.name);
        if (name === null || !name.trim()) return;
        const icon = (prompt('아이콘 이모지:', cat.icon) || cat.icon).trim() || cat.icon;

        cat.name = name.trim();
        cat.icon = icon;
        await StorageManager.saveCategories(cats);
        refreshApp();
      });
    });

    containerEl.querySelectorAll('.btn-del-cat').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const used = StorageManager.getTransactions().filter(t => t.categoryId === id).length;
        const usedByRec = StorageManager.getRecurring().filter(r => r.categoryId === id).length;

        let msg = used > 0
          ? `이 카테고리를 사용하는 거래가 ${used}건 있습니다.\n삭제하면 해당 거래는 '미분류'로 표시됩니다.`
          : '이 카테고리를 삭제하시겠습니까?';
        if (usedByRec > 0) msg += `\n\n⚠️ 이 카테고리를 쓰는 반복 거래가 ${usedByRec}건 있습니다.`;
        if (!confirm(msg + '\n\n계속할까요?')) return;

        await StorageManager.saveCategories(StorageManager.getCategories().filter(c => c.id !== id));
        refreshApp();
      });
    });

    /* --- 데이터 --- */
    $('#btn-export-json').addEventListener('click', () => {
      const blob = new Blob([StorageManager.exportBackupData()], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `our_house_budget_backup_${todayLocalStr()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });

    $('#input-import-json').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (event) => {
        const result = await StorageManager.importBackupData(event.target.result);
        alert(result.ok
          ? `데이터가 복원되었습니다. (거래 ${result.count}건)`
          : `복원에 실패했습니다.\n\n사유: ${result.reason}`);
        e.target.value = '';
        refreshApp();
      };
      reader.onerror = () => alert('파일을 읽을 수 없습니다.');
      reader.readAsText(file);
    });

    $('#btn-purge-sample').addEventListener('click', async () => {
      if (!confirm('초기 버전이 자동으로 넣어둔 샘플 데이터를 삭제합니다.\n직접 입력하신 내역은 그대로 유지됩니다.\n\n계속할까요?')) return;
      const removed = await StorageManager.purgeSampleData();
      alert(removed > 0
        ? `샘플 거래 ${removed}건과 샘플 예산/목표/계좌를 삭제했습니다.`
        : '삭제할 샘플 데이터가 없습니다.');
      refreshApp();
    });

    $('#btn-clear-all').addEventListener('click', async () => {
      if (!confirm('정말로 모든 데이터를 삭제하시겠습니까?\n\n⚠️ 이 기기뿐 아니라 클라우드(배우자 기기 포함)의 데이터도 함께 삭제됩니다.')) return;
      if (!confirm('되돌릴 수 없습니다. 먼저 백업 파일을 받아두셨나요?\n\n[확인]을 누르면 삭제를 진행합니다.')) return;
      await StorageManager.clearAllData();
      alert('모든 데이터가 초기화되었습니다.');
      refreshApp();
    });

    const btnExitDemo = $('#btn-exit-demo');
    if (btnExitDemo) btnExitDemo.addEventListener('click', () => {
      if (!confirm('샘플 데이터를 모두 지우고 빈 가계부로 시작합니다. 계속할까요?')) return;
      StorageManager.exitDemoMode();
      window.location.href = window.location.pathname;
    });

    const btnRetry = $('#btn-retry-sync');
    if (btnRetry) btnRetry.addEventListener('click', async () => {
      btnRetry.disabled = true;
      btnRetry.textContent = '전송 중…';
      const ok = await StorageManager.flushQueue();
      alert(ok ? '모든 변경사항이 클라우드에 전송되었습니다.' : '아직 전송하지 못했습니다. 인터넷 연결을 확인해주세요.');
      refreshApp();
    });
  }

  render();
}
