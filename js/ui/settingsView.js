/**
 * Settings View (설정 / 카테고리 / 예산 / 데이터 백업 & 복원)
 */

import { formatCurrency } from '../calculations.js';
import { StorageManager } from '../storage.js';

export function renderSettingsView(containerEl, currentMonthStr, refreshApp) {
  const users = StorageManager.getUsers();
  const categories = StorageManager.getCategories();
  const budgets = StorageManager.getBudgets();

  const husbandName = users.husband ? users.husband.name : '남편';
  const wifeName = users.wife ? users.wife.name : '아내';

  const monthBudgets = budgets.filter(b => b.month === currentMonthStr || !b.month);

  containerEl.innerHTML = `
    <!-- User Names Settings -->
    <div class="card settings-card">
      <h3 class="card-title">👨‍👩‍👧 부부 사용자 이름 설정</h3>
      <p class="card-desc">가계부에서 사용할 부부의 명칭을 설정하세요.</p>

      <div class="setting-form-row">
        <div class="form-group">
          <label class="form-label">👨 남편 이름</label>
          <input type="text" id="input-husband-name" class="form-input" value="${husbandName}" />
        </div>
        <div class="form-group">
          <label class="form-label">👩 아내 이름</label>
          <input type="text" id="input-wife-name" class="form-input" value="${wifeName}" />
        </div>
      </div>
      <button class="btn-primary-sm margin-top-sm" id="btn-save-users">사용자 이름 저장</button>
    </div>

    <!-- Monthly Budget Settings -->
    <div class="card settings-card margin-top">
      <div class="card-title-row">
        <div>
          <h3 class="card-title">💰 ${currentMonthStr} 카테고리별 예산 설정</h3>
          <p class="card-desc">이번 달 카테고리별 목표 예산을 설정합니다.</p>
        </div>
      </div>

      <div class="budget-settings-grid">
        ${categories.filter(c => c.type === 'expense').map(cat => {
          const bObj = monthBudgets.find(b => b.categoryId === cat.id);
          const amt = bObj ? bObj.amount : 0;

          return `
            <div class="budget-set-item">
              <div class="cat-set-label">
                <span class="cat-icon-badge">${cat.icon}</span>
                <span>${cat.name}</span>
              </div>
              <div class="budget-input-group">
                <input type="number" class="form-input input-cat-budget" data-catid="${cat.id}" value="${amt}" placeholder="0" step="10000" />
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
          <div class="cat-manage-card" style="border-left: 4px solid ${cat.color}">
            <div class="cat-manage-left">
              <span class="cat-manage-icon">${cat.icon}</span>
              <div>
                <strong class="cat-manage-name">${cat.name}</strong>
                <span class="badge ${cat.type === 'income' ? 'badge-income' : 'badge-expense'}">
                  ${cat.type === 'income' ? '수입' : '지출'}
                </span>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- Data Backup, Restore & Reset -->
    <div class="card settings-card margin-top">
      <h3 class="card-title">💾 데이터 저장 및 백업 / 복원</h3>
      <p class="card-desc">가계부 데이터를 JSON 파일로 내보내거나, 기존 백업 파일을 복원할 수 있습니다.</p>

      <div class="backup-btn-group">
        <button class="btn-primary-sm" id="btn-export-json">📥 데이터 백업 파일 다운로드 (JSON)</button>
        <label class="btn-secondary-sm" style="cursor: pointer; display: inline-block;">
          📤 백업 파일 복원 (JSON)
          <input type="file" id="input-import-json" accept=".json" style="display: none;" />
        </label>
        <button class="btn-danger-sm" id="btn-reload-sample">🔄 기본 샘플 데이터 다시 로드</button>
        <button class="btn-danger-sm" id="btn-clear-all">🗑️ 모든 데이터 초기화</button>
      </div>
    </div>
  `;

  // Bind Events
  const btnSaveUsers = containerEl.querySelector('#btn-save-users');
  if (btnSaveUsers) {
    btnSaveUsers.addEventListener('click', () => {
      const hName = containerEl.querySelector('#input-husband-name').value.trim() || '남편';
      const wName = containerEl.querySelector('#input-wife-name').value.trim() || '아내';

      const currentUsers = StorageManager.getUsers();
      currentUsers.husband.name = hName;
      currentUsers.wife.name = wName;
      StorageManager.saveUsers(currentUsers);

      alert('부부 사용자 이름이 변경되었습니다!');
      refreshApp();
    });
  }

  const btnSaveBudgets = containerEl.querySelector('#btn-save-budgets');
  if (btnSaveBudgets) {
    btnSaveBudgets.addEventListener('click', () => {
      const budgetInputs = containerEl.querySelectorAll('.input-cat-budget');
      budgetInputs.forEach(input => {
        const catId = input.getAttribute('data-catid');
        const amt = Number(input.value || 0);
        StorageManager.setCategoryBudget(currentMonthStr, catId, amt);
      });

      alert('예산 설정이 저장되었습니다!');
      refreshApp();
    });
  }

  const btnAddCategory = containerEl.querySelector('#btn-add-category');
  if (btnAddCategory) {
    btnAddCategory.addEventListener('click', () => {
      const name = prompt('새 카테고리 이름을 입력하세요 (예: 🐱 반려동물):');
      if (!name) return;
      const type = confirm('수입 카테고리인가요? (확인: 수입, 취소: 지출)') ? 'income' : 'expense';
      const icon = prompt('카테고리 아이콘 이모지를 입력하세요:', '📌') || '📌';

      const newCat = {
        id: 'cat_custom_' + Date.now(),
        type,
        name,
        icon,
        color: type === 'income' ? '#10b981' : '#f59e0b'
      };

      const currentCats = StorageManager.getCategories();
      currentCats.push(newCat);
      StorageManager.saveCategories(currentCats);

      alert('새 카테고리가 추가되었습니다!');
      refreshApp();
    });
  }

  // Backup Export
  const btnExport = containerEl.querySelector('#btn-export-json');
  if (btnExport) {
    btnExport.addEventListener('click', () => {
      const jsonStr = StorageManager.exportBackupData();
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `our_house_budget_backup_${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  // Backup Import
  const inputImport = containerEl.querySelector('#input-import-json');
  if (inputImport) {
    inputImport.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const success = StorageManager.importBackupData(event.target.result);
        if (success) {
          alert('데이터가 성공적으로 복원되었습니다!');
          refreshApp();
        } else {
          alert('백업 파일 형식이 올바르지 않습니다.');
        }
      };
      reader.readAsText(file);
    });
  }

  // Reload Sample Data
  const btnReloadSample = containerEl.querySelector('#btn-reload-sample');
  if (btnReloadSample) {
    btnReloadSample.addEventListener('click', () => {
      if (confirm('초기 샘플 데이터로 복원하시겠습니까? (기존 데이터가 덮어씌워집니다)')) {
        StorageManager.resetToSampleData();
        alert('샘플 데이터가 복원되었습니다.');
        refreshApp();
      }
    });
  }

  // Clear All
  const btnClearAll = containerEl.querySelector('#btn-clear-all');
  if (btnClearAll) {
    btnClearAll.addEventListener('click', () => {
      if (confirm('정말로 모든 데이터를 삭제하시겠습니까?')) {
        StorageManager.clearAllData();
        alert('모든 데이터가 초기화되었습니다.');
        refreshApp();
      }
    });
  }
}
