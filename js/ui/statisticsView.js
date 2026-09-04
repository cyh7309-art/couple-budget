/**
 * Statistics View (통계 & 차트 분석 - Chart.js 연동)
 */

import { 
  formatCurrency, 
  formatPercent, 
  calculateMonthlySummary, 
  calculateCategoryBreakdown, 
  calculateUserBreakdown, 
  calculateFixedVsVariable, 
  calculateHistoricalTrends, 
  filterTransactionsByMonth 
} from '../calculations.js';
import { StorageManager } from '../storage.js';
import { esc } from '../utils.js';

export function renderStatisticsView(containerEl, currentMonthStr) {
  const transactions = StorageManager.getTransactions();
  const categories = StorageManager.getCategories();
  const users = StorageManager.getUsers();

  const husbandName = users.husband.name;
  const wifeName = users.wife.name;

  let activeTab = 'monthly'; // 'monthly' | 'trend' | 'category' | 'user'

  // ✅ Chart.js 인스턴스를 추적해 탭 전환 시 반드시 파기합니다.
  //    (기존에는 계속 쌓여 메모리 누수와 "Canvas is already in use" 오류를 유발했습니다)
  let chartInstance = null;
  function destroyChart() {
    if (chartInstance) {
      try { chartInstance.destroy(); } catch (e) { /* 이미 파기됨 */ }
      chartInstance = null;
    }
  }

  function renderTabContent() {
    destroyChart();
    const contentBox = containerEl.querySelector('#stats-tab-content');

    if (activeTab === 'monthly') {
      renderMonthlyAnalysis(contentBox);
    } else if (activeTab === 'trend') {
      renderTrendChart(contentBox);
    } else if (activeTab === 'category') {
      renderCategoryChart(contentBox);
    } else if (activeTab === 'user') {
      renderUserChart(contentBox);
    }
  }

  // --- Tab 1: Monthly Detailed Analysis ---
  function renderMonthlyAnalysis(targetEl) {
    const summary = calculateMonthlySummary(transactions, currentMonthStr);
    const catBreakdown = calculateCategoryBreakdown(transactions, categories, currentMonthStr);
    const fv = calculateFixedVsVariable(transactions, currentMonthStr);
    const userBd = calculateUserBreakdown(transactions, currentMonthStr);

    const monthTx = filterTransactionsByMonth(transactions, currentMonthStr).filter(t => t.type === 'expense');

    // Calculate Peak Spending Day & Daily Average
    const dayMap = {};
    monthTx.forEach(t => {
      dayMap[t.date] = (dayMap[t.date] || 0) + Number(t.amount || 0);
    });

    let maxDay = '-';
    let maxDayAmount = 0;
    Object.entries(dayMap).forEach(([date, amt]) => {
      if (amt > maxDayAmount) {
        maxDayAmount = amt;
        maxDay = date;
      }
    });

    const daysInMonth = new Date(
      parseInt(currentMonthStr.split('-')[0], 10),
      parseInt(currentMonthStr.split('-')[1], 10),
      0
    ).getDate();

    const dailyAvg = summary.totalExpense / daysInMonth;

    const topCategory = catBreakdown.categories[0] ? catBreakdown.categories[0].name : '없음';

    targetEl.innerHTML = `
      <div class="stats-cards-grid">
        <div class="card stat-metric-card">
          <span class="metric-icon">🏆</span>
          <div class="metric-title">가장 많이 쓴 카테고리</div>
          <div class="metric-value text-indigo">${esc(topCategory)}</div>
          <div class="metric-sub">${catBreakdown.categories[0] ? formatCurrency(catBreakdown.categories[0].amount) + ' (' + catBreakdown.categories[0].percentage.toFixed(1) + '%)' : ''}</div>
        </div>

        <div class="card stat-metric-card">
          <span class="metric-icon">📅</span>
          <div class="metric-title">지출 피크 날짜</div>
          <div class="metric-value text-rose">${esc(maxDay)}</div>
          <div class="metric-sub">${formatCurrency(maxDayAmount)} 소비</div>
        </div>

        <div class="card stat-metric-card">
          <span class="metric-icon">📆</span>
          <div class="metric-title">일평균 지출</div>
          <div class="metric-value text-cyan">${formatCurrency(dailyAvg)}</div>
          <div class="metric-sub">${daysInMonth}일 기준 계산</div>
        </div>

        <div class="card stat-metric-card">
          <span class="metric-icon">🔒</span>
          <div class="metric-title">고정비 비중</div>
          <div class="metric-value text-amber">${formatPercent(fv.fixedRatio)}</div>
          <div class="metric-sub">총 ${formatCurrency(fv.fixedAmount)}</div>
        </div>
      </div>

      <div class="card dash-card margin-top">
        <h3 class="card-title">💡 이번 달 종합 재정 진단</h3>
        <ul class="insight-bullets">
          <li>✨ <strong>이번 달 저축률:</strong> ${formatPercent(summary.savingsRate)} (수입 ${formatCurrency(summary.totalIncome)} 중 ${formatCurrency(summary.balance)} 저축)</li>
          <li>👫 <strong>공동/개인비율:</strong> 공동생활비가 전체 지출의 ${summary.totalExpense > 0 ? ((userBd.sharedAmount / summary.totalExpense) * 100).toFixed(1) : 0}%를 차지합니다.</li>
          <li>📌 <strong>고정비 vs 변동비:</strong> 고정 지출 ${formatCurrency(fv.fixedAmount)}, 변동 지출 ${formatCurrency(fv.variableAmount)}</li>
        </ul>
      </div>
    `;
  }

  // --- Tab 2: Historical Trends Chart ---
  function renderTrendChart(targetEl) {
    const trends = calculateHistoricalTrends(transactions, currentMonthStr, 6);

    targetEl.innerHTML = `
      <div class="card chart-card">
        <div class="chart-header">
          <h3 class="chart-title">📈 최근 6개월 수입 / 지출 / 저축 추이</h3>
        </div>
        <div class="chart-wrapper">
          <canvas id="canvas-trend-chart"></canvas>
        </div>
      </div>
    `;

    setTimeout(() => {
      const ctx = targetEl.querySelector('#canvas-trend-chart');
      if (!ctx || !window.Chart) return;

      const labels = trends.map(t => t.month);
      const incomes = trends.map(t => t.totalIncome);
      const expenses = trends.map(t => t.totalExpense);
      const savingsRates = trends.map(t => t.savingsRate);

      chartInstance = new window.Chart(ctx, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: '총수입 (원)',
              data: incomes,
              backgroundColor: 'rgba(16, 185, 129, 0.7)',
              borderColor: '#10b981',
              borderWidth: 1,
              borderRadius: 6
            },
            {
              label: '총지출 (원)',
              data: expenses,
              backgroundColor: 'rgba(244, 63, 94, 0.7)',
              borderColor: '#f43f5e',
              borderWidth: 1,
              borderRadius: 6
            },
            {
              label: '저축률 (%)',
              data: savingsRates,
              type: 'line',
              borderColor: '#6366f1',
              backgroundColor: '#6366f1',
              borderWidth: 3,
              yAxisID: 'y1',
              tension: 0.3
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                callback: value => (value / 10000).toLocaleString() + '만'
              }
            },
            y1: {
              position: 'right',
              beginAtZero: true,
              max: 100,
              grid: { drawOnChartArea: false },
              ticks: {
                callback: value => value + '%'
              }
            }
          }
        }
      });
    }, 50);
  }

  // --- Tab 3: Category Doughnut Chart ---
  function renderCategoryChart(targetEl) {
    const catBreakdown = calculateCategoryBreakdown(transactions, categories, currentMonthStr);

    targetEl.innerHTML = `
      <div class="card chart-card">
        <div class="chart-header">
          <h3 class="chart-title">🍩 카테고리별 지출 점유율</h3>
        </div>
        <div class="chart-flex-container">
          <div class="chart-wrapper-sm">
            <canvas id="canvas-cat-chart"></canvas>
          </div>
          <div class="cat-details-list">
            ${catBreakdown.categories.map(c => `
              <div class="cat-detail-row">
                <div class="cat-detail-left">
                  <span class="cat-dot" style="background: ${esc(c.color)}"></span>
                  <span>${esc(c.icon)} ${esc(c.name)}</span>
                </div>
                <div class="cat-detail-right">
                  <strong>${formatCurrency(c.amount)}</strong>
                  <span class="text-muted">(${c.percentage.toFixed(1)}%)</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;

    setTimeout(() => {
      const ctx = targetEl.querySelector('#canvas-cat-chart');
      if (!ctx || !window.Chart || catBreakdown.categories.length === 0) return;

      chartInstance = new window.Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: catBreakdown.categories.map(c => c.name),
          datasets: [{
            data: catBreakdown.categories.map(c => c.amount),
            backgroundColor: catBreakdown.categories.map(c => c.color),
            borderWidth: 2,
            borderColor: '#ffffff'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom' }
          }
        }
      });
    }, 50);
  }

  // --- Tab 4: User Comparison Chart ---
  function renderUserChart(targetEl) {
    const userBd = calculateUserBreakdown(transactions, currentMonthStr);

    targetEl.innerHTML = `
      <div class="card chart-card">
        <div class="chart-header">
          <h3 class="chart-title">👥 공동생활비 및 부부 개인지출 비교</h3>
        </div>
        <div class="chart-wrapper">
          <canvas id="canvas-user-chart"></canvas>
        </div>
        <div class="user-chart-summary">
          <div class="u-sum-item">
            <span>👫 공동생활비</span>
            <strong>${formatCurrency(userBd.sharedAmount)}</strong>
          </div>
          <div class="u-sum-item">
            <span>👨 ${esc(husbandName)} 총지출</span>
            <strong>${formatCurrency(userBd.husbandTotalSpent)}</strong>
          </div>
          <div class="u-sum-item">
            <span>👩 ${esc(wifeName)} 총지출</span>
            <strong>${formatCurrency(userBd.wifeTotalSpent)}</strong>
          </div>
        </div>
      </div>
    `;

    setTimeout(() => {
      const ctx = targetEl.querySelector('#canvas-user-chart');
      if (!ctx || !window.Chart) return;

      chartInstance = new window.Chart(ctx, {
        type: 'bar',
        data: {
          labels: ['공동생활비', `${husbandName} 개인지출`, `${wifeName} 개인지출`],
          datasets: [{
            label: '지출 금액 (원)',
            data: [userBd.sharedAmount, userBd.husbandPersonalAmount, userBd.wifePersonalAmount],
            backgroundColor: ['#6366f1', '#06b6d4', '#ec4899'],
            borderRadius: 8
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                callback: value => (value / 10000).toLocaleString() + '만'
              }
            }
          }
        }
      });
    }, 50);
  }

  // Shell Layout with Sub-Tabs
  containerEl.innerHTML = `
    <div class="card sub-tabs-card">
      <div class="sub-tabs">
        <button class="sub-tab-btn active" data-tab="monthly">📊 월간 종합 분석</button>
        <button class="sub-tab-btn" data-tab="trend">📈 최근 6개월 추이</button>
        <button class="sub-tab-btn" data-tab="category">🍩 카테고리 분포</button>
        <button class="sub-tab-btn" data-tab="user">👥 부부/공동 비교</button>
      </div>
    </div>

    <div id="stats-tab-content"></div>
  `;

  // Bind tab click events
  const tabBtns = containerEl.querySelectorAll('.sub-tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeTab = btn.getAttribute('data-tab');
      renderTabContent();
    });
  });

  // Initial tab render
  renderTabContent();
}
