/**
 * LocalStorage Data Manager
 * Handles persistence, fallback initialization, CRUD, JSON export & import
 */

import { DEFAULT_USERS, DEFAULT_CATEGORIES, DEFAULT_BUDGETS, DEFAULT_GOALS, DEFAULT_ACCOUNTS, generateInitialTransactions } from './models.js';

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
  }

  // --- Users ---
  static getUsers() {
    this.init();
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS));
  }

  static saveUsers(users) {
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
  }

  // --- Categories ---
  static getCategories() {
    this.init();
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.CATEGORIES));
  }

  static saveCategories(categories) {
    localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(categories));
  }

  // --- Transactions ---
  static getTransactions() {
    this.init();
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.TRANSACTIONS));
  }

  static saveTransactions(transactions) {
    localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(transactions));
  }

  static addTransaction(txData) {
    const transactions = this.getTransactions();
    const newTx = {
      id: 'tx_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...txData
    };
    transactions.unshift(newTx);
    this.saveTransactions(transactions);
    return newTx;
  }

  static updateTransaction(id, txData) {
    const transactions = this.getTransactions();
    const index = transactions.findIndex(t => t.id === id);
    if (index !== -1) {
      transactions[index] = {
        ...transactions[index],
        ...txData,
        updatedAt: new Date().toISOString()
      };
      this.saveTransactions(transactions);
      return transactions[index];
    }
    return null;
  }

  static deleteTransaction(id) {
    let transactions = this.getTransactions();
    transactions = transactions.filter(t => t.id !== id);
    this.saveTransactions(transactions);
  }

  // --- Budgets ---
  static getBudgets() {
    this.init();
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.BUDGETS));
  }

  static saveBudgets(budgets) {
    localStorage.setItem(STORAGE_KEYS.BUDGETS, JSON.stringify(budgets));
  }

  static setCategoryBudget(month, categoryId, amount) {
    const budgets = this.getBudgets();
    const existingIndex = budgets.findIndex(b => b.month === month && b.categoryId === categoryId);
    if (existingIndex !== -1) {
      budgets[existingIndex].amount = Number(amount);
    } else {
      budgets.push({
        id: 'b_' + month + '_' + categoryId,
        month,
        categoryId,
        amount: Number(amount)
      });
    }
    this.saveBudgets(budgets);
  }

  // --- Goals ---
  static getGoals() {
    this.init();
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.GOALS));
  }

  static saveGoals(goals) {
    localStorage.setItem(STORAGE_KEYS.GOALS, JSON.stringify(goals));
  }

  // --- Accounts ---
  static getAccounts() {
    this.init();
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.ACCOUNTS));
  }

  static saveAccounts(accounts) {
    localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(accounts));
  }

  // --- Reset & Backup / Restore ---
  static resetToSampleData() {
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(DEFAULT_USERS));
    localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(DEFAULT_CATEGORIES));
    localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(generateInitialTransactions()));
    localStorage.setItem(STORAGE_KEYS.BUDGETS, JSON.stringify(DEFAULT_BUDGETS));
    localStorage.setItem(STORAGE_KEYS.GOALS, JSON.stringify(DEFAULT_GOALS));
    localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(DEFAULT_ACCOUNTS));
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

  static importBackupData(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      if (data.users) localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(data.users));
      if (data.categories) localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(data.categories));
      if (data.transactions) localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(data.transactions));
      if (data.budgets) localStorage.setItem(STORAGE_KEYS.BUDGETS, JSON.stringify(data.budgets));
      if (data.goals) localStorage.setItem(STORAGE_KEYS.GOALS, JSON.stringify(data.goals));
      if (data.accounts) localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(data.accounts));
      return true;
    } catch (e) {
      console.error('Failed to import backup data:', e);
      return false;
    }
  }
}
