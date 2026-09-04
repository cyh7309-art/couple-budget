/**
 * Main Application Orchestrator & Router with Supabase Realtime Sync & Diagnostics
 * Couple Finance Dashboard ("우리집 가계부")
 */

import { StorageManager } from './storage.js';
import { SupabaseSyncEngine, getConnectionStatus } from './supabaseClient.js';
import { getPreviousMonthStr, getNextMonthStr } from './calculations.js';

import { renderDashboardView } from './ui/dashboardView.js';
import { renderTransactionsView } from './ui/transactionsView.js';
import { renderStatisticsView } from './ui/statisticsView.js';
import { renderGoalsView } from './ui/goalsView.js';
import { renderSettingsView } from './ui/settingsView.js';
import { TransactionModal } from './ui/transactionModal.js';

class CoupleFinanceApp {
  constructor() {
    this.activeTab = 'dashboard';
    
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = String(today.getMonth() + 1).padStart(2, '0');
    
    this.currentMonthStr = (currentYear >= 2026) ? `${currentYear}-${currentMonth}` : '2026-09';

    this.initStorage();
    this.initDOM();
    this.initModal();
    this.bindGlobalEvents();
    this.initRealtimeSync();

    this.render();
  }

  initStorage() {
    StorageManager.init();
  }

  async initRealtimeSync() {
    await StorageManager.syncFromCloud();
    await SupabaseSyncEngine.checkConnection();
    this.updateCloudBadge();
    this.render();

    SupabaseSyncEngine.subscribeToChanges(async (payload) => {
      console.log('⚡ Real-time update from partner device:', payload);
      await StorageManager.syncFromCloud();
      this.render();
    });
  }

  updateCloudBadge() {
    const badgeEl = document.getElementById('cloud-sync-badge');
    if (!badgeEl) return;

    const status = getConnectionStatus();
    if (status === 'connected') {
      badgeEl.className = 'cloud-badge badge-connected';
      badgeEl.innerHTML = '☁️ 실시간 연동됨';
      badgeEl.title = 'Supabase 중앙 DB와 실시간 연동 중입니다.';
      badgeEl.onclick = null;
    } else if (status === 'missing_tables') {
      badgeEl.className = 'cloud-badge badge-error';
      badgeEl.innerHTML = '⚠️ DB 테이블 생성 필요 (클릭)';
      badgeEl.title = 'Supabase SQL Editor에서 쿼리를 실행하여 테이블을 생성해주세요.';
      badgeEl.onclick = () => {
        alert(
          'Supabase 프로젝트에 아직 가계부 데이터 테이블이 생성되지 않아 연동이 일시 중지되었습니다!\n\n' +
          '해결 방법 (30초 소요):\n' +
          '1. Supabase 접속 -> SQL Editor 이동\n' +
          '2. 안내해 드린 SQL 생성 스크립트를 복사하여 실행(Run)해주시면 바로 연동됩니다.'
        );
      };
    } else {
      badgeEl.className = 'cloud-badge badge-offline';
      badgeEl.innerHTML = '📱 로컬 모드';
      badgeEl.title = '네트워크 연결 또는 Supabase 설정을 확인해주세요.';
      badgeEl.onclick = null;
    }
  }

  initDOM() {
    this.viewContainer = document.getElementById('main-view-container');
    this.displayMonth = document.getElementById('display-current-month');
    
    this.btnPrevMonth = document.getElementById('btn-prev-month');
    this.btnNextMonth = document.getElementById('btn-next-month');
    this.btnResetToday = document.getElementById('btn-reset-today');

    this.btnHeaderAdd = document.getElementById('btn-header-quick-add');
    this.btnFabAdd = document.getElementById('btn-fab-add');

    this.sidebarUserBadges = document.getElementById('sidebar-user-badges');

    this.sidebarNavItems = document.querySelectorAll('.sidebar-nav .nav-item');
    this.bottomNavItems = document.querySelectorAll('.bottom-nav .b-nav-item:not(.fab-center-item)');
  }

  initModal() {
    const modalEl = document.getElementById('transaction-modal');
    this.modal = new TransactionModal(modalEl, () => {
      this.render();
    });
  }

  bindGlobalEvents() {
    this.btnPrevMonth.addEventListener('click', () => {
      this.currentMonthStr = getPreviousMonthStr(this.currentMonthStr);
      this.render();
    });

    this.btnNextMonth.addEventListener('click', () => {
      this.currentMonthStr = getNextMonthStr(this.currentMonthStr);
      this.render();
    });

    this.btnResetToday.addEventListener('click', () => {
      const today = new Date();
      this.currentMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
      this.render();
    });

    if (this.btnHeaderAdd) {
      this.btnHeaderAdd.addEventListener('click', () => {
        this.modal.open(null, this.currentMonthStr);
      });
    }

    if (this.btnFabAdd) {
      this.btnFabAdd.addEventListener('click', () => {
        this.modal.open(null, this.currentMonthStr);
      });
    }

    this.sidebarNavItems.forEach(item => {
      item.addEventListener('click', () => {
        const tab = item.getAttribute('data-tab');
        this.switchTab(tab);
      });
    });

    this.bottomNavItems.forEach(item => {
      item.addEventListener('click', () => {
        const tab = item.getAttribute('data-tab');
        this.switchTab(tab);
      });
    });
  }

  switchTab(tabName) {
    this.activeTab = tabName;

    this.sidebarNavItems.forEach(item => {
      item.classList.toggle('active', item.getAttribute('data-tab') === tabName);
    });

    this.bottomNavItems.forEach(item => {
      item.classList.toggle('active', item.getAttribute('data-tab') === tabName);
    });

    this.render();
  }

  updateHeaderAndSidebar() {
    const [year, month] = this.currentMonthStr.split('-');
    if (this.displayMonth) {
      this.displayMonth.textContent = `${year}년 ${parseInt(month, 10)}월`;
    }

    const users = StorageManager.getUsers();
    const hName = users.husband ? users.husband.name : '남편';
    const wName = users.wife ? users.wife.name : '아내';

    if (this.sidebarUserBadges) {
      this.sidebarUserBadges.innerHTML = `<span>👨 ${hName}</span> · <span>👩 ${wName}</span>`;
    }

    this.updateCloudBadge();
  }

  render() {
    this.updateHeaderAndSidebar();

    if (this.activeTab === 'dashboard') {
      renderDashboardView(this.viewContainer, this.currentMonthStr, (tab) => this.switchTab(tab));
    } else if (this.activeTab === 'transactions') {
      renderTransactionsView(
        this.viewContainer, 
        this.currentMonthStr, 
        (editingTxId) => this.modal.open(editingTxId, this.currentMonthStr),
        () => this.render()
      );
    } else if (this.activeTab === 'statistics') {
      renderStatisticsView(this.viewContainer, this.currentMonthStr);
    } else if (this.activeTab === 'goals') {
      renderGoalsView(this.viewContainer, () => this.render());
    } else if (this.activeTab === 'settings') {
      renderSettingsView(this.viewContainer, this.currentMonthStr, () => this.render());
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.app = new CoupleFinanceApp();
});
