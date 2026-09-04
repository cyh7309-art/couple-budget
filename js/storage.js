/**
 * LocalStorage & Supabase Hybrid Storage Manager
 * Couple Finance Dashboard ("우리집 가계부")
 */

import { DEFAULT_USERS, DEFAULT_CATEGORIES, DEFAULT_BUDGETS, DEFAULT_GOALS, DEFAULT_ACCOUNTS, generateInitialTransactions } from './models.js';
import { SupabaseSyncEngine } from './supabaseClient.js';

const STORAGE_KEYS = {
  USERS: 'couple_finance_users',
  CATEGORIES: 'couple_finance_categories',
  TRANSACTIONS: 'couple_finance_transactions',
  BUDGETS: 'couple_finance_budgets',
  GOALS: 'couple_finance_goals',
  ACCOUNTS: 'couple_finance_accounts'
};

export class StorageManager {
  static init() {
    if (!localStorage.getItem(STORAGE_KEYS.USERS)) {
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(DEFAULT_USERS));
    }
    if (!localStorage.getItem(STORAGE_KEYS.CATEGORIES)) {
      localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(DEFAULT_CATEGORIES));
    }
    if (!localStorage.getItem(STORAGE_KEYS.TRANSACTIONS)) {
      localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(generateInitialTransactions()));
    }
    if (!localStorage.getItem(STORAGE_KEYS.BUDGETS)) {
      localStorage.setItem(STORAGE_KEYS.BUDGETS, JSON.stringify(DEFAULT_BUDGETS));
    }
    if (!localStorage.getItem(STORAGE_KEYS.GOALS)) {
      localStorage.setItem(STORAGE_KEYS.GOALS, JSON.stringify(DEFAULT_GOALS));
    }
    if (!localStorage.getItem(STORAGE_KEYS.ACCOUNTS)) {
      localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(DEFAULT_ACCOUNTS));
    }

    // Background Cloud Sync on start
    this.syncFromCloud();
  }

  static async syncFromCloud() {
    try {
      // 1. Transactions
      const cloudTx = await SupabaseSyncEngine.fetchTransactions();
      if (cloudTx && Array.isArray(cloudTx)) {
        if (cloudTx.length > 0) {
          localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(cloudTx));
        } else {
          // If Supabase table is empty, upload local transactions
          const localTx = this.getTransactions();
          for (const tx of localTx) {
            await SupabaseSyncEngine.upsertTransaction(tx);
          }
        }
      }

      // 2. Users
      const cloudUsers = await SupabaseSyncEngine.fetchUsers();
      if (cloudUsers) {
        localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(cloudUsers));
      } else {
        await SupabaseSyncEngine.saveUsers(this.getUsers());
      }

      // 3. Budgets
      const cloudBudgets = await SupabaseSyncEngine.fetchBudgets();
      if (cloudBudgets && Array.isArray(cloudBudgets) && cloudBudgets.length > 0) {
        localStorage.setItem(STORAGE_KEYS.BUDGETS, JSON.stringify(cloudBudgets));
      }

      // 4. Goals
      const cloudGoals = await SupabaseSyncEngine.fetchGoals();
      if (cloudGoals && Array.isArray(cloudGoals) && cloudGoals.length > 0) {
        localStorage.setItem(STORAGE_KEYS.GOALS, JSON.stringify(cloudGoals));
      }

      return true;
    } catch (e) {
      console.warn('Cloud sync from server error:', e.message);
      return false;
    }
  }

  // --- Users ---
  static getUsers() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS)) || DEFAULT_USERS;
  }

  static async saveUsers(users) {
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
    await SupabaseSyncEngine.saveUsers(users);
  }

  // --- Categories ---
  static getCategories() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.CATEGORIES)) || DEFAULT_CATEGORIES;
  }

  static async saveCategories(categories) {
    localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(categories));
    await SupabaseSyncEngine.saveCategories(categories);
  }

  // --- Transactions ---
  static getTransactions() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.TRANSACTIONS)) || [];
  }

  static saveTransactions(transactions) {
    localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(transactions));
  }

  static async addTransaction(txData) {
    const transactions = this.getTransactions();
    const newTx = {
      id: 'tx_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...txData
    };
    transactions.unshift(newTx);
    this.saveTransactions(transactions);

    // Immediate sync to Supabase Cloud DB
    await SupabaseSyncEngine.upsertTransaction(newTx);
    return newTx;
  }

  static async updateTransaction(id, txData) {
    const transactions = this.getTransactions();
    const index = transactions.findIndex(t => t.id === id);
    if (index !== -1) {
      transactions[index] = {
        ...transactions[index],
        ...txData,
        updatedAt: new Date().toISOString()
      };
      this.saveTransactions(transactions);

      // Immediate sync to Supabase Cloud DB
      await SupabaseSyncEngine.upsertTransaction(transactions[index]);
      return transactions[index];
    }
    return null;
  }

  static async deleteTransaction(id) {
    let transactions = this.getTransactions();
    transactions = transactions.filter(t => t.id !== id);
    this.saveTransactions(transactions);

    // Immediate sync to Supabase Cloud DB
    await SupabaseSyncEngine.deleteTransaction(id);
  }

  // --- Budgets ---
  static getBudgets() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.BUDGETS)) || DEFAULT_BUDGETS;
  }

  static saveBudgets(budgets) {
    localStorage.setItem(STORAGE_KEYS.BUDGETS, JSON.stringify(budgets));
  }

  static async setCategoryBudget(month, categoryId, amount) {
    const budgets = this.getBudgets();
    const existingIndex = budgets.findIndex(b => b.month === month && b.categoryId === categoryId);
    let budgetObj;
    if (existingIndex !== -1) {
      budgets[existingIndex].amount = Number(amount);
      budgetObj = budgets[existingIndex];
    } else {
      budgetObj = {
        id: 'b_' + month + '_' + categoryId,
        month,
        categoryId,
        amount: Number(amount)
      };
      budgets.push(budgetObj);
    }
    this.saveBudgets(budgets);

    // Sync to Supabase
    await SupabaseSyncEngine.upsertBudget(budgetObj);
  }

  // --- Goals ---
  static getGoals() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.GOALS)) || DEFAULT_GOALS;
  }

  static async saveGoals(goals) {
    localStorage.setItem(STORAGE_KEYS.GOALS, JSON.stringify(goals));
    await SupabaseSyncEngine.saveGoals(goals);
  }

  // --- Accounts ---
  static getAccounts() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.ACCOUNTS)) || DEFAULT_ACCOUNTS;
  }

  static saveAccounts(accounts) {
    localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(accounts));
  }

  // --- Reset & Backup / Restore ---
  static async resetToSampleData() {
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(DEFAULT_USERS));
    localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(DEFAULT_CATEGORIES));
    localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(generateInitialTransactions()));
    localStorage.setItem(STORAGE_KEYS.BUDGETS, JSON.stringify(DEFAULT_BUDGETS));
    localStorage.setItem(STORAGE_KEYS.GOALS, JSON.stringify(DEFAULT_GOALS));
    localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(DEFAULT_ACCOUNTS));

    const transactions = generateInitialTransactions();
    for (const t of transactions) {
      await SupabaseSyncEngine.upsertTransaction(t);
    }
    await SupabaseSyncEngine.saveUsers(DEFAULT_USERS);
    await SupabaseSyncEngine.saveCategories(DEFAULT_CATEGORIES);
    await SupabaseSyncEngine.saveGoals(DEFAULT_GOALS);
  }

  static clearAllData() {
    localStorage.removeItem(STORAGE_KEYS.USERS);
    localStorage.removeItem(STORAGE_KEYS.CATEGORIES);
    localStorage.removeItem(STORAGE_KEYS.TRANSACTIONS);
    localStorage.removeItem(STORAGE_KEYS.BUDGETS);
    localStorage.removeItem(STORAGE_KEYS.GOALS);
    localStorage.removeItem(STORAGE_KEYS.ACCOUNTS);
    this.init();
  }

  static exportBackupData() {
    const backupObj = {
      users: this.getUsers(),
      categories: this.getCategories(),
      transactions: this.getTransactions(),
      budgets: this.getBudgets(),
      goals: this.getGoals(),
      accounts: this.getAccounts(),
      exportedAt: new Date().toISOString()
    };
    return JSON.stringify(backupObj, null, 2);
  }

  static async importBackupData(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      if (data.users) await this.saveUsers(data.users);
      if (data.categories) await this.saveCategories(data.categories);
      if (data.transactions) {
        this.saveTransactions(data.transactions);
        for (const t of data.transactions) {
          await SupabaseSyncEngine.upsertTransaction(t);
        }
      }
      if (data.budgets) {
        this.saveBudgets(data.budgets);
        for (const b of data.budgets) {
          await SupabaseSyncEngine.upsertBudget(b);
        }
      }
      if (data.goals) await this.saveGoals(data.goals);
      if (data.accounts) this.saveAccounts(data.accounts);
      return true;
    } catch (e) {
      console.error('Failed to import backup data:', e);
      return false;
    }
  }
}
