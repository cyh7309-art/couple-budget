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

    const tables = ['transactions', 'user_settings', 'budgets', 'goals', 'categories',
                    'accounts', 'recurring', 'settlements', 'app_settings'];

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

  // --- Accounts ---
  static async fetchAccounts() {
    return runRead('fetchAccounts', s => s.from('accounts').select('*'));
  }

  static async saveAccounts(list) {
    if (!list || list.length === 0) return true;
    return runWrite('saveAccounts', s => s.from('accounts').upsert(list));
  }

  static async deleteAccount(id) {
    return runWrite('deleteAccount', s => s.from('accounts').delete().eq('id', id));
  }

  static async deleteAllAccounts() {
    return runWrite('deleteAllAccounts', s => s.from('accounts').delete().neq('id', '__never__'));
  }

  // --- Recurring (반복 거래 템플릿) ---
  static async fetchRecurring() {
    return runRead('fetchRecurring', s => s.from('recurring').select('*'));
  }

  static async saveRecurring(list) {
    if (!list || list.length === 0) return true;
    return runWrite('saveRecurring', s => s.from('recurring').upsert(list));
  }

  static async deleteRecurring(id) {
    return runWrite('deleteRecurring', s => s.from('recurring').delete().eq('id', id));
  }

  static async deleteAllRecurring() {
    return runWrite('deleteAllRecurring', s => s.from('recurring').delete().neq('id', '__never__'));
  }

  // --- Settlements (정산 이력) ---
  static async fetchSettlements() {
    return runRead('fetchSettlements', s => s.from('settlements').select('*').order('month', { ascending: false }));
  }

  static async saveSettlements(list) {
    if (!list || list.length === 0) return true;
    return runWrite('saveSettlements', s => s.from('settlements').upsert(list));
  }

  static async deleteSettlement(id) {
    return runWrite('deleteSettlement', s => s.from('settlements').delete().eq('id', id));
  }

  static async deleteAllSettlements() {
    return runWrite('deleteAllSettlements', s => s.from('settlements').delete().neq('id', '__never__'));
  }

  // --- App Settings (부부 공유 설정) ---
  static async fetchAppSettings() {
    const rows = await runRead('fetchAppSettings', s =>
      s.from('app_settings').select('*').eq('id', 'household').limit(1));
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return rows[0].data || null;
  }

  static async saveAppSettings(data) {
    return runWrite('saveAppSettings', s =>
      s.from('app_settings').upsert([{ id: 'household', data }]));
  }

  // --- 부부의 도전 (식단·운동·몸무게 기록) ---
  //
  // 새 테이블을 만들지 않고 app_settings(id, data jsonb)에 'chl_' 로 시작하는 행으로 넣습니다.
  // 이 테이블은 이미 RLS·실시간이 켜져 있어서, SQL 을 다시 실행하지 않아도 바로 동기화됩니다.
  // (공유 설정은 id = 'household' 한 행만 읽으므로 서로 섞이지 않습니다)
  static async fetchChallengeLogs() {
    // PostgREST 는 한 번에 최대 1000행만 돌려줍니다. 잘린 결과를 "전부"로 믿으면
    // 병합 단계가 나머지 기록을 '상대가 지운 것'으로 오해하므로 끝까지 읽습니다.
    const PAGE = 1000;
    const all = [];
    for (let from = 0; ; from += PAGE) {
      const rows = await runRead('fetchChallengeLogs', s =>
        s.from('app_settings').select('*').like('id', 'chl_%').order('id').range(from, from + PAGE - 1));
      if (!Array.isArray(rows)) return null;
      all.push(...rows);
      if (rows.length < PAGE) break;
    }
    return all
      .filter(r => r && String(r.id).startsWith('chl_') && r.data && typeof r.data === 'object')
      .map(r => ({ ...r.data, id: r.id }));
  }

  static async saveChallengeLogs(list) {
    if (!list || list.length === 0) return true;
    return runWrite('saveChallengeLogs', s =>
      s.from('app_settings').upsert(list.map(log => ({ id: log.id, data: log }))));
  }

  static async deleteChallengeLog(id) {
    return runWrite('deleteChallengeLog', s => s.from('app_settings').delete().eq('id', id));
  }

  static async deleteAllChallengeLogs() {
    return runWrite('deleteAllChallengeLogs', s =>
      s.from('app_settings').delete().like('id', 'chl_%'));
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
