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
  filterTransactionsByMonth,
  calculateSpendingPace,
  calculateMonthOverMonth
} from '../calculations.js';
import { StorageManager } from '../storage.js';
import { esc } from '../utils.js';

/** CSS 토큰의 실제 색값을 읽습니다 — Chart.js 는 var() 를 해석하지 못합니다 */
function token(name, fallback) {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  } catch (e) { return fallback; }
}

export function renderStatisticsView(containerEl, currentMonthStr) {
  const transactions = StorageManager.getTransactions();
  const categories = StorageManager.getCategories();
  const users = StorageManager.getUsers();

  const husbandName = users.husband.name;
  const wifeName = users.wife.name;

  let activeTab = 'monthly'; // 'monthly' | 'trend' | 'category' | 'user'

  // ✅ Chart.js 인스턴스를 추적해 탭 전환 시 반드시 파기합니다.
  //    (기존에는 계속 쌓여 메모리 누수와 "Canvas is already in use" 오류를 유발했습니다)
  let chartInstances = [];
  function destroyChart() {
    chartInstances.forEach(c => { try { c.destroy(); } catch (e) { /* 이미 파기됨 */ } });
    chartInstances = [];
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
    const pace = calculateSpendingPace(transactions, currentMonthStr);
    const mom = calculateMonthOverMonth(transactions, currentMonthStr);

    const monthTx = filterTransactionsByMonth(transactions, currentMonthStr).filter(t => t.type === 'expense');

    // 지출 피크 날짜
    const dayMap = {};
    monthTx.forEach(t => {
      dayMap[t.date] = (dayMap[t.date] || 0) + Number(t.amount || 0);
    });

    let maxDay = '-';
    let maxDayAmount = 0;
    Object.entries(dayMap).forEach(([date, amt]) => {
      if (amt > maxDayAmount) { maxDayAmount = amt; maxDay = date; }
    });

    // 요일별 지출 패턴
    const weekdayNames = ['일', '월', '화', '수', '목', '금', '토'];
    const weekdayTotals = new Array(7).fill(0);
    const weekdayCounts = new Array(7).fill(0);
    monthTx.forEach(t => {
      const d = new Date(t.date + 'T00:00:00');
      if (isNaN(d)) return;
      weekdayTotals[d.getDay()] += Number(t.amount || 0);
      weekdayCounts[d.getDay()] += 1;
    });
    let topWeekday = 0;
    weekdayTotals.forEach((v, i) => { if (v > weekdayTotals[topWeekday]) topWeekday = i; });

    const momText = mom.expenseChangePct === null
      ? `${esc(mom.prevMonthStr)} 데이터가 없어 비교할 수 없습니다.`
      : `${esc(mom.basisLabel)} 지출이 ${mom.expenseChangePct >= 0 ? '증가' : '감소'} ${Math.abs(mom.expenseChangePct).toFixed(1)}% (${formatCurrency(Math.abs(mom.expenseDiff))})`;

    targetEl.innerHTML = `
      <div class="stats-cards-grid">
        <div class="card stat-metric-card">
          <span class="metric-icon">🏆</span>
          <div class="metric-title">가장 많이 쓴 카테고리</div>
          <div class="metric-value text-indigo">${esc(catBreakdown.categories[0] ? catBreakdown.categories[0].name : '없음')}</div>
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
          <div class="metric-value text-cyan">${formatCurrency(pace.dailyAverage)}</div>
          <div class="metric-sub">경과 ${pace.daysElapsed}일 기준${pace.isCurrent ? ' (진행 중)' : ''}</div>
        </div>

        <div class="card stat-metric-card">
          <span class="metric-icon">🔮</span>
          <div class="metric-title">${pace.isCurrent ? '월말 예상 지출' : '고정비 비중'}</div>
          <div class="metric-value text-amber">
            ${pace.isCurrent ? formatCurrency(pace.projectedExpense) : formatPercent(fv.fixedRatio)}
          </div>
          <div class="metric-sub">
            ${pace.isCurrent
              ? `현재 속도 유지 시 · 예상 잔액 ${formatCurrency(pace.projectedBalance)}`
              : `총 ${formatCurrency(fv.fixedAmount)}`}
          </div>
        </div>
      </div>

      <div class="card dash-card margin-top">
        <h3 class="card-title">이번 달 종합 재정 진단</h3>
        <ul class="insight-bullets">
          <li>📊 <strong>지출 추세:</strong> ${momText}</li>
          <li>✨ <strong>가용 잔액률:</strong> ${formatPercent(summary.savingsRate)}
              (수입 ${formatCurrency(summary.totalIncome)} 중 ${formatCurrency(summary.balance)} 남음)
              ${pace.isCurrent ? `— 이 속도면 월말 ${formatPercent(pace.projectedSavingsRate)} 예상` : ''}</li>
          <li>👫 <strong>공동/개인 비율:</strong> 공동생활비가 전체 지출의
              ${summary.totalExpense > 0 ? ((userBd.sharedAmount / summary.totalExpense) * 100).toFixed(1) : 0}%를 차지합니다.</li>
          <li>📌 <strong>고정비 vs 변동비:</strong> 고정 ${formatCurrency(fv.fixedAmount)} (${fv.fixedRatio.toFixed(1)}%),
              변동 ${formatCurrency(fv.variableAmount)} — 고정비 비중이 높을수록 지출을 줄일 여지가 적습니다.</li>
          <li>🗓️ <strong>요일 패턴:</strong>
              ${weekdayTotals[topWeekday] > 0
                ? `<strong>${weekdayNames[topWeekday]}요일</strong>에 가장 많이 씁니다 (${formatCurrency(weekdayTotals[topWeekday])}, ${weekdayCounts[topWeekday]}건)`
                : '아직 분석할 지출이 없습니다.'}</li>
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
          <h3 class="chart-title">최근 6개월 수입 / 지출</h3>
        </div>
        <div class="chart-wrapper">
          <canvas id="canvas-trend-chart"></canvas>
        </div>
      </div>

      <div class="card chart-card margin-top">
        <div class="chart-header">
          <h3 class="chart-title">가용 잔액률 추이</h3>
          <span class="chart-note">수입에서 지출을 빼고 남은 비율</span>
        </div>
        <div class="chart-wrapper chart-wrapper-short">
          <canvas id="canvas-rate-chart"></canvas>
        </div>
      </div>
    `;

    requestAnimationFrame(() => {
      if (!window.Chart) return noteChartUnavailable(targetEl);
      const labels = trends.map(t => t.month);

      // ⚠️ 축을 두 개 쓰면(금액 + %) 같은 그림에서 두 척도를 비교하게 되어
      //    읽는 사람이 반드시 오해합니다. 그래서 차트를 둘로 나눴습니다.
      const ctx = targetEl.querySelector('#canvas-trend-chart');
      if (ctx) {
        chartInstances.push(new window.Chart(ctx, {
          type: 'bar',
          data: {
            labels,
            datasets: [
              { label: '수입', data: trends.map(t => t.totalIncome),
                backgroundColor: token('--mark-income', '#008D9A'), borderRadius: 4 },
              { label: '지출', data: trends.map(t => t.totalExpense),
                backgroundColor: token('--mark-expense', '#C45F2B'), borderRadius: 4 }
            ]
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { color: token('--text-body', '#70604E'), boxWidth: 12 } } },
            scales: {
              x: { grid: { display: false }, ticks: { color: token('--text-muted', '#827260') } },
              y: { beginAtZero: true,
                   grid: { color: token('--border', '#E9E4C2') },
                   ticks: { color: token('--text-muted', '#827260'),
                            callback: v => (v / 10000).toLocaleString() + '만' } }
            }
          }
        }));
      }

      const rateCtx = targetEl.querySelector('#canvas-rate-chart');
      if (rateCtx) {
        chartInstances.push(new window.Chart(rateCtx, {
          type: 'line',
          data: {
            labels,
            datasets: [{
              label: '가용 잔액률',
              data: trends.map(t => t.savingsRate),
              borderColor: token('--color-accent', '#895129'),
              backgroundColor: token('--color-accent', '#895129'),
              borderWidth: 2, pointRadius: 4, tension: 0.3
            }]
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { grid: { display: false }, ticks: { color: token('--text-muted', '#827260') } },
              y: { beginAtZero: true, max: 100,
                   grid: { color: token('--border', '#E9E4C2') },
                   ticks: { color: token('--text-muted', '#827260'), callback: v => v + '%' } }
            }
          }
        }));
      }
    });
  }

  // --- Tab 3: Category Ranked Bars ---
  function renderCategoryChart(targetEl) {
    const catBreakdown = calculateCategoryBreakdown(transactions, categories, currentMonthStr);
    const rows = catBreakdown.categories;
    const max = rows.length > 0 ? rows[0].amount : 0;

    // ⚠️ 도넛을 쓰지 않는 이유: 조각이 8개면 색만으로 구분이 불가능합니다.
    //    (적록색맹 ΔE 3.0, 정상 시야로도 5.0) 순위 막대는 길이와 이름이
    //    정체를 말해주므로 색을 하나만 써도 됩니다.
    targetEl.innerHTML = `
      <div class="card chart-card">
        <div class="chart-header">
          <h3 class="chart-title">카테고리별 지출</h3>
          <span class="chart-note">${esc(currentMonthStr)} · 많이 쓴 순</span>
        </div>

        ${rows.length === 0 ? `
          <div class="empty-state">
            <span class="empty-icon">📝</span>
            <p>이번 달 지출 기록이 없습니다.</p>
          </div>
        ` : `
          <div class="rank-list">
            ${rows.map(c => `
              <div class="rank-row">
                <div class="rank-head">
                  <span class="rank-name">${esc(c.icon)} ${esc(c.name)}</span>
                  <span class="rank-vals">
                    <strong>${formatCurrency(c.amount)}</strong>
                    <span class="rank-pct">${c.percentage.toFixed(1)}%</span>
                  </span>
                </div>
                <div class="rank-track">
                  <div class="rank-fill" style="width: ${max > 0 ? (c.amount / max) * 100 : 0}%"></div>
                </div>
                <span class="rank-count">${c.count}건</span>
              </div>
            `).join('')}
          </div>

          <div class="rank-total">
            <span>합계</span>
            <strong>${formatCurrency(catBreakdown.totalExpense)}</strong>
          </div>
        `}
      </div>
    `;
  }

  // --- Tab 4: User Comparison Chart ---
  function renderUserChart(targetEl) {
    const userBd = calculateUserBreakdown(transactions, currentMonthStr);

    targetEl.innerHTML = `
      <div class="card chart-card">
        <div class="chart-header">
          <h3 class="chart-title">공동생활비와 개인지출</h3>
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
            <span>👨 ${esc(husbandName)} 개인지출</span>
            <strong>${formatCurrency(userBd.husbandPersonalAmount)}</strong>
          </div>
          <div class="u-sum-item">
            <span>👩 ${esc(wifeName)} 개인지출</span>
            <strong>${formatCurrency(userBd.wifePersonalAmount)}</strong>
          </div>
        </div>
      </div>
    `;

    setTimeout(() => {
      const ctx = targetEl.querySelector('#canvas-user-chart');
      if (!window.Chart) return noteChartUnavailable(targetEl);
      if (!ctx) return;

      chartInstances.push(new window.Chart(ctx, {
        type: 'bar',
        data: {
          labels: ['공동생활비', `${husbandName} 개인지출`, `${wifeName} 개인지출`],
          datasets: [{
            label: '지출 금액 (원)',
            data: [userBd.sharedAmount, userBd.husbandPersonalAmount, userBd.wifePersonalAmount],
            backgroundColor: [
              token('--mark-shared', '#8D4A00'),
              token('--mark-husband', '#0093A1'),
              token('--mark-wife', '#DA9F22')
            ],
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { display: false }, ticks: { color: token('--text-muted', '#827260') } },
            y: {
              beginAtZero: true,
              grid: { color: token('--border', '#E9E4C2') },
              ticks: {
                color: token('--text-muted', '#827260'),
                callback: value => (value / 10000).toLocaleString() + '만'
              }
            }
          }
        }
      }));
    }, 50);
  }

  // Shell Layout with Sub-Tabs
  containerEl.innerHTML = `
    <div class="card sub-tabs-card">
      <div class="sub-tabs">
        <button class="sub-tab-btn active" data-tab="monthly">월간 종합</button>
        <button class="sub-tab-btn" data-tab="trend">6개월 추이</button>
        <button class="sub-tab-btn" data-tab="category">카테고리</button>
        <button class="sub-tab-btn" data-tab="user">부부 비교</button>
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

/**
 * 차트 라이브러리는 인터넷에서 받아옵니다.
 * 오프라인이거나 차단된 망이면 빈 흰 칸만 남아서 "고장난 것처럼" 보이기 때문에,
 * 그럴 때는 캔버스 자리에 한 줄로 이유를 적어 둡니다. (숫자는 위아래 표에 이미 있습니다)
 */
function noteChartUnavailable(root) {
  if (!root) return;
  root.querySelectorAll('.chart-wrapper').forEach(w => {
    if (w.querySelector('.chart-offline')) return;
    const p = document.createElement('p');
    p.className = 'chart-offline';
    p.textContent = '그래프를 불러오지 못했습니다. 인터넷에 연결되면 다시 표시됩니다.';
    w.appendChild(p);
  });
}
