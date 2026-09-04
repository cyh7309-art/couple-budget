/**
 * Default Categories, User Settings & Demo Datasets
 * Couple Finance Dashboard ("우리집 가계부")
 *
 * ⚠️ 중요: 예산/목표/계좌/거래의 "샘플 데이터"는 더 이상 기본값이 아닙니다.
 *    데모 데이터는 URL 에 ?demo=1 을 붙였을 때만 로드되며, 이 모드에서는
 *    클라우드(Supabase)에 절대 업로드되지 않습니다.
 */

export const DEFAULT_USERS = {
  husband: { id: 'husband', name: '남편', role: 'husband', avatar: '👨' },
  wife: { id: 'wife', name: '아내', role: 'wife', avatar: '👩' }
};

export const DEFAULT_CATEGORIES = [
  // Income Categories
  { id: 'cat_inc_salary', type: 'income', name: '급여', icon: '💵', color: '#10b981' },
  { id: 'cat_inc_side', type: 'income', name: '부수입', icon: '📈', color: '#3b82f6' },
  { id: 'cat_inc_biz', type: 'income', name: '사업소득', icon: '🏢', color: '#8b5cf6' },
  { id: 'cat_inc_allowance', type: 'income', name: '용돈', icon: '🎁', color: '#ec4899' },
  { id: 'cat_inc_refund', type: 'income', name: '환급', icon: '🔄', color: '#14b8a6' },
  { id: 'cat_inc_other', type: 'income', name: '기타수입', icon: '✨', color: '#64748b' },

  // Expense Categories
  { id: 'cat_exp_living', type: 'expense', name: '주거/공과금', icon: '🏠', color: '#6366f1' },
  { id: 'cat_exp_food', type: 'expense', name: '식비/외식', icon: '🍚', color: '#f59e0b' },
  { id: 'cat_exp_transport', type: 'expense', name: '교통/차량', icon: '🚗', color: '#06b6d4' },
  { id: 'cat_exp_shopping', type: 'expense', name: '쇼핑/의류', icon: '🛍️', color: '#ec4899' },
  { id: 'cat_exp_relation', type: 'expense', name: '관계/데이트', icon: '❤️', color: '#f43f5e' },
  { id: 'cat_exp_growth', type: 'expense', name: '자기계발/교육', icon: '📚', color: '#8b5cf6' },
  { id: 'cat_exp_finance', type: 'expense', name: '금융/보험', icon: '💰', color: '#10b981' },
  { id: 'cat_exp_other', type: 'expense', name: '기타지출', icon: '📦', color: '#64748b' }
];

/* --- 실사용 기본값: 전부 비어 있음 (가짜 숫자를 보여주지 않습니다) --- */
export const DEFAULT_BUDGETS = [];
export const DEFAULT_GOALS = [];
export const DEFAULT_ACCOUNTS = [];

/* ==========================================================================
   아래는 ?demo=1 전용 데모 데이터입니다. 클라우드에 절대 업로드되지 않습니다.
   ========================================================================== */

export const DEMO_BUDGETS = [
  { id: 'b_food', month: '2026-09', categoryId: 'cat_exp_food', amount: 700000 },
  { id: 'b_living', month: '2026-09', categoryId: 'cat_exp_living', amount: 850000 },
  { id: 'b_transport', month: '2026-09', categoryId: 'cat_exp_transport', amount: 250000 },
  { id: 'b_shopping', month: '2026-09', categoryId: 'cat_exp_shopping', amount: 300000 },
  { id: 'b_relation', month: '2026-09', categoryId: 'cat_exp_relation', amount: 300000 },
  { id: 'b_growth', month: '2026-09', categoryId: 'cat_exp_growth', amount: 200000 },
  { id: 'b_finance', month: '2026-09', categoryId: 'cat_exp_finance', amount: 600000 },
  { id: 'b_other', month: '2026-09', categoryId: 'cat_exp_other', amount: 150000 }
];

export const DEMO_GOALS = [
  { id: 'g1', name: '🏠 내 집 마련 주택자금', targetAmount: 50000000, currentAmount: 32500000, targetDate: '2027-12-31', icon: '🏠', color: '#6366f1' },
  { id: 'g2', name: '✈️ 부부 10주년 리프레시 여행', targetAmount: 6000000, currentAmount: 4200000, targetDate: '2027-06-30', icon: '✈️', color: '#06b6d4' },
  { id: 'g3', name: '🛡️ 우리집 비상금 펀드', targetAmount: 10000000, currentAmount: 8500000, targetDate: '2026-12-31', icon: '🛡️', color: '#10b981' }
];

export const DEMO_ACCOUNTS = [
  { id: 'acc1', name: '공동 생활비 통장', type: 'bank', owner: 'shared', balance: 4250000, bankName: '국민은행' },
  { id: 'acc2', name: '남편 월급 통장', type: 'bank', owner: 'husband', balance: 1850000, bankName: '신한은행' },
  { id: 'acc3', name: '아내 월급 통장', type: 'bank', owner: 'wife', balance: 2100000, bankName: '카카오뱅크' },
  { id: 'card1', name: '공동 신용카드', type: 'card', owner: 'shared', balance: -620000, bankName: '현대카드' }
];

export function generateDemoTransactions() {
  return [
    { id: 'tx_202609_inc1', date: '2026-09-01', type: 'income', amount: 3200000, userId: 'husband', categoryId: 'cat_inc_salary', sharedType: 'shared', paymentMethod: 'bank', isFixed: true, memo: '9월 남편 월급 입금', createdAt: '2026-09-01T09:00:00.000Z' },
    { id: 'tx_202609_inc2', date: '2026-09-01', type: 'income', amount: 2500000, userId: 'wife', categoryId: 'cat_inc_salary', sharedType: 'shared', paymentMethod: 'bank', isFixed: true, memo: '9월 아내 월급 입금', createdAt: '2026-09-01T09:05:00.000Z' },
    { id: 'tx_202609_inc3', date: '2026-09-03', type: 'income', amount: 350000, userId: 'husband', categoryId: 'cat_inc_side', sharedType: 'husband', paymentMethod: 'bank', isFixed: false, memo: '외주 프로젝트 부수입', createdAt: '2026-09-03T14:20:00.000Z' },

    { id: 'tx_202609_exp1', date: '2026-09-01', type: 'expense', amount: 800000, userId: 'husband', categoryId: 'cat_exp_living', sharedType: 'shared', paymentMethod: 'bank', isFixed: true, memo: '아파트 관리비 & 월세', createdAt: '2026-09-01T10:00:00.000Z' },
    { id: 'tx_202609_exp2', date: '2026-09-01', type: 'expense', amount: 450000, userId: 'wife', categoryId: 'cat_exp_finance', sharedType: 'shared', paymentMethod: 'bank', isFixed: true, memo: '부부 통합 실손/암보험료', createdAt: '2026-09-01T11:00:00.000Z' },
    { id: 'tx_202609_exp3', date: '2026-09-02', type: 'expense', amount: 142000, userId: 'wife', categoryId: 'cat_exp_food', sharedType: 'shared', paymentMethod: 'card', isFixed: false, memo: '이마트 주말 장보기', createdAt: '2026-09-02T16:30:00.000Z' },
    { id: 'tx_202609_exp4', date: '2026-09-03', type: 'expense', amount: 45000, userId: 'husband', categoryId: 'cat_exp_food', sharedType: 'shared', paymentMethod: 'card', isFixed: false, memo: '저녁 삼겹살 외식', createdAt: '2026-09-03T19:40:00.000Z' },
    { id: 'tx_202609_exp5', date: '2026-09-03', type: 'expense', amount: 12000, userId: 'husband', categoryId: 'cat_exp_food', sharedType: 'husband', paymentMethod: 'card', isFixed: false, memo: '점심 후 스타벅스 커피', createdAt: '2026-09-03T12:30:00.000Z' },
    { id: 'tx_202609_exp6', date: '2026-09-04', type: 'expense', amount: 85000, userId: 'wife', categoryId: 'cat_exp_shopping', sharedType: 'wife', paymentMethod: 'card', isFixed: false, memo: '가을 신상 블라우스 구매', createdAt: '2026-09-04T13:10:00.000Z' },
    { id: 'tx_202609_exp7', date: '2026-09-04', type: 'expense', amount: 68000, userId: 'husband', categoryId: 'cat_exp_relation', sharedType: 'shared', paymentMethod: 'card', isFixed: false, memo: '금요일 영화관 데이트 & 팝콘', createdAt: '2026-09-04T20:15:00.000Z' },
    { id: 'tx_202609_exp8', date: '2026-09-04', type: 'expense', amount: 55000, userId: 'husband', categoryId: 'cat_exp_transport', sharedType: 'shared', paymentMethod: 'card', isFixed: false, memo: '주유소 기름 만탱크 주유', createdAt: '2026-09-04T18:00:00.000Z' },

    { id: 'tx_202609_tr1', date: '2026-09-01', type: 'transfer', amount: 1500000, userId: 'husband', categoryId: '', sharedType: 'shared', paymentMethod: 'bank', isFixed: false, memo: '남편 월급계좌 → 공동 생활비 통장 이체', createdAt: '2026-09-01T09:10:00.000Z' },

    { id: 'h_08_inc', date: '2026-08-01', type: 'income', amount: 5800000, userId: 'husband', categoryId: 'cat_inc_salary', sharedType: 'shared', isFixed: true, memo: '8월 부부 급여 합산' },
    { id: 'h_08_exp1', date: '2026-08-10', type: 'expense', amount: 1650000, userId: 'husband', categoryId: 'cat_exp_living', sharedType: 'shared', isFixed: true, memo: '8월 고정비' },
    { id: 'h_08_exp2', date: '2026-08-20', type: 'expense', amount: 1530000, userId: 'wife', categoryId: 'cat_exp_food', sharedType: 'shared', isFixed: false, memo: '8월 변동비 식비/여가' },

    { id: 'h_07_inc', date: '2026-07-01', type: 'income', amount: 5600000, userId: 'husband', categoryId: 'cat_inc_salary', sharedType: 'shared', isFixed: true, memo: '7월 부부 급여 합산' },
    { id: 'h_07_exp1', date: '2026-07-10', type: 'expense', amount: 1620000, userId: 'husband', categoryId: 'cat_exp_living', sharedType: 'shared', isFixed: true, memo: '7월 고정비' },
    { id: 'h_07_exp2', date: '2026-07-20', type: 'expense', amount: 1600000, userId: 'wife', categoryId: 'cat_exp_relation', sharedType: 'shared', isFixed: false, memo: '7월 휴가/데이트' },

    { id: 'h_06_inc', date: '2026-06-01', type: 'income', amount: 5700000, userId: 'wife', categoryId: 'cat_inc_salary', sharedType: 'shared', isFixed: true, memo: '6월 부부 급여' },
    { id: 'h_06_exp1', date: '2026-06-12', type: 'expense', amount: 1600000, userId: 'husband', categoryId: 'cat_exp_living', sharedType: 'shared', isFixed: true, memo: '6월 고정비' },
    { id: 'h_06_exp2', date: '2026-06-25', type: 'expense', amount: 1450000, userId: 'wife', categoryId: 'cat_exp_food', sharedType: 'shared', isFixed: false, memo: '6월 생활/식비' },

    { id: 'h_05_inc', date: '2026-05-01', type: 'income', amount: 5500000, userId: 'husband', categoryId: 'cat_inc_salary', sharedType: 'shared', isFixed: true, memo: '5월 부부 급여' },
    { id: 'h_05_exp1', date: '2026-05-15', type: 'expense', amount: 1600000, userId: 'husband', categoryId: 'cat_exp_living', sharedType: 'shared', isFixed: true, memo: '5월 고정비' },
    { id: 'h_05_exp2', date: '2026-05-28', type: 'expense', amount: 1520000, userId: 'wife', categoryId: 'cat_exp_relation', sharedType: 'shared', isFixed: false, memo: '5월 어버이날/가족' },

    { id: 'h_04_inc', date: '2026-04-01', type: 'income', amount: 5400000, userId: 'husband', categoryId: 'cat_inc_salary', sharedType: 'shared', isFixed: true, memo: '4월 부부 급여' },
    { id: 'h_04_exp1', date: '2026-04-10', type: 'expense', amount: 1580000, userId: 'husband', categoryId: 'cat_exp_living', sharedType: 'shared', isFixed: true, memo: '4월 고정비' },
    { id: 'h_04_exp2', date: '2026-04-22', type: 'expense', amount: 1680000, userId: 'wife', categoryId: 'cat_exp_shopping', sharedType: 'shared', isFixed: false, memo: '4월 가전제품' }
  ];
}

/** 과거 버전이 클라우드/로컬에 심어둔 샘플 데이터를 식별하기 위한 ID 접두사 */
export const SAMPLE_ID_PREFIXES = ['tx_202609_', 'h_04_', 'h_05_', 'h_06_', 'h_07_', 'h_08_'];
export const SAMPLE_BUDGET_IDS = DEMO_BUDGETS.map(b => b.id);
export const SAMPLE_GOAL_IDS = DEMO_GOALS.map(g => g.id);

export function isSampleTransactionId(id) {
  return SAMPLE_ID_PREFIXES.some(p => String(id || '').startsWith(p));
}
