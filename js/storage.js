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
  DEFAULT_SETTINGS, DEFAULT_RECURRING,
  DEMO_BUDGETS, DEMO_GOALS, DEMO_ACCOUNTS, DEMO_RECURRING, generateDemoTransactions,
  isSampleTransactionId, SAMPLE_BUDGET_IDS, SAMPLE_GOAL_IDS
} from './models.js';
import { SupabaseSyncEngine } from './supabaseClient.js';

const STORAGE_KEYS = {
  USERS: 'couple_finance_users',
  CATEGORIES: 'couple_finance_categories',
  TRANSACTIONS: 'couple_finance_transactions',
  BUDGETS: 'couple_finance_budgets',
  GOALS: 'couple_finance_goals',
  ACCOUNTS: 'couple_finance_accounts',
  RECURRING: 'couple_finance_recurring',
  SETTINGS: 'couple_finance_settings',
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
    if (localStorage.getItem(STORAGE_KEYS.SETTINGS) === null) {
      writeJSON(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
    }
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

  static async deleteTransaction(id) {
    const transactions = this.getTransactions().filter(t => t.id !== id);
    this.saveTransactions(transactions);
    if (isDemoMode()) return true;
    const ok = await SupabaseSyncEngine.deleteTransaction(id);
    if (!ok) this._enqueue({ table: 'transactions', op: 'delete', id });
    return ok;
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

  /* ===================== App Settings (기기별) ===================== */

  static getSettings() {
    return { ...DEFAULT_SETTINGS, ...readJSON(STORAGE_KEYS.SETTINGS, {}) };
  }

  static saveSettings(patch) {
    const next = { ...this.getSettings(), ...patch };
    writeJSON(STORAGE_KEYS.SETTINGS, next);
    return next;
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
      settings: this.getSettings(),
      exportedAt: new Date().toISOString(),
      version: 3
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
      if (data.settings) this.saveSettings(data.settings);

      return { ok: true, count: stamped.length };
    } catch (e) {
      console.error('Failed to import backup data:', e);
      return { ok: false, reason: e.message || '알 수 없는 오류' };
    }
  }
}
