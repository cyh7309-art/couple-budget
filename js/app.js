/**
 * Main Application Orchestrator & Router
 * Couple Finance Dashboard ("우리집 가계부")
 */

import { StorageManager } from './storage.js';
import { getPreviousMonthStr, getNextMonthStr } from './calculations.js';

import { renderDashboardView } from './ui/dashboardView.js';
import { renderTransactionsView } from './ui/transactionsView.js';
import { renderStatisticsView } from './ui/statisticsView.js';
import { renderGoalsView } from './ui/goalsView.js';
import { renderSettingsView } from './ui/settingsView.js';
import { TransactionModal } from './ui/transactionModal.js';

class CoupleFinanceApp {
  constructor() {
    this.activeTab = 'dashboard'; // 'dashboard' | 'transactions' | 'statistics' | 'goals' | 'settings'
    
    // Default month string: '2026-09' (or current calendar month if later)
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = String(today.getMonth() + 1).padStart(2, '0');
    
    // If year is 2026 or later, use actual date; default to '2026-09' for preloaded sample consistency
    this.currentMonthStr = (currentYear >= 2026) ? `${currentYear}-${currentMonth}` : '2026-09';

    this.initStorage();
    this.initDOM();
    this.initModal();
    this.bindGlobalEvents();

    this.render();
  }

  initStorage() {
    StorageManager.init();
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
      // On save success callback
      this.render();
    });
  }

  bindGlobalEvents() {
    // Month navigation
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

    // Quick Add Button handlers
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

    // Sidebar navigation
    this.sidebarNavItems.forEach(item => {
      item.addEventListener('click', () => {
        const tab = item.getAttribute('data-tab');
        this.switchTab(tab);
      });
    });

    // Bottom navigation
    this.bottomNavItems.forEach(item => {
      item.addEventListener('click', () => {
        const tab = item.getAttribute('data-tab');
        this.switchTab(tab);
      });
    });
  }

  switchTab(tabName) {
    this.activeTab = tabName;

    // Update active UI classes
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
  }

  render() {
    this.updateHeaderAndSidebar();

    // Render active tab view
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

// Instantiate on DOM content ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new CoupleFinanceApp();
});
