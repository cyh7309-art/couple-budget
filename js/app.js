/**
 * Main Application Orchestrator & Router with Supabase Realtime Sync
 * Couple Finance Dashboard ("우리집 가계부")
 */

import { StorageManager, isDemoMode } from './storage.js';
import { SupabaseSyncEngine, getConnectionStatus, onStatusChange } from './supabaseClient.js';
import { getPreviousMonthStr, getNextMonthStr } from './calculations.js';
import { currentMonthLocalStr } from './utils.js';
import { restoreSession, isAuthenticated, hasSkippedLogin, showLoginGate, onAuthChange, signOut } from './auth.js';
import { applyTheme, watchSystemTheme } from './theme.js';
import { initMobileViewport } from './mobileViewport.js';

import { renderDashboardView } from './ui/dashboardView.js';
import { renderTransactionsView } from './ui/transactionsView.js';
import { renderStatisticsView } from './ui/statisticsView.js';
import { renderGoalsView } from './ui/goalsView.js';
import { renderChallengeView } from './ui/challengeView.js';
import { renderSettingsView } from './ui/settingsView.js';
import { TransactionModal } from './ui/transactionModal.js';

class CoupleFinanceApp {
  constructor() {
    this.activeTab = 'dashboard';
    this.pendingRender = false;
    this.syncState = isDemoMode() ? 'demo' : 'checking';

    // ✅ 기기 시계를 그대로 신뢰합니다 (기존의 '2026년 이전이면 2026-09' 하드코딩 제거)
    this.currentMonthStr = currentMonthLocalStr();

    StorageManager.init();

    // 테마 적용 (첫 페인트 전에) — 테마는 기기별 설정입니다
    applyTheme(StorageManager.getDeviceSettings().theme);
    watchSystemTheme(() => StorageManager.getDeviceSettings().theme);

    this.initDOM();
    this.initModal();
    this.bindGlobalEvents();

    this.render();
    this.initRecurring();
    this.initRealtimeSync();
  }

  /**
   * 이번 달 자동 처리:
   *  1) 금액이 고정된 반복 거래 생성
   *  2) 결제일이 지난 카드 청구분에 대해 '통장 → 카드' 결제 이체 생성/보정
   * 둘 다 멱등이라 여러 번 실행해도 안전합니다.
   */
  async initRecurring() {
    const month = currentMonthLocalStr();
    try {
      const created = await StorageManager.applyRecurring(month);
      if (created.length > 0) console.log(`[반복거래] ${created.length}건 자동 생성`);

      // 카드 결제는 이번 달 + 지난달까지 확인합니다.
      // (월초에 접속하면 지난달 결제 건이 아직 안 만들어졌을 수 있습니다)
      const cardResults = [];
      for (const m of [getPreviousMonthStr(month), month]) {
        cardResults.push(await StorageManager.applyCardSettlements(m));
      }
      const cardChanges = cardResults.reduce(
        (n, r) => n + r.created.length + r.updated.length + r.removed.length, 0);
      if (cardChanges > 0) console.log(`[카드결제] ${cardChanges}건 생성/보정`);

      if (created.length > 0 || cardChanges > 0) this.requestRender();
    } catch (e) {
      console.warn('자동 거래 생성 실패:', e);
    }
  }

  async initRealtimeSync() {
    if (isDemoMode()) {
      this.updateCloudBadge();
      return;
    }

    // 연결 상태가 바뀌면 뱃지를 즉시 갱신
    onStatusChange(() => this.updateCloudBadge());

    // ✅ 로그인 게이트: 인증된 사용자만 클라우드 데이터에 접근합니다.
    await restoreSession();
    onAuthChange(() => this.updateCloudBadge());

    if (!isAuthenticated() && !hasSkippedLogin()) {
      showLoginGate({
        onSuccess: () => this.startCloudSync(),
        onSkip: () => { this.updateCloudBadge(); }
      });
      this.updateCloudBadge();
      return;
    }

    await this.startCloudSync();
  }

  async startCloudSync() {
    await SupabaseSyncEngine.checkConnection();
    this.syncState = await StorageManager.syncFromCloud();
    await this.initRecurring();
    this.updateCloudBadge();
    this.render();

    SupabaseSyncEngine.subscribeToChanges(async () => {
      this.syncState = await StorageManager.syncFromCloud();
      this.updateCloudBadge();
      this.requestRender();
    });

    // 오프라인에서 복귀하면 밀린 변경분을 다시 올린다
    window.addEventListener('online', async () => {
      this.syncState = await StorageManager.syncFromCloud();
      this.updateCloudBadge();
      this.requestRender();
    });

    // 밀린 큐가 남아 있으면 주기적으로 재시도
    setInterval(async () => {
      if (StorageManager.getPendingCount() > 0) {
        this.syncState = await StorageManager.syncFromCloud();
        this.updateCloudBadge();
        this.requestRender();
      }
    }, 30000);
  }

  /** 모달 입력 중에는 화면을 갈아엎지 않고 닫힌 뒤에 반영 */
  requestRender() {
    if (this.modal && this.modal.isOpen()) {
      this.pendingRender = true;
      return;
    }
    this.render();
  }

  updateCloudBadge() {
    const badgeEl = document.getElementById('cloud-sync-badge');
    if (!badgeEl) return;

    const pending = StorageManager.getPendingCount();
    badgeEl.onclick = null;

    if (isDemoMode()) {
      badgeEl.className = 'cloud-badge badge-offline';
      badgeEl.innerHTML = '<span class="badge-ico">🧪</span><span class="badge-text">데모 모드 (동기화 안 함)</span>';
      badgeEl.title = '샘플 데이터를 보는 중입니다. 클라우드에 저장되지 않습니다. 설정에서 실사용 모드로 전환하세요.';
      return;
    }

    if (pending > 0) {
      badgeEl.className = 'cloud-badge badge-warning-sync';
      badgeEl.innerHTML = `<span class="badge-ico">⏳</span><span class="badge-text">저장 대기 ${pending}건</span>`;
      badgeEl.title = `아직 클라우드에 올리지 못한 변경이 ${pending}건 있습니다. 인터넷이 연결되면 자동으로 전송됩니다.`;
      return;
    }

    if (!isAuthenticated()) {
      badgeEl.className = 'cloud-badge badge-offline';
      badgeEl.innerHTML = '<span class="badge-ico">🔒</span><span class="badge-text">로컬 모드 (로그인 필요)</span>';
      badgeEl.title = '로그인하면 배우자 기기와 실시간으로 동기화됩니다. 클릭하여 로그인하세요.';
      badgeEl.onclick = () => {
        showLoginGate({
          onSuccess: () => this.startCloudSync(),
          onSkip: () => this.updateCloudBadge()
        });
      };
      return;
    }

    const status = getConnectionStatus();
    if (status === 'connected') {
      badgeEl.className = 'cloud-badge badge-connected';
      badgeEl.innerHTML = '<span class="badge-ico">☁️</span><span class="badge-text">실시간 연동됨</span>';
      badgeEl.title = 'Supabase 중앙 DB와 실시간 연동 중입니다.';
    } else if (status === 'missing_tables') {
      badgeEl.className = 'cloud-badge badge-error';
      badgeEl.innerHTML = '<span class="badge-ico">⚠️</span><span class="badge-text">DB 테이블 생성 필요 (클릭)</span>';
      badgeEl.title = 'Supabase SQL Editor 에서 supabase_setup.sql 을 실행해주세요.';
      badgeEl.onclick = () => {
        alert(
          'Supabase 프로젝트에 가계부 테이블이 아직 없습니다.\n\n' +
          '해결 방법:\n' +
          '1. Supabase 접속 → SQL Editor\n' +
          '2. 프로젝트 폴더의 supabase_setup.sql 전체를 붙여넣고 Run\n\n' +
          '이 스크립트는 테이블 생성과 함께 RLS(보안 정책)도 같이 적용합니다.'
        );
      };
    } else {
      badgeEl.className = 'cloud-badge badge-offline';
      badgeEl.innerHTML = '<span class="badge-ico">📱</span><span class="badge-text">로컬 모드</span>';
      badgeEl.title = '네트워크 연결 또는 Supabase 설정을 확인해주세요. 입력한 내용은 이 기기에 안전하게 보관됩니다.';
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
    this.monthSelector = document.querySelector('.month-selector');
    this.headerTabTitle = document.getElementById('header-tab-title');

    this.sidebarNavItems = document.querySelectorAll('.sidebar-nav .nav-item');
    this.bottomNavItems = document.querySelectorAll('.bottom-nav .b-nav-item:not(.fab-center-item)');
  }

  initModal() {
    const modalEl = document.getElementById('transaction-modal');
    this.modal = new TransactionModal(modalEl, () => {
      this.pendingRender = false;
      this.render();
    });

    // 모달이 닫힐 때 밀린 렌더가 있으면 반영
    const observer = new MutationObserver(() => {
      if (!this.modal.isOpen() && this.pendingRender) {
        this.pendingRender = false;
        this.render();
      }
    });
    observer.observe(modalEl, { attributes: true, attributeFilter: ['class'] });
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
      this.currentMonthStr = currentMonthLocalStr();
      this.render();
    });

    [this.btnHeaderAdd, this.btnFabAdd].forEach(btn => {
      if (btn) btn.addEventListener('click', () => this.modal.open(null, this.currentMonthStr));
    });

    [...this.sidebarNavItems, ...this.bottomNavItems].forEach(item => {
      item.addEventListener('click', () => this.switchTab(item.getAttribute('data-tab')));
    });
  }

  switchTab(tabName) {
    if (!tabName) return;
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
    if (this.sidebarUserBadges) {
      this.sidebarUserBadges.textContent = `👨 ${users.husband.name} · 👩 ${users.wife.name}`;
    }

    // 월 단위가 아닌 화면에서는 월 선택을 감추고 화면 제목을 보여줍니다
    const monthless = this.activeTab === 'challenge';
    if (this.monthSelector) this.monthSelector.hidden = monthless;
    if (this.headerTabTitle) this.headerTabTitle.hidden = !monthless;

    this.updateCloudBadge();
  }

  render() {
    this.updateHeaderAndSidebar();

    if (this.activeTab === 'dashboard') {
      renderDashboardView(this.viewContainer, this.currentMonthStr, (tab) => this.switchTab(tab), () => this.render());
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
    } else if (this.activeTab === 'challenge') {
      renderChallengeView(this.viewContainer, () => this.render());
    } else if (this.activeTab === 'settings') {
      renderSettingsView(this.viewContainer, this.currentMonthStr, () => this.render());
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initMobileViewport();
  window.app = new CoupleFinanceApp();
  window.coupleSignOut = async () => {
    await signOut();
    window.location.reload();
  };
});
