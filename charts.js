/* ─────────────────────────────────────────
   CHARTS.JS — Chart.js wrappers
   ───────────────────────────────────────── */

let _activeChart = null;

function destroyChart() {
  if (_activeChart) {
    _activeChart.destroy();
    _activeChart = null;
  }
}

function formatChartDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function createProgressionChart(canvasId, dataPoints, unit) {
  destroyChart();

  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const labels = dataPoints.map(p => formatChartDate(p.date));
  const values = dataPoints.map(p => p.value);

  const coral     = '#E8734A';
  const coralFill = 'rgba(232, 115, 74, 0.08)';
  const gridColor = 'rgba(232, 228, 223, 0.8)';
  const textColor = '#7A756E';

  _activeChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: values,
        borderColor: coral,
        backgroundColor: coralFill,
        borderWidth: 2.5,
        tension: 0.35,
        fill: true,
        pointBackgroundColor: coral,
        pointBorderColor: '#FFFFFF',
        pointBorderWidth: 2,
        pointRadius: dataPoints.length === 1 ? 6 : 4,
        pointHoverRadius: 7,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#2D2A26',
          titleColor: '#FAF8F5',
          bodyColor: '#FAF8F5',
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            label: ctx => `${ctx.parsed.y} ${unit}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: {
            color: textColor,
            font: { family: "'Inter', sans-serif", size: 11 },
            maxTicksLimit: 6,
          },
        },
        y: {
          grid: { color: gridColor, drawBorder: false },
          border: { display: false, dash: [4, 4] },
          ticks: {
            color: textColor,
            font: { family: "'Inter', sans-serif", size: 11 },
            callback: v => `${v}`,
          },
        },
      },
    },
  });
}
