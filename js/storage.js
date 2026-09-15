/**
 * LocalStorage + Supabase Hybrid Storage Manager
 * Couple Finance Dashboard ("우리집 가계부")
 *
 * 설계 원칙
 *  1) 로컬 저장이 항상 먼저 성공한다 (오프라인에서도 입력 가능).
 *  2) 클라우드 전송에 실패한 변경은 재시도 큐에 남는다 — 절대 조용히 버리지 않는다.
 *  3) 클라우드 데이터로 로컬을 "덮어쓰지" 않는다. id + updatedAt 기준으로 병합한다.
 *  4) 데모 모드(?demo=1)는 클라우드에 아무것도 쓰지 않는다.
 */

import {
  DEFAULT_USERS, DEFAULT_CATEGORIES, DEFAULT_BUDGETS, DEFAULT_GOALS, DEFAULT_ACCOUNTS,
  DEFAULT_DEVICE_SETTINGS, DEFAULT_SHARED_SETTINGS, DEFAULT_RECURRING, DEFAULT_SETTLEMENTS,
  LEGACY_CATEGORY_COLORS, CATEGORY_COLOR,
  DEMO_BUDGETS, DEMO_GOALS, DEMO_ACCOUNTS, DEMO_RECURRING, generateDemoTransactions,
  isSampleTransactionId, SAMPLE_BUDGET_IDS, SAMPLE_GOAL_IDS
} from './models.js';
import { SupabaseSyncEngine } from './supabaseClient.js';
import { calculateCardBilling, buildInstallmentSchedule } from './calculations.js';
import { todayLocalStr } from './utils.js';

const STORAGE_KEYS = {
  USERS: 'couple_finance_users',
  CATEGORIES: 'couple_finance_categories',
  TRANSACTIONS: 'couple_finance_transactions',
  BUDGETS: 'couple_finance_budgets',
  GOALS: 'couple_finance_goals',
  ACCOUNTS: 'couple_finance_accounts',
  RECURRING: 'couple_finance_recurring',
  SETTLEMENTS: 'couple_finance_settlements',
  SETTINGS: 'couple_finance_settings',              // 기기별 (테마 등)
  SHARED_SETTINGS: 'couple_finance_shared_settings', // 부부 공유 (정산 기준 등)
  QUEUE: 'couple_finance_sync_queue',
  SYNCED_ONCE: 'couple_finance_synced_once',
  DEMO: 'couple_finance_demo_mode'
};

/* ---------- Demo mode ---------- */
let _demoMode = null;
export function isDemoMode() {
  if (_demoMode === null) {
    let flag = false;
    try {
      const p = new URLSearchParams(window.location.search);
      if (p.get('demo') === '1') { localStorage.setItem(STORAGE_KEYS.DEMO, '1'); flag = true; }
      else if (p.get('demo') === '0') { localStorage.removeItem(STORAGE_KEYS.DEMO); flag = false; }
      else flag = localStorage.getItem(STORAGE_KEYS.DEMO) === '1';
    } catch (e) { flag = false; }
    _demoMode = flag;
  }
  return _demoMode;
}

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw);
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch (e) {
    console.warn('localStorage parse error for', key, e);
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.error('localStorage write failed (용량 초과 가능):', key, e);
    return false;
  }
}

/** 병합 시 어느 쪽이 최신인지 판단 */
function stampOf(item) {
  return item.updatedAt || item.createdAt || '';
}

export class StorageManager {

  /* ===================== 초기화 ===================== */

  static init() {
    if (localStorage.getItem(STORAGE_KEYS.USERS) === null) {
      writeJSON(STORAGE_KEYS.USERS, DEFAULT_USERS);
    }
    if (localStorage.getItem(STORAGE_KEYS.CATEGORIES) === null) {
      writeJSON(STORAGE_KEYS.CATEGORIES, DEFAULT_CATEGORIES);
    }
    if (localStorage.getItem(STORAGE_KEYS.TRANSACTIONS) === null) {
      writeJSON(STORAGE_KEYS.TRANSACTIONS, isDemoMode() ? generateDemoTransactions() : []);
    }
    if (localStorage.getItem(STORAGE_KEYS.BUDGETS) === null) {
      writeJSON(STORAGE_KEYS.BUDGETS, isDemoMode() ? DEMO_BUDGETS : DEFAULT_BUDGETS);
    }
    if (localStorage.getItem(STORAGE_KEYS.GOALS) === null) {
      writeJSON(STORAGE_KEYS.GOALS, isDemoMode() ? DEMO_GOALS : DEFAULT_GOALS);
    }
    if (localStorage.getItem(STORAGE_KEYS.ACCOUNTS) === null) {
      writeJSON(STORAGE_KEYS.ACCOUNTS, isDemoMode() ? DEMO_ACCOUNTS : DEFAULT_ACCOUNTS);
    }
    if (localStorage.getItem(STORAGE_KEYS.RECURRING) === null) {
      writeJSON(STORAGE_KEYS.RECURRING, isDemoMode() ? DEMO_RECURRING : DEFAULT_RECURRING);
    }
    if (localStorage.getItem(STORAGE_KEYS.SETTLEMENTS) === null) {
      writeJSON(STORAGE_KEYS.SETTLEMENTS, DEFAULT_SETTLEMENTS);
    }
    if (localStorage.getItem(STORAGE_KEYS.SETTINGS) === null) {
      writeJSON(STORAGE_KEYS.SETTINGS, DEFAULT_DEVICE_SETTINGS);
    }
    if (localStorage.getItem(STORAGE_KEYS.SHARED_SETTINGS) === null) {
      writeJSON(STORAGE_KEYS.SHARED_SETTINGS, DEFAULT_SHARED_SETTINGS);
    }
    this.migrateCategoryColors();

    // ⚠️ 여기서 syncFromCloud() 를 호출하지 않습니다.
    //    app.js 가 한 번만 호출하도록 하여 중복 실행/경쟁을 막습니다.
  }

  /* ===================== 오프라인 재시도 큐 ===================== */

  static _queue() {
    const q = readJSON(STORAGE_KEYS.QUEUE, []);
    return Array.isArray(q) ? q : [];
  }

  static _setQueue(q) {
    writeJSON(STORAGE_KEYS.QUEUE, q);
  }

  /** 같은 레코드에 대한 이전 작업은 최신 작업으로 대체합니다 */
  static _enqueue(op) {
    if (isDemoMode()) return;
    const q = this._queue().filter(o => !(o.table === op.table && o.id === op.id));
    q.push(op);
    this._setQueue(q);
  }

  static getPendingCount() {
    return this._queue().length;
  }

  /** 큐를 순서대로 재전송. 전부 성공하면 true */
  static async flushQueue() {
    if (isDemoMode()) return true;
    const q = this._queue();
    if (q.length === 0) return true;

    const remaining = [];
    for (const op of q) {
      let ok = false;
      try {
        if (op.table === 'transactions') {
          ok = op.op === 'delete'
            ? await SupabaseSyncEngine.deleteTransaction(op.id)
            : await SupabaseSyncEngine.upsertTransaction(op.data);
        } else if (op.table === 'budgets') {
          ok = await SupabaseSyncEngine.upsertBudget(op.data);
        } else if (op.table === 'goals') {
          ok = op.op === 'delete'
            ? await SupabaseSyncEngine.deleteGoal(op.id)
            : await SupabaseSyncEngine.saveGoals([op.data]);
        } else if (op.table === 'user_settings') {
          ok = await SupabaseSyncEngine.saveUsers(op.data);
        } else if (op.table === 'categories') {
          ok = await SupabaseSyncEngine.saveCategories([op.data]);
        } else if (op.table === 'accounts') {
          ok = op.op === 'delete'
            ? await SupabaseSyncEngine.deleteAccount(op.id)
            : await SupabaseSyncEngine.saveAccounts([op.data]);
        } else if (op.table === 'settlements') {
          ok = op.op === 'delete'
            ? await SupabaseSyncEngine.deleteSettlement(op.id)
            : await SupabaseSyncEngine.saveSettlements([op.data]);
        } else if (op.table === 'app_settings') {
          ok = await SupabaseSyncEngine.saveAppSettings(op.data);
        } else if (op.table === 'recurring') {
          ok = op.op === 'delete'
            ? await SupabaseSyncEngine.deleteRecurring(op.id)
            : await SupabaseSyncEngine.saveRecurring([op.data]);
        } else {
          ok = true; // 알 수 없는 작업은 버립니다
        }
      } catch (e) {
        ok = false;
      }
      if (!ok) remaining.push(op);
    }

    this._setQueue(remaining);
    return remaining.length === 0;
  }

  /* ===================== 클라우드 동기화 ===================== */

  /**
   * 클라우드와 병합 동기화.
   * @returns {'synced'|'offline'|'demo'|'pending'}
   */
  static async syncFromCloud() {
    if (isDemoMode()) return 'demo';

    // 1) 밀린 로컬 변경분을 먼저 올린다
    const flushed = await this.flushQueue();

    // 2) 클라우드 상태를 읽는다
    const cloudTx = await SupabaseSyncEngine.fetchTransactions();
    if (!Array.isArray(cloudTx)) {
      // 읽기 실패 = 오프라인/테이블 없음. 로컬을 절대 건드리지 않는다.
      return 'offline';
    }
    if (!flushed) {
      // 아직 못 올린 로컬 변경이 있다 → 덮어쓰면 유실되므로 병합하지 않는다.
      return 'pending';
    }

    const syncedOnce = localStorage.getItem(STORAGE_KEYS.SYNCED_ONCE) === '1';

    // 3) 거래 병합
    const localTx = this.getTransactions();
    const map = new Map();
    cloudTx.forEach(t => map.set(t.id, t));

    localTx.forEach(t => {
      const cloudVersion = map.get(t.id);
      if (!cloudVersion) {
        // 클라우드에 없는 로컬 항목:
        //  - 최초 동기화 전이면 "아직 안 올라간 내 데이터" → 올린다
        //  - 이미 동기화한 적이 있으면 "상대가 삭제한 항목" → 제거한다
        if (!syncedOnce && !isSampleTransactionId(t.id)) map.set(t.id, t);
      } else if (stampOf(t) > stampOf(cloudVersion)) {
        map.set(t.id, t); // 로컬이 더 최신
      }
    });

    const merged = Array.from(map.values())
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    this.saveTransactions(merged);

    // 최초 동기화에서 새로 살린 로컬 항목은 클라우드로 올린다
    if (!syncedOnce) {
      const cloudIds = new Set(cloudTx.map(t => t.id));
      for (const t of merged) {
        if (!cloudIds.has(t.id)) await this._pushTransaction(t);
      }
    }

    // 4) 사용자 설정
    const cloudUsers = await SupabaseSyncEngine.fetchUsers();
    if (cloudUsers) {
      writeJSON(STORAGE_KEYS.USERS, cloudUsers);
    } else {
      const ok = await SupabaseSyncEngine.saveUsers(this.getUsers());
      if (!ok) this._enqueue({ table: 'user_settings', op: 'upsert', id: 'all', data: this.getUsers() });
    }

    // 5) 카테고리 (기존에는 아예 동기화되지 않던 부분)
    const cloudCats = await SupabaseSyncEngine.fetchCategories();
    if (Array.isArray(cloudCats) && cloudCats.length > 0) {
      const catMap = new Map();
      this.getCategories().forEach(c => catMap.set(c.id, c));
      cloudCats.forEach(c => catMap.set(c.id, c)); // 클라우드 우선
      writeJSON(STORAGE_KEYS.CATEGORIES, Array.from(catMap.values()));
      this.migrateCategoryColors();
    } else {
      await SupabaseSyncEngine.saveCategories(this.getCategories());
    }

    // 6) 예산
    const cloudBudgets = await SupabaseSyncEngine.fetchBudgets();
    if (Array.isArray(cloudBudgets)) {
      if (cloudBudgets.length > 0) {
        writeJSON(STORAGE_KEYS.BUDGETS, cloudBudgets);
      } else if (!syncedOnce) {
        const local = this.getBudgets().filter(b => !SAMPLE_BUDGET_IDS.includes(b.id));
        if (local.length > 0) await SupabaseSyncEngine.upsertBudgets(local);
      }
    }

    // 7) 목표
    const cloudGoals = await SupabaseSyncEngine.fetchGoals();
    if (Array.isArray(cloudGoals)) {
      if (cloudGoals.length > 0) {
        writeJSON(STORAGE_KEYS.GOALS, cloudGoals);
      } else if (!syncedOnce) {
        const local = this.getGoals().filter(g => !SAMPLE_GOAL_IDS.includes(g.id));
        if (local.length > 0) await SupabaseSyncEngine.saveGoals(local);
      }
    }

    // 8) 계좌
    const cloudAccounts = await SupabaseSyncEngine.fetchAccounts();
    if (Array.isArray(cloudAccounts)) {
      if (cloudAccounts.length > 0) {
        writeJSON(STORAGE_KEYS.ACCOUNTS, cloudAccounts);
      } else if (!syncedOnce) {
        const local = this.getAccounts().filter(a => !DEMO_ACCOUNTS.some(d => d.id === a.id));
        if (local.length > 0) await SupabaseSyncEngine.saveAccounts(local);
      }
    }

    // 9) 반복 거래 템플릿
    const cloudRecurring = await SupabaseSyncEngine.fetchRecurring();
    if (Array.isArray(cloudRecurring)) {
      if (cloudRecurring.length > 0) {
        writeJSON(STORAGE_KEYS.RECURRING, cloudRecurring);
      } else if (!syncedOnce) {
        const local = this.getRecurring().filter(r => !DEMO_RECURRING.some(d => d.id === r.id));
        if (local.length > 0) await SupabaseSyncEngine.saveRecurring(local);
      }
    }

    // 10) 정산 이력
    const cloudSettlements = await SupabaseSyncEngine.fetchSettlements();
    if (Array.isArray(cloudSettlements)) {
      if (cloudSettlements.length > 0) {
        writeJSON(STORAGE_KEYS.SETTLEMENTS, cloudSettlements);
      } else if (!syncedOnce) {
        const local = this.getSettlements();
        if (local.length > 0) await SupabaseSyncEngine.saveSettlements(local);
      }
    }

    // 11) 부부 공유 설정
    const cloudAppSettings = await SupabaseSyncEngine.fetchAppSettings();
    if (cloudAppSettings && typeof cloudAppSettings === 'object') {
      writeJSON(STORAGE_KEYS.SHARED_SETTINGS, { ...DEFAULT_SHARED_SETTINGS, ...cloudAppSettings });
    } else {
      await SupabaseSyncEngine.saveAppSettings(this.getSharedSettings());
    }

    localStorage.setItem(STORAGE_KEYS.SYNCED_ONCE, '1');
    return 'synced';
  }

  /* ===================== Users ===================== */

  static getUsers() {
    const u = readJSON(STORAGE_KEYS.USERS, DEFAULT_USERS);
    // 클라우드 row 에 name 이 없을 수도 있으므로 기본값으로 보정
    return {
      husband: { ...DEFAULT_USERS.husband, ...(u.husband || {}) },
      wife: { ...DEFAULT_USERS.wife, ...(u.wife || {}) }
    };
  }

  static async saveUsers(users) {
    writeJSON(STORAGE_KEYS.USERS, users);
    if (isDemoMode()) return true;
    const ok = await SupabaseSyncEngine.saveUsers(users);
    if (!ok) this._enqueue({ table: 'user_settings', op: 'upsert', id: 'all', data: users });
    return ok;
  }

  /* ===================== Categories ===================== */

  static getCategories() {
    const c = readJSON(STORAGE_KEYS.CATEGORIES, DEFAULT_CATEGORIES);
    return Array.isArray(c) ? c : DEFAULT_CATEGORIES;
  }

  /**
   * 구버전에 저장된 무지개 카테고리 색을 Honeycomb 으로 한 번만 옮깁니다.
   * 사용자가 직접 고른 색은 건드리지 않고, 예전 기본값과 정확히 일치하는 것만 바꿉니다.
   */
  static migrateCategoryColors() {
    const cats = this.getCategories();
    let changed = false;

    const next = cats.map(c => {
      const legacy = LEGACY_CATEGORY_COLORS[c.type] || [];
      if (legacy.includes(String(c.color || '').toLowerCase())) {
        changed = true;
        return { ...c, color: CATEGORY_COLOR[c.type] || CATEGORY_COLOR.expense };
      }
      return c;
    });

    if (!changed) return false;
    writeJSON(STORAGE_KEYS.CATEGORIES, next);
    if (!isDemoMode()) {
      SupabaseSyncEngine.saveCategories(next).catch(() => {});
    }
    return true;
  }

  static async saveCategories(categories) {
    writeJSON(STORAGE_KEYS.CATEGORIES, categories);
    if (isDemoMode()) return true;
    const ok = await SupabaseSyncEngine.saveCategories(categories);
    if (!ok) {
      categories.forEach(c => this._enqueue({ table: 'categories', op: 'upsert', id: c.id, data: c }));
    }
    return ok;
  }

  /* ===================== Transactions ===================== */

  static getTransactions() {
    const t = readJSON(STORAGE_KEYS.TRANSACTIONS, []);
    return Array.isArray(t) ? t : [];
  }

  static saveTransactions(transactions) {
    writeJSON(STORAGE_KEYS.TRANSACTIONS, transactions);
  }

  static async _pushTransaction(tx) {
    if (isDemoMode()) return true;
    const ok = await SupabaseSyncEngine.upsertTransaction(tx);
    if (!ok) this._enqueue({ table: 'transactions', op: 'upsert', id: tx.id, data: tx });
    return ok;
  }

  static async addTransaction(txData) {
    const transactions = this.getTransactions();
    const now = new Date().toISOString();
    const newTx = {
      ...txData,
      id: 'tx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      createdAt: now,
      updatedAt: now
    };
    transactions.unshift(newTx);
    this.saveTransactions(transactions);
    await this._pushTransaction(newTx);
    return newTx;
  }

  static async updateTransaction(id, txData) {
    const transactions = this.getTransactions();
    const index = transactions.findIndex(t => t.id === id);
    if (index === -1) return null;

    transactions[index] = {
      ...transactions[index],
      ...txData,
      updatedAt: new Date().toISOString()
    };
    this.saveTransactions(transactions);
    await this._pushTransaction(transactions[index]);
    return transactions[index];
  }

  /**
   * 할부 거래를 등록합니다. 회차 수만큼 거래를 한 번에 만듭니다.
   *
   * 구매 금액을 구매월에 통째로 잡지 않고 회차별로 나누는 이유:
   *  - 월 예산·부부 정산·카드 결제액이 전부 "그 달에 실제로 나가는 돈" 기준입니다.
   *  - 각 회차는 카드 계좌에 달려 있어 카드 청구 주기에 자동으로 포함됩니다.
   *
   * @param base  공통 거래 정보 (date, categoryId, userId, sharedType, accountId, memo ...)
   * @param plan  { months, annualRate }
   */
  static async addInstallment(base, plan) {
    const schedule = buildInstallmentSchedule(base.amount, plan.months, base.date, plan.annualRate || 0);
    const installmentId = 'inst_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const now = new Date().toISOString();

    const created = schedule.rows.map(row => ({
      ...base,
      id: `${installmentId}_${String(row.seq).padStart(2, '0')}`,
      date: row.date,
      amount: row.amount,
      type: 'expense',
      // 할부금은 매달 고정으로 나가는 확정 지출입니다.
      // (변동비로 두면 월말 예상 지출에서 잘못 외삽됩니다)
      isFixed: true,
      memo: base.memo || '할부 결제',
      installmentId,
      installmentSeq: row.seq,
      installmentMonths: schedule.months,
      installmentPrincipal: schedule.principal,
      installmentFee: row.fee,
      installmentRate: schedule.annualRate,
      createdAt: now,
      updatedAt: now
    }));

    const list = this.getTransactions();
    created.forEach(t => list.unshift(t));
    list.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    this.saveTransactions(list);

    for (const t of created) await this._pushTransaction(t);
    return { installmentId, schedule, created };
  }

  /** 할부 전체(남은 회차 포함)를 삭제합니다 */
  static async deleteInstallment(installmentId) {
    const all = this.getTransactions();
    const targets = all.filter(t => t.installmentId === installmentId);
    if (targets.length === 0) return 0;

    this.saveTransactions(all.filter(t => t.installmentId !== installmentId));

    if (!isDemoMode()) {
      const ok = await SupabaseSyncEngine.deleteTransactionsByIds(targets.map(t => t.id));
      if (!ok) targets.forEach(t => this._enqueue({ table: 'transactions', op: 'delete', id: t.id }));
    }
    return targets.length;
  }

  static async deleteTransaction(id) {
    const transactions = this.getTransactions().filter(t => t.id !== id);
    this.saveTransactions(transactions);
    if (isDemoMode()) return true;
    const ok = await SupabaseSyncEngine.deleteTransaction(id);
    if (!ok) this._enqueue({ table: 'transactions', op: 'delete', id });
    return ok;
  }

  /**
   * 이번 달에 "금액 확인"이 필요한 변동 반복 거래 목록.
   * 지난달 실제 금액을 제안값으로 함께 돌려줍니다.
   */
  static getPendingRecurring(monthStr) {
    const transactions = this.getTransactions();
    const existingIds = new Set(transactions.map(t => t.id));

    return this.getRecurring()
      .filter(r => r.active !== false && r.amountMode === 'variable')
      .filter(r => !(r.startMonth && monthStr < r.startMonth))
      .filter(r => !(r.endMonth && monthStr > r.endMonth))
      .filter(r => !existingIds.has(`rtx_${r.id}_${monthStr}`))
      .filter(r => !(Array.isArray(r.skips) && r.skips.includes(monthStr)))
      .map(r => {
        // 가장 최근에 실제로 입력된 금액을 제안값으로 씁니다
        const past = transactions
          .filter(t => t.recurringId === r.id && String(t.date).slice(0, 7) < monthStr)
          .sort((a, b) => String(b.date).localeCompare(String(a.date)));

        const lastTx = past[0] || null;
        return {
          template: r,
          suggestedAmount: lastTx ? Number(lastTx.amount) || 0 : (Number(r.amount) || 0),
          lastMonth: lastTx ? String(lastTx.date).slice(0, 7) : null
        };
      });
  }

  /** 변동 반복 거래를 이번 달 금액으로 확정합니다 */
  static async confirmRecurring(templateId, monthStr, amount) {
    const tpl = this.getRecurring().find(r => r.id === templateId);
    if (!tpl) return null;

    const amt = Number(amount) || 0;
    if (amt <= 0) return null;

    const [y, m] = monthStr.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const day = Math.min(Math.max(Number(tpl.dayOfMonth) || 1, 1), daysInMonth);
    const now = new Date().toISOString();

    const tx = {
      id: `rtx_${tpl.id}_${monthStr}`,
      date: `${monthStr}-${String(day).padStart(2, '0')}`,
      type: tpl.type || 'expense',
      amount: amt,
      userId: tpl.userId || 'husband',
      categoryId: tpl.type === 'transfer' ? '' : (tpl.categoryId || ''),
      sharedType: tpl.sharedType || 'shared',
      paymentMethod: tpl.paymentMethod || 'bank',
      accountId: tpl.accountId || '',
      isFixed: tpl.type === 'expense',
      memo: tpl.memo || tpl.name || '반복 거래',
      recurringId: tpl.id,
      createdAt: now,
      updatedAt: now
    };

    const list = this.getTransactions().filter(t => t.id !== tx.id);
    list.unshift(tx);
    list.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    this.saveTransactions(list);
    await this._pushTransaction(tx);

    // 다음 달 제안값이 이번 금액이 되도록 템플릿도 갱신
    await this.updateRecurring(templateId, { amount: amt });
    return tx;
  }

  /** 이번 달은 건너뜁니다 (다시 묻지 않음) */
  static async skipRecurring(templateId, monthStr) {
    const tpl = this.getRecurring().find(r => r.id === templateId);
    if (!tpl) return null;
    const skips = Array.isArray(tpl.skips) ? tpl.skips.slice() : [];
    if (!skips.includes(monthStr)) skips.push(monthStr);
    return this.updateRecurring(templateId, { skips });
  }

  /* ===================== 카드 결제 자동 생성 ===================== */

  /**
   * 카드 결제일이 지난 청구 건에 대해 '결제통장 → 카드' 이체 거래를 만듭니다.
   *
   *  - 거래 id 가 `ctx_<카드id>_<결제월>` 로 고정되어 중복 생성되지 않습니다.
   *  - 나중에 카드 사용 내역을 더 입력하면 금액이 자동으로 보정됩니다.
   *  - 사용액이 0원이 되면 만들어둔 결제 거래를 삭제합니다.
   *  - 사용자가 직접 수정한 거래(autoGenerated 가 아닌 것)는 건드리지 않습니다.
   *
   * @returns { created, updated, removed } 각각 거래 배열/개수
   */
  static async applyCardSettlements(monthStr) {
    const result = { created: [], updated: [], removed: [] };
    if (this.getSharedSettings().cardSettlementEnabled === false) return result;

    const cards = this.getAccounts().filter(a =>
      a.type === 'card' && a.autoSettle !== false && a.paymentAccountId);
    if (cards.length === 0) return result;

    const today = todayLocalStr();
    const transactions = this.getTransactions();
    const byId = new Map(transactions.map(t => [t.id, t]));
    let changed = false;

    for (const card of cards) {
      const billing = calculateCardBilling(card, transactions, monthStr);

      // 아직 결제일이 오지 않았으면 만들지 않습니다 (미래 출금을 미리 찍지 않음)
      if (billing.paymentDate > today) continue;

      const txId = `ctx_${card.id}_${monthStr}`;
      const existing = byId.get(txId);
      const amount = Math.round(billing.amount);

      if (existing && !existing.autoGenerated) continue; // 사용자가 손댄 건 존중

      if (amount <= 0) {
        if (existing) {
          const idx = transactions.findIndex(t => t.id === txId);
          if (idx !== -1) {
            transactions.splice(idx, 1);
            result.removed.push(txId);
            changed = true;
            if (!isDemoMode()) {
              const ok = await SupabaseSyncEngine.deleteTransaction(txId);
              if (!ok) this._enqueue({ table: 'transactions', op: 'delete', id: txId });
            }
          }
        }
        continue;
      }

      const owner = card.owner === 'husband' || card.owner === 'wife' ? card.owner : 'husband';
      const now = new Date().toISOString();
      const base = {
        id: txId,
        date: billing.paymentDate,
        type: 'transfer',
        amount,
        userId: owner,
        categoryId: '',
        sharedType: card.owner === 'shared' ? 'shared' : card.owner,
        paymentMethod: 'bank',
        accountId: '',
        fromAccountId: card.paymentAccountId,
        toAccountId: card.id,
        isFixed: false,
        memo: `[카드결제] ${card.name} (${billing.periodStart.slice(5)}~${billing.periodEnd.slice(5)} 사용분)`,
        autoGenerated: true,
        cardBillingMonth: monthStr,
        updatedAt: now
      };

      if (!existing) {
        const tx = { ...base, createdAt: now };
        transactions.unshift(tx);
        result.created.push(tx);
        changed = true;
        await this._pushTransaction(tx);
      } else if (Number(existing.amount) !== amount || existing.date !== base.date) {
        const idx = transactions.findIndex(t => t.id === txId);
        transactions[idx] = { ...existing, ...base, createdAt: existing.createdAt || now };
        result.updated.push(transactions[idx]);
        changed = true;
        await this._pushTransaction(transactions[idx]);
      }
    }

    if (changed) {
      transactions.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
      this.saveTransactions(transactions);
    }
    return result;
  }

  /* ===================== Budgets ===================== */

  static getBudgets() {
    const b = readJSON(STORAGE_KEYS.BUDGETS, DEFAULT_BUDGETS);
    return Array.isArray(b) ? b : [];
  }

  static saveBudgets(budgets) {
    writeJSON(STORAGE_KEYS.BUDGETS, budgets);
  }

  static async setCategoryBudget(month, categoryId, amount) {
    const budgets = this.getBudgets();
    const idx = budgets.findIndex(b => b.month === month && b.categoryId === categoryId);
    let budgetObj;

    if (idx !== -1) {
      budgets[idx].amount = Number(amount) || 0;
      budgetObj = budgets[idx];
    } else {
      budgetObj = { id: 'b_' + month + '_' + categoryId, month, categoryId, amount: Number(amount) || 0 };
      budgets.push(budgetObj);
    }

    this.saveBudgets(budgets);
    if (isDemoMode()) return true;
    const ok = await SupabaseSyncEngine.upsertBudget(budgetObj);
    if (!ok) this._enqueue({ table: 'budgets', op: 'upsert', id: budgetObj.id, data: budgetObj });
    return ok;
  }

  /** 여러 카테고리 예산을 한 번에 저장 (설정 화면의 "일괄 저장") */
  static async setCategoryBudgets(month, entries) {
    const budgets = this.getBudgets();
    const changed = [];

    entries.forEach(({ categoryId, amount }) => {
      const amt = Number(amount) || 0;
      const idx = budgets.findIndex(b => b.month === month && b.categoryId === categoryId);
      if (idx !== -1) {
        budgets[idx].amount = amt;
        changed.push(budgets[idx]);
      } else {
        const obj = { id: 'b_' + month + '_' + categoryId, month, categoryId, amount: amt };
        budgets.push(obj);
        changed.push(obj);
      }
    });

    this.saveBudgets(budgets);
    if (isDemoMode()) return true;

    const ok = await SupabaseSyncEngine.upsertBudgets(changed);
    if (!ok) changed.forEach(b => this._enqueue({ table: 'budgets', op: 'upsert', id: b.id, data: b }));
    return ok;
  }

  /* ===================== Goals ===================== */

  static getGoals() {
    const g = readJSON(STORAGE_KEYS.GOALS, DEFAULT_GOALS);
    return Array.isArray(g) ? g : [];
  }

  static async saveGoals(goals) {
    writeJSON(STORAGE_KEYS.GOALS, goals);
    if (isDemoMode()) return true;
    const ok = await SupabaseSyncEngine.saveGoals(goals);
    if (!ok) goals.forEach(g => this._enqueue({ table: 'goals', op: 'upsert', id: g.id, data: g }));
    return ok;
  }

  static async deleteGoal(id) {
    const goals = this.getGoals().filter(g => g.id !== id);
    writeJSON(STORAGE_KEYS.GOALS, goals);
    if (isDemoMode()) return true;
    const ok = await SupabaseSyncEngine.deleteGoal(id);
    if (!ok) this._enqueue({ table: 'goals', op: 'delete', id });
    return ok;
  }

  /* ===================== Accounts ===================== */

  static getAccounts() {
    const a = readJSON(STORAGE_KEYS.ACCOUNTS, DEFAULT_ACCOUNTS);
    if (!Array.isArray(a)) return [];
    // 구버전 balance -> openingBalance 마이그레이션
    return a.map(acc => (acc.openingBalance === undefined && acc.balance !== undefined)
      ? { ...acc, openingBalance: Number(acc.balance) || 0 }
      : acc);
  }

  static async saveAccounts(accounts) {
    writeJSON(STORAGE_KEYS.ACCOUNTS, accounts);
    if (isDemoMode()) return true;
    const ok = await SupabaseSyncEngine.saveAccounts(accounts);
    if (!ok) accounts.forEach(a => this._enqueue({ table: 'accounts', op: 'upsert', id: a.id, data: a }));
    return ok;
  }

  static async deleteAccount(id) {
    const accounts = this.getAccounts().filter(a => a.id !== id);
    writeJSON(STORAGE_KEYS.ACCOUNTS, accounts);
    if (isDemoMode()) return true;
    const ok = await SupabaseSyncEngine.deleteAccount(id);
    if (!ok) this._enqueue({ table: 'accounts', op: 'delete', id });
    return ok;
  }

  /* ===================== App Settings ===================== */

  /** 기기별 설정 (테마) — 이 브라우저에만 저장 */
  static getDeviceSettings() {
    return { ...DEFAULT_DEVICE_SETTINGS, ...readJSON(STORAGE_KEYS.SETTINGS, {}) };
  }

  static saveDeviceSettings(patch) {
    const next = { ...this.getDeviceSettings(), ...patch };
    writeJSON(STORAGE_KEYS.SETTINGS, next);
    return next;
  }

  /** 부부 공유 설정 (정산 기준 등) — 클라우드 동기화 */
  static getSharedSettings() {
    return { ...DEFAULT_SHARED_SETTINGS, ...readJSON(STORAGE_KEYS.SHARED_SETTINGS, {}) };
  }

  static async saveSharedSettings(patch) {
    const next = { ...this.getSharedSettings(), ...patch };
    writeJSON(STORAGE_KEYS.SHARED_SETTINGS, next);
    if (isDemoMode()) return next;

    const ok = await SupabaseSyncEngine.saveAppSettings(next);
    if (!ok) this._enqueue({ table: 'app_settings', op: 'upsert', id: 'household', data: next });
    return next;
  }

  /** 두 설정을 합쳐서 반환 (읽기 전용 용도) */
  static getSettings() {
    return { ...this.getDeviceSettings(), ...this.getSharedSettings() };
  }

  /* ===================== 정산 이력 ===================== */

  static getSettlements() {
    const list = readJSON(STORAGE_KEYS.SETTLEMENTS, DEFAULT_SETTLEMENTS);
    return Array.isArray(list) ? list : [];
  }

  static getSettlementFor(monthStr) {
    return this.getSettlements().find(x => x.month === monthStr) || null;
  }

  /** "이번 달 정산 완료" 기록 */
  static async markSettled(monthStr, snapshot) {
    const list = this.getSettlements().filter(x => x.month !== monthStr);
    const record = {
      id: 'stl_' + monthStr,
      month: monthStr,
      mode: snapshot.mode,
      amount: Math.round(snapshot.amount || 0),
      "fromUserId": snapshot.fromUserId || '',
      "toUserId": snapshot.toUserId || '',
      "sharedTotal": Math.round(snapshot.sharedTotal || 0),
      "husbandPaid": Math.round(snapshot.husbandPaid || 0),
      "wifePaid": Math.round(snapshot.wifePaid || 0),
      "settledAt": new Date().toISOString()
    };
    list.push(record);
    list.sort((a, b) => String(b.month).localeCompare(String(a.month)));
    writeJSON(STORAGE_KEYS.SETTLEMENTS, list);

    if (isDemoMode()) return record;
    const ok = await SupabaseSyncEngine.saveSettlements([record]);
    if (!ok) this._enqueue({ table: 'settlements', op: 'upsert', id: record.id, data: record });
    return record;
  }

  static async unmarkSettled(monthStr) {
    const id = 'stl_' + monthStr;
    writeJSON(STORAGE_KEYS.SETTLEMENTS, this.getSettlements().filter(x => x.month !== monthStr));
    if (isDemoMode()) return true;
    const ok = await SupabaseSyncEngine.deleteSettlement(id);
    if (!ok) this._enqueue({ table: 'settlements', op: 'delete', id });
    return ok;
  }

  /* ===================== Recurring (반복 거래) ===================== */

  static getRecurring() {
    const r = readJSON(STORAGE_KEYS.RECURRING, DEFAULT_RECURRING);
    return Array.isArray(r) ? r : [];
  }

  static async saveRecurringList(list) {
    writeJSON(STORAGE_KEYS.RECURRING, list);
    if (isDemoMode()) return true;
    const ok = await SupabaseSyncEngine.saveRecurring(list);
    if (!ok) list.forEach(r => this._enqueue({ table: 'recurring', op: 'upsert', id: r.id, data: r }));
    return ok;
  }

  static async addRecurring(template) {
    const list = this.getRecurring();
    const item = {
      active: true,
      startMonth: new Date().toISOString().slice(0, 7),
      ...template,
      id: template.id || 'rec_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)
    };
    list.push(item);
    await this.saveRecurringList(list);
    return item;
  }

  static async updateRecurring(id, patch) {
    const list = this.getRecurring();
    const idx = list.findIndex(r => r.id === id);
    if (idx === -1) return null;
    list[idx] = { ...list[idx], ...patch };
    await this.saveRecurringList(list);
    return list[idx];
  }

  static async deleteRecurring(id) {
    const list = this.getRecurring().filter(r => r.id !== id);
    writeJSON(STORAGE_KEYS.RECURRING, list);
    if (isDemoMode()) return true;
    const ok = await SupabaseSyncEngine.deleteRecurring(id);
    if (!ok) this._enqueue({ table: 'recurring', op: 'delete', id });
    return ok;
  }

  /**
   * 해당 월의 반복 거래를 생성합니다.
   * 거래 id 가 `rtx_<템플릿id>_<YYYY-MM>` 로 고정되어 있어 몇 번을 실행해도
   * 중복 생성되지 않습니다 (멱등).
   * @returns 생성된 거래 배열
   */
  static async applyRecurring(monthStr) {
    const templates = this.getRecurring().filter(r => r.active !== false);
    if (templates.length === 0) return [];

    const existing = this.getTransactions();
    const existingIds = new Set(existing.map(t => t.id));

    const [y, m] = monthStr.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const now = new Date().toISOString();
    const created = [];

    for (const tpl of templates) {
      if (tpl.startMonth && monthStr < tpl.startMonth) continue;
      if (tpl.endMonth && monthStr > tpl.endMonth) continue;

      // ✅ 금액이 매달 달라지는 항목은 자동 생성하지 않습니다.
      //    확인하지 않은 금액이 장부에 들어가면 통계 전체가 틀어지기 때문입니다.
      //    대신 getPendingRecurring() 이 "확인 필요" 목록으로 올려줍니다.
      if (tpl.amountMode === 'variable') continue;

      const txId = `rtx_${tpl.id}_${monthStr}`;
      if (existingIds.has(txId)) continue;

      const day = Math.min(Math.max(Number(tpl.dayOfMonth) || 1, 1), daysInMonth);
      const tx = {
        id: txId,
        date: `${monthStr}-${String(day).padStart(2, '0')}`,
        type: tpl.type || 'expense',
        amount: Number(tpl.amount) || 0,
        userId: tpl.userId || 'husband',
        categoryId: tpl.type === 'transfer' ? '' : (tpl.categoryId || ''),
        sharedType: tpl.sharedType || 'shared',
        paymentMethod: tpl.paymentMethod || 'bank',
        accountId: tpl.accountId || '',
        isFixed: tpl.type === 'expense' ? true : false,
        memo: tpl.memo || tpl.name || '반복 거래',
        recurringId: tpl.id,
        createdAt: now,
        updatedAt: now
      };
      if (tx.amount <= 0) continue;

      existing.unshift(tx);
      created.push(tx);
    }

    if (created.length > 0) {
      existing.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
      this.saveTransactions(existing);
      for (const tx of created) await this._pushTransaction(tx);
    }
    return created;
  }

  /* ===================== 정리 / 초기화 / 백업 ===================== */

  /** 과거 버전이 심어둔 샘플 데이터를 로컬 + 클라우드에서 제거 */
  static async purgeSampleData() {
    const all = this.getTransactions();
    const sampleIds = all.filter(t => isSampleTransactionId(t.id)).map(t => t.id);
    this.saveTransactions(all.filter(t => !isSampleTransactionId(t.id)));

    const budgets = this.getBudgets().filter(b => !SAMPLE_BUDGET_IDS.includes(b.id));
    this.saveBudgets(budgets);
    const goals = this.getGoals().filter(g => !SAMPLE_GOAL_IDS.includes(g.id));
    writeJSON(STORAGE_KEYS.GOALS, goals);
    writeJSON(STORAGE_KEYS.ACCOUNTS, this.getAccounts().filter(a => !DEMO_ACCOUNTS.some(d => d.id === a.id)));
    writeJSON(STORAGE_KEYS.RECURRING, this.getRecurring().filter(r => !DEMO_RECURRING.some(d => d.id === r.id)));

    if (!isDemoMode() && sampleIds.length > 0) {
      await SupabaseSyncEngine.deleteTransactionsByIds(sampleIds);
    }
    return sampleIds.length;
  }

  /** 로컬 + 클라우드를 모두 비우고 빈 가계부로 시작 */
  static async clearAllData() {
    if (!isDemoMode()) {
      await SupabaseSyncEngine.deleteAllTransactions();
      await SupabaseSyncEngine.deleteAllBudgets();
      await SupabaseSyncEngine.deleteAllGoals();
      await SupabaseSyncEngine.deleteAllAccounts();
      await SupabaseSyncEngine.deleteAllRecurring();
      await SupabaseSyncEngine.deleteAllSettlements();
    }
    Object.values(STORAGE_KEYS).forEach(k => localStorage.removeItem(k));
    _demoMode = null;
    this.init();
  }

  /** 데모 데이터를 로컬에만 다시 로드 (클라우드에는 올리지 않습니다) */
  static loadDemoDataLocally() {
    localStorage.setItem(STORAGE_KEYS.DEMO, '1');
    _demoMode = true;
    writeJSON(STORAGE_KEYS.USERS, DEFAULT_USERS);
    writeJSON(STORAGE_KEYS.CATEGORIES, DEFAULT_CATEGORIES);
    writeJSON(STORAGE_KEYS.TRANSACTIONS, generateDemoTransactions());
    writeJSON(STORAGE_KEYS.BUDGETS, DEMO_BUDGETS);
    writeJSON(STORAGE_KEYS.GOALS, DEMO_GOALS);
    writeJSON(STORAGE_KEYS.ACCOUNTS, DEMO_ACCOUNTS);
    writeJSON(STORAGE_KEYS.RECURRING, DEMO_RECURRING);
    writeJSON(STORAGE_KEYS.SETTLEMENTS, []);
    this._setQueue([]);
  }

  static exitDemoMode() {
    localStorage.removeItem(STORAGE_KEYS.DEMO);
    _demoMode = false;
    writeJSON(STORAGE_KEYS.TRANSACTIONS, []);
    writeJSON(STORAGE_KEYS.BUDGETS, []);
    writeJSON(STORAGE_KEYS.GOALS, []);
    writeJSON(STORAGE_KEYS.ACCOUNTS, []);
    writeJSON(STORAGE_KEYS.RECURRING, []);
    writeJSON(STORAGE_KEYS.SETTLEMENTS, []);
    localStorage.removeItem(STORAGE_KEYS.SYNCED_ONCE);
  }

  static exportBackupData() {
    return JSON.stringify({
      users: this.getUsers(),
      categories: this.getCategories(),
      transactions: this.getTransactions(),
      budgets: this.getBudgets(),
      goals: this.getGoals(),
      accounts: this.getAccounts(),
      recurring: this.getRecurring(),
      settlements: this.getSettlements(),
      settings: this.getDeviceSettings(),
      sharedSettings: this.getSharedSettings(),
      exportedAt: new Date().toISOString(),
      version: 4
    }, null, 2);
  }

  static async importBackupData(jsonString) {
    let data;
    try {
      data = JSON.parse(jsonString);
    } catch (e) {
      return { ok: false, reason: 'JSON 형식이 아닙니다.' };
    }
    if (!data || typeof data !== 'object') {
      return { ok: false, reason: '백업 파일 구조가 올바르지 않습니다.' };
    }
    if (!Array.isArray(data.transactions)) {
      return { ok: false, reason: 'transactions 항목이 없습니다. 이 앱의 백업 파일이 맞는지 확인해주세요.' };
    }

    try {
      if (data.users) await this.saveUsers(data.users);
      if (Array.isArray(data.categories) && data.categories.length) await this.saveCategories(data.categories);

      const stamped = data.transactions.map(t => ({
        ...t,
        updatedAt: t.updatedAt || t.createdAt || new Date().toISOString()
      }));
      this.saveTransactions(stamped);
      for (const t of stamped) await this._pushTransaction(t);

      if (Array.isArray(data.budgets)) {
        this.saveBudgets(data.budgets);
        if (!isDemoMode() && data.budgets.length) await SupabaseSyncEngine.upsertBudgets(data.budgets);
      }
      if (Array.isArray(data.goals) && data.goals.length) await this.saveGoals(data.goals);
      if (Array.isArray(data.accounts) && data.accounts.length) await this.saveAccounts(data.accounts);
      if (Array.isArray(data.recurring) && data.recurring.length) await this.saveRecurringList(data.recurring);
      if (Array.isArray(data.settlements) && data.settlements.length) {
        writeJSON(STORAGE_KEYS.SETTLEMENTS, data.settlements);
        if (!isDemoMode()) await SupabaseSyncEngine.saveSettlements(data.settlements);
      }
      if (data.settings) this.saveDeviceSettings(data.settings);
      if (data.sharedSettings) await this.saveSharedSettings(data.sharedSettings);

      return { ok: true, count: stamped.length };
    } catch (e) {
      console.error('Failed to import backup data:', e);
      return { ok: false, reason: e.message || '알 수 없는 오류' };
    }
  }
}
