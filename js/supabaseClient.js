/**
 * Supabase Client & Real-time Data Synchronization Manager
 * Couple Finance Dashboard ("우리집 가계부")
 *
 * ⚠️ 보안 안내
 *  - anon key 는 정적 호스팅 특성상 브라우저에 노출됩니다. 이는 정상입니다.
 *  - 다만 Supabase 테이블에 RLS(Row Level Security)가 켜져 있지 않으면
 *    이 키를 본 누구나 데이터를 읽고 지울 수 있습니다.
 *  - 반드시 프로젝트 루트의 supabase_setup.sql 을 실행해 RLS 를 적용하세요.
 */

export const SUPABASE_URL = 'https://jzxkxyxlbaedeeaimrlo.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6eGt4eXhsYmFlZGVlYWltcmxvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg1MjYzODYsImV4cCI6MjEwNDEwMjM4Nn0.vHlMgVktBM9gJlSpBMcg8lK_NP1yE7N6UXvVwqQJ7QQ';

let supabase = null;
let connectionStatus = 'checking'; // 'checking' | 'connected' | 'missing_tables' | 'error'
const statusListeners = [];

function setStatus(next) {
  if (connectionStatus === next) return;
  connectionStatus = next;
  statusListeners.forEach(fn => {
    try { fn(next); } catch (e) { /* listener 오류가 동기화를 막지 않도록 */ }
  });
}

export function onStatusChange(fn) {
  if (typeof fn === 'function') statusListeners.push(fn);
}

export function getSupabase() {
  if (!supabase && window.supabase) {
    try {
      supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } catch (e) {
      console.error('[Supabase Init Error]:', e);
    }
  }
  return supabase;
}

export function getConnectionStatus() {
  return connectionStatus;
}

/** 에러가 "테이블 없음"인지 판별 */
function isMissingTable(error) {
  return error && (error.code === '42P01' || String(error.message || '').includes('does not exist'));
}

/** 쓰기 계열 공통 처리: 성공 true / 실패 false (실패 시 호출부가 재시도 큐에 넣습니다) */
async function runWrite(label, fn) {
  const sb = getSupabase();
  if (!sb) return false;
  try {
    const { error } = await fn(sb);
    if (error) {
      if (isMissingTable(error)) setStatus('missing_tables');
      else setStatus('error');
      console.warn(`[Supabase ${label}]`, error.message || error);
      return false;
    }
    setStatus('connected');
    return true;
  } catch (e) {
    setStatus('error');
    console.warn(`[Supabase ${label}] exception:`, e.message || e);
    return false;
  }
}

/** 읽기 계열 공통 처리: 성공 시 배열/객체, 실패 시 null (null 은 "모름"이며 "비어있음"이 아닙니다) */
async function runRead(label, fn) {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { data, error } = await fn(sb);
    if (error) {
      if (isMissingTable(error)) setStatus('missing_tables');
      else setStatus('error');
      console.warn(`[Supabase ${label}]`, error.message || error);
      return null;
    }
    setStatus('connected');
    return data;
  } catch (e) {
    setStatus('error');
    console.warn(`[Supabase ${label}] exception:`, e.message || e);
    return null;
  }
}

export class SupabaseSyncEngine {
  /** 실시간 변경 구독 (categories 포함) */
  static subscribeToChanges(onUpdate) {
    const sb = getSupabase();
    if (!sb) return null;

    const tables = ['transactions', 'user_settings', 'budgets', 'goals', 'categories'];

    try {
      let channel = sb.channel('couple-db-sync');
      tables.forEach(table => {
        channel = channel.on(
          'postgres_changes',
          { event: '*', schema: 'public', table },
          (payload) => { if (onUpdate) onUpdate({ table, payload }); }
        );
      });

      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') setStatus('connected');
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setStatus('error');
      });

      return channel;
    } catch (e) {
      console.warn('Realtime subscription error:', e);
      return null;
    }
  }

  // --- Health Check ---
  static async checkConnection() {
    const sb = getSupabase();
    if (!sb) {
      setStatus('error');
      return false;
    }
    const data = await runRead('checkConnection', s => s.from('transactions').select('id').limit(1));
    return data !== null;
  }

  // --- Transactions ---
  static async fetchTransactions() {
    return runRead('fetchTransactions', s =>
      s.from('transactions').select('*').order('date', { ascending: false })
    );
  }

  static async upsertTransaction(tx) {
    return runWrite('upsertTransaction', s => s.from('transactions').upsert([tx]));
  }

  static async deleteTransaction(id) {
    return runWrite('deleteTransaction', s => s.from('transactions').delete().eq('id', id));
  }

  static async deleteTransactionsByIds(ids) {
    if (!ids || ids.length === 0) return true;
    return runWrite('deleteTransactionsByIds', s => s.from('transactions').delete().in('id', ids));
  }

  /** 모든 거래 삭제 (초기화 전용) */
  static async deleteAllTransactions() {
    return runWrite('deleteAllTransactions', s => s.from('transactions').delete().neq('id', '__never__'));
  }

  // --- Users ---
  static async fetchUsers() {
    const data = await runRead('fetchUsers', s => s.from('user_settings').select('*'));
    if (!Array.isArray(data) || data.length === 0) return null;
    const userMap = {};
    data.forEach(u => { userMap[u.id] = u; });
    return userMap;
  }

  static async saveUsers(usersMap) {
    const usersList = Object.values(usersMap || {});
    if (usersList.length === 0) return true;
    return runWrite('saveUsers', s => s.from('user_settings').upsert(usersList));
  }

  // --- Budgets ---
  static async fetchBudgets() {
    return runRead('fetchBudgets', s => s.from('budgets').select('*'));
  }

  static async upsertBudget(budgetObj) {
    return runWrite('upsertBudget', s => s.from('budgets').upsert([budgetObj]));
  }

  static async upsertBudgets(list) {
    if (!list || list.length === 0) return true;
    return runWrite('upsertBudgets', s => s.from('budgets').upsert(list));
  }

  static async deleteAllBudgets() {
    return runWrite('deleteAllBudgets', s => s.from('budgets').delete().neq('id', '__never__'));
  }

  // --- Goals ---
  static async fetchGoals() {
    return runRead('fetchGoals', s => s.from('goals').select('*'));
  }

  static async saveGoals(goalsList) {
    if (!goalsList || goalsList.length === 0) return true;
    return runWrite('saveGoals', s => s.from('goals').upsert(goalsList));
  }

  static async deleteGoal(id) {
    return runWrite('deleteGoal', s => s.from('goals').delete().eq('id', id));
  }

  static async deleteAllGoals() {
    return runWrite('deleteAllGoals', s => s.from('goals').delete().neq('id', '__never__'));
  }

  // --- Categories ---
  static async fetchCategories() {
    return runRead('fetchCategories', s => s.from('categories').select('*'));
  }

  static async saveCategories(catsList) {
    if (!catsList || catsList.length === 0) return true;
    return runWrite('saveCategories', s => s.from('categories').upsert(catsList));
  }
}
