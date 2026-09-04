/**
 * Supabase Client & Real-time Data Synchronization Manager
 * Couple Finance Dashboard ("우리집 가계부")
 */

export const SUPABASE_URL = 'https://jzxkxyxlbaedeeaimrlo.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6eGt4eXhsYmFlZGVlYWltcmxvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg1MjYzODYsImV4cCI6MjE0NDEwMjM4Nn0.vHlMgVktBM9gJlSpBMcg8lK_NP1yE7N6UXvVwqQJ7QQ';

let supabase = null;
let connectionStatus = 'checking';

export function getSupabase() {
  if (!supabase && window.supabase) {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return supabase;
}

export function getConnectionStatus() {
  return connectionStatus;
}

export class SupabaseSyncEngine {
  /**
   * Subscribe to real-time changes across all key tables in Supabase JS v2
   */
  static subscribeToChanges(onUpdate) {
    const sb = getSupabase();
    if (!sb) return null;

    try {
      const channel = sb
        .channel('couple-db-sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, (payload) => {
          console.log('[Supabase Realtime] Transactions change:', payload);
          if (onUpdate) onUpdate(payload);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'user_settings' }, (payload) => {
          console.log('[Supabase Realtime] Users change:', payload);
          if (onUpdate) onUpdate(payload);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'budgets' }, (payload) => {
          console.log('[Supabase Realtime] Budgets change:', payload);
          if (onUpdate) onUpdate(payload);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'goals' }, (payload) => {
          console.log('[Supabase Realtime] Goals change:', payload);
          if (onUpdate) onUpdate(payload);
        })
        .subscribe((status) => {
          console.log('[Supabase Channel Status]:', status);
          if (status === 'SUBSCRIBED') {
            connectionStatus = 'connected';
          }
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
      connectionStatus = 'error';
      return false;
    }
    try {
      const { data, error } = await sb.from('transactions').select('id').limit(1);
      if (error) {
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          connectionStatus = 'missing_tables';
        } else {
          connectionStatus = 'error';
        }
        return false;
      }
      connectionStatus = 'connected';
      return true;
    } catch (e) {
      connectionStatus = 'error';
      return false;
    }
  }

  // --- Transactions DB Operations ---
  static async fetchTransactions() {
    const sb = getSupabase();
    if (!sb) return null;
    try {
      const { data, error } = await sb
        .from('transactions')
        .select('*')
        .order('date', { ascending: false });
      if (error) throw error;
      connectionStatus = 'connected';
      return data;
    } catch (e) {
      console.warn('Supabase fetchTransactions error:', e.message);
      return null;
    }
  }

  static async upsertTransaction(tx) {
    const sb = getSupabase();
    if (!sb) return null;
    try {
      const { data, error } = await sb.from('transactions').upsert([tx]);
      if (error) throw error;
      connectionStatus = 'connected';
      return data;
    } catch (e) {
      console.warn('Supabase upsertTransaction error:', e.message);
      return null;
    }
  }

  static async deleteTransaction(id) {
    const sb = getSupabase();
    if (!sb) return null;
    try {
      const { error } = await sb.from('transactions').delete().eq('id', id);
      if (error) throw error;
      return true;
    } catch (e) {
      console.warn('Supabase deleteTransaction error:', e.message);
      return false;
    }
  }

  // --- Users DB Operations ---
  static async fetchUsers() {
    const sb = getSupabase();
    if (!sb) return null;
    try {
      const { data, error } = await sb.from('user_settings').select('*');
      if (error) throw error;
      if (data && data.length > 0) {
        const userMap = {};
        data.forEach(u => { userMap[u.id] = u; });
        return userMap;
      }
      return null;
    } catch (e) {
      console.warn('Supabase fetchUsers error:', e.message);
      return null;
    }
  }

  static async saveUsers(usersMap) {
    const sb = getSupabase();
    if (!sb) return null;
    try {
      const usersList = Object.values(usersMap);
      const { error } = await sb.from('user_settings').upsert(usersList);
      if (error) throw error;
      return true;
    } catch (e) {
      console.warn('Supabase saveUsers error:', e.message);
      return false;
    }
  }

  // --- Budgets DB Operations ---
  static async fetchBudgets() {
    const sb = getSupabase();
    if (!sb) return null;
    try {
      const { data, error } = await sb.from('budgets').select('*');
      if (error) throw error;
      return data;
    } catch (e) {
      console.warn('Supabase fetchBudgets error:', e.message);
      return null;
    }
  }

  static async upsertBudget(budgetObj) {
    const sb = getSupabase();
    if (!sb) return null;
    try {
      const { error } = await sb.from('budgets').upsert([budgetObj]);
      if (error) throw error;
      return true;
    } catch (e) {
      console.warn('Supabase upsertBudget error:', e.message);
      return false;
    }
  }

  // --- Goals DB Operations ---
  static async fetchGoals() {
    const sb = getSupabase();
    if (!sb) return null;
    try {
      const { data, error } = await sb.from('goals').select('*');
      if (error) throw error;
      return data;
    } catch (e) {
      console.warn('Supabase fetchGoals error:', e.message);
      return null;
    }
  }

  static async saveGoals(goalsList) {
    const sb = getSupabase();
    if (!sb) return null;
    try {
      const { error } = await sb.from('goals').upsert(goalsList);
      if (error) throw error;
      return true;
    } catch (e) {
      console.warn('Supabase saveGoals error:', e.message);
      return false;
    }
  }
}
