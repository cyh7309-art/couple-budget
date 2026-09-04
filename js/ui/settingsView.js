/**
 * Settings View (설정 / 카테고리 / 예산 / 데이터 백업 & 복원)
 */

import { getBudgetsForMonth } from '../calculations.js';
import { StorageManager, isDemoMode } from '../storage.js';
import { esc, parseAmount, todayLocalStr } from '../utils.js';
import { isAuthenticated, getSession, showLoginGate, signOut, clearSkipLogin } from '../auth.js';

export function renderSettingsView(containerEl, currentMonthStr, refreshApp) {
  const users = StorageManager.getUsers();
  const categories = StorageManager.getCategories();
  const budgets = StorageManager.getBudgets();

  const husbandName = users.husband.name;
  const wifeName = users.wife.name;

  const monthBudgets = getBudgetsForMonth(budgets, currentMonthStr);
  const inheritedFrom = monthBudgets.length > 0 && monthBudgets[0].inherited
    ? (monthBudgets[0].inheritedFrom || null)
    : null;

  const pendingCount = StorageManager.getPendingCount();

  containerEl.innerHTML = `
    ${isDemoMode() ? `
      <div class="card settings-card" style="border-left:4px solid #f59e0b">
        <h3 class="card-title">🧪 지금은 데모(샘플) 모드입니다</h3>
        <p class="card-desc">
          화면에 보이는 거래·예산·목표·계좌는 전부 <strong>가짜 샘플 데이터</strong>이며,
          클라우드에 저장되지 않고 배우자 기기와도 공유되지 않습니다.
        </p>
        <button class="btn-primary-sm margin-top-sm" id="btn-exit-demo">✅ 실사용 모드로 전환 (샘플 삭제하고 빈 가계부로 시작)</button>
      </div>
    ` : ''}

    ${pendingCount > 0 ? `
      <div class="card settings-card" style="border-left:4px solid #f59e0b">
        <h3 class="card-title">⏳ 클라우드에 올리지 못한 변경 ${pendingCount}건</h3>
        <p class="card-desc">
          오프라인 상태에서 입력한 내용은 이 기기에 안전하게 보관되어 있으며,
          인터넷이 연결되면 자동으로 전송됩니다. 지금 바로 시도할 수도 있습니다.
        </p>
        <button class="btn-primary-sm margin-top-sm" id="btn-retry-sync">🔄 지금 다시 전송</button>
      </div>
    ` : ''}

    <!-- Account / Sync -->
    ${isDemoMode() ? '' : `
      <div class="card settings-card ${pendingCount > 0 ? 'margin-top' : ''}">
        <h3 class="card-title">🔐 계정 및 동기화</h3>
        ${isAuthenticated() ? `
          <p class="card-desc">
            <strong>${esc((getSession() && getSession().user && getSession().user.email) || '')}</strong> 계정으로 로그인되어 있습니다.
            배우자 기기와 실시간으로 동기화됩니다.
          </p>
          <button class="btn-secondary-sm margin-top-sm" id="btn-signout">로그아웃</button>
        ` : `
          <p class="card-desc">
            현재 <strong>로그인하지 않은 상태</strong>입니다. 입력한 내용은 이 기기에만 저장되며
            배우자 기기와 공유되지 않습니다. 로그인하면 그동안 이 기기에 쌓인 내역도 함께 업로드됩니다.
          </p>
          <button class="btn-primary-sm margin-top-sm" id="btn-signin">로그인 / 계정 만들기</button>
        `}
      </div>
    `}

    <!-- User Names -->
    <div class="card settings-card margin-top">
      <h3 class="card-title">👨‍👩‍👧 부부 사용자 이름 설정</h3>
      <p class="card-desc">가계부에서 사용할 부부의 명칭을 설정하세요.</p>

      <div class="setting-form-row">
        <div class="form-group">
          <label class="form-label">👨 남편 이름</label>
          <input type="text" id="input-husband-name" class="form-input" maxlength="20" value="${esc(husbandName)}" />
        </div>
        <div class="form-group">
          <label class="form-label">👩 아내 이름</label>
          <input type="text" id="input-wife-name" class="form-input" maxlength="20" value="${esc(wifeName)}" />
        </div>
      </div>
      <button class="btn-primary-sm margin-top-sm" id="btn-save-users">사용자 이름 저장</button>
    </div>

    <!-- Monthly Budgets -->
    <div class="card settings-card margin-top">
      <div class="card-title-row">
        <div>
          <h3 class="card-title">💰 ${esc(currentMonthStr)} 카테고리별 예산 설정</h3>
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

    <!-- Category Management -->
    <div class="card settings-card margin-top">
      <div class="card-title-row">
        <h3 class="card-title">🏷️ 카테고리 관리</h3>
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
            ${String(cat.id).startsWith('cat_custom_')
              ? `<button class="btn-icon btn-del-cat" data-id="${esc(cat.id)}" title="삭제">🗑️</button>`
              : ''}
          </div>
        `).join('')}
      </div>
      <p class="card-desc margin-top-sm">기본 카테고리는 통계 연속성을 위해 삭제할 수 없습니다. 직접 추가한 카테고리만 삭제됩니다.</p>
    </div>

    <!-- Data -->
    <div class="card settings-card margin-top">
      <h3 class="card-title">💾 데이터 저장 및 백업 / 복원</h3>
      <p class="card-desc">가계부 데이터를 JSON 파일로 내보내거나, 기존 백업 파일을 복원할 수 있습니다.</p>

      <div class="backup-btn-group">
        <button class="btn-primary-sm" id="btn-export-json">📥 데이터 백업 파일 다운로드 (JSON)</button>
        <label class="btn-secondary-sm" style="cursor: pointer; display: inline-block;">
          📤 백업 파일 복원 (JSON)
          <input type="file" id="input-import-json" accept=".json,application/json" style="display: none;" />
        </label>
        <button class="btn-secondary-sm" id="btn-purge-sample">🧹 샘플 데이터 정리 (로컬 + 클라우드)</button>
        <button class="btn-danger-sm" id="btn-clear-all">🗑️ 모든 데이터 초기화</button>
      </div>
      <p class="card-desc margin-top-sm">
        <strong>샘플 데이터 정리</strong>는 초기 버전이 자동으로 심어둔 예시 거래·예산·목표만 골라서 삭제합니다.
        직접 입력하신 내역은 건드리지 않습니다.
      </p>
    </div>
  `;

  /* ---------- 계정 ---------- */
  const btnSignOut = containerEl.querySelector('#btn-signout');
  if (btnSignOut) {
    btnSignOut.addEventListener('click', async () => {
      if (!confirm('로그아웃하시겠습니까? 이 기기의 데이터는 그대로 남아 있습니다.')) return;
      await signOut();
      window.location.reload();
    });
  }

  const btnSignIn = containerEl.querySelector('#btn-signin');
  if (btnSignIn) {
    btnSignIn.addEventListener('click', () => {
      clearSkipLogin();
      showLoginGate({
        onSuccess: () => window.location.reload(),
        onSkip: () => refreshApp()
      });
    });
  }

  /* ---------- 사용자 이름 ---------- */
  const btnSaveUsers = containerEl.querySelector('#btn-save-users');
  btnSaveUsers.addEventListener('click', async () => {
    const hName = containerEl.querySelector('#input-husband-name').value.trim() || '남편';
    const wName = containerEl.querySelector('#input-wife-name').value.trim() || '아내';

    const currentUsers = StorageManager.getUsers();
    currentUsers.husband.name = hName;
    currentUsers.wife.name = wName;

    btnSaveUsers.disabled = true;
    await StorageManager.saveUsers(currentUsers);
    btnSaveUsers.disabled = false;

    refreshApp();
  });

  /* ---------- 예산 일괄 저장 ---------- */
  const btnSaveBudgets = containerEl.querySelector('#btn-save-budgets');
  btnSaveBudgets.addEventListener('click', async () => {
    const entries = Array.from(containerEl.querySelectorAll('.input-cat-budget')).map(input => ({
      categoryId: input.getAttribute('data-catid'),
      amount: parseAmount(input.value) || 0
    }));

    btnSaveBudgets.disabled = true;
    btnSaveBudgets.textContent = '저장 중…';

    // ✅ 한 번의 일괄 upsert 로 저장하고, 완료된 뒤에 알림을 띄웁니다
    const ok = await StorageManager.setCategoryBudgets(currentMonthStr, entries);

    btnSaveBudgets.disabled = false;
    btnSaveBudgets.textContent = '예산 일괄 저장';

    alert(ok
      ? '예산 설정이 저장되었습니다!'
      : '이 기기에는 저장했지만 클라우드 전송에 실패했습니다.\n인터넷이 연결되면 자동으로 다시 전송됩니다.');
    refreshApp();
  });

  /* ---------- 카테고리 ---------- */
  containerEl.querySelector('#btn-add-category').addEventListener('click', async () => {
    const name = prompt('새 카테고리 이름을 입력하세요 (예: 반려동물):');
    if (!name || !name.trim()) return;

    const type = confirm('수입 카테고리인가요?\n\n[확인] 수입   /   [취소] 지출') ? 'income' : 'expense';
    const icon = (prompt('카테고리 아이콘 이모지를 입력하세요:', '📌') || '📌').trim() || '📌';

    const currentCats = StorageManager.getCategories();
    currentCats.push({
      id: 'cat_custom_' + Date.now(),
      type,
      name: name.trim(),
      icon,
      color: type === 'income' ? '#10b981' : '#f59e0b'
    });

    await StorageManager.saveCategories(currentCats);
    refreshApp();
  });

  containerEl.querySelectorAll('.btn-del-cat').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      const used = StorageManager.getTransactions().filter(t => t.categoryId === id).length;
      const msg = used > 0
        ? `이 카테고리를 사용하는 거래가 ${used}건 있습니다.\n삭제하면 해당 거래는 '미분류'로 표시됩니다. 계속할까요?`
        : '이 카테고리를 삭제하시겠습니까?';
      if (!confirm(msg)) return;

      await StorageManager.saveCategories(StorageManager.getCategories().filter(c => c.id !== id));
      refreshApp();
    });
  });

  /* ---------- 백업 내보내기 ---------- */
  containerEl.querySelector('#btn-export-json').addEventListener('click', () => {
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

  /* ---------- 백업 복원 ---------- */
  containerEl.querySelector('#input-import-json').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      // ✅ async 함수를 await 하지 않아 실패해도 "성공" 이라고 뜨던 버그 수정
      const result = await StorageManager.importBackupData(event.target.result);
      if (result.ok) {
        alert(`데이터가 복원되었습니다. (거래 ${result.count}건)`);
      } else {
        alert(`복원에 실패했습니다.\n\n사유: ${result.reason}`);
      }
      e.target.value = '';
      refreshApp();
    };
    reader.onerror = () => alert('파일을 읽을 수 없습니다.');
    reader.readAsText(file);
  });

  /* ---------- 샘플 데이터 정리 ---------- */
  containerEl.querySelector('#btn-purge-sample').addEventListener('click', async () => {
    if (!confirm('초기 버전이 자동으로 넣어둔 샘플 거래/예산/목표를 삭제합니다.\n직접 입력하신 내역은 그대로 유지됩니다.\n\n계속할까요?')) return;

    const removed = await StorageManager.purgeSampleData();
    alert(removed > 0
      ? `샘플 거래 ${removed}건과 샘플 예산/목표를 삭제했습니다.`
      : '삭제할 샘플 데이터가 없습니다.');
    refreshApp();
  });

  /* ---------- 전체 초기화 ---------- */
  containerEl.querySelector('#btn-clear-all').addEventListener('click', async () => {
    if (!confirm('정말로 모든 데이터를 삭제하시겠습니까?\n\n⚠️ 이 기기뿐 아니라 클라우드(배우자 기기 포함)의 데이터도 함께 삭제됩니다.')) return;
    if (!confirm('되돌릴 수 없습니다. 먼저 백업 파일을 받아두셨나요?\n\n[확인]을 누르면 삭제를 진행합니다.')) return;

    await StorageManager.clearAllData();
    alert('모든 데이터가 초기화되었습니다.');
    refreshApp();
  });

  /* ---------- 데모 모드 종료 ---------- */
  const btnExitDemo = containerEl.querySelector('#btn-exit-demo');
  if (btnExitDemo) {
    btnExitDemo.addEventListener('click', () => {
      if (!confirm('샘플 데이터를 모두 지우고 빈 가계부로 시작합니다. 계속할까요?')) return;
      StorageManager.exitDemoMode();
      window.location.href = window.location.pathname;
    });
  }

  /* ---------- 재전송 ---------- */
  const btnRetry = containerEl.querySelector('#btn-retry-sync');
  if (btnRetry) {
    btnRetry.addEventListener('click', async () => {
      btnRetry.disabled = true;
      btnRetry.textContent = '전송 중…';
      const ok = await StorageManager.flushQueue();
      alert(ok ? '모든 변경사항이 클라우드에 전송되었습니다.' : '아직 전송하지 못했습니다. 인터넷 연결을 확인해주세요.');
      refreshApp();
    });
  }
}
