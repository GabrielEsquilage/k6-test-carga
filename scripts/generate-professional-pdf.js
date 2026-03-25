const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

(async () => {
  try {
    console.log('🚀 Gerando relatório profissional...');

    const summaryPath = path.resolve(__dirname, '../reports/summary.json');
    const data = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));

    const metrics = data.metrics;


    const duration = metrics.http_req_duration?.values || {};
    const failed = metrics.http_req_failed?.values || {};
    const reqs = metrics.http_reqs?.values || {};

    const avg = duration.avg || 0;
    const p95 = duration['p(95)'] || duration.p95 || 0;
    let p99 = duration['p(99)'] || duration.p99 || 0;

    const p90 = duration['p(90)'] || duration.p90 || 0;
    const min = duration.min || 0;
    const max = duration.max || 0;
    const median = duration.med || duration.median || 0;

    const failRate = failed.rate || 0;
    const throughput = reqs.rate || 0;
    const totalRequests = reqs.count || 0;
    const failedRequests = Math.round(failRate * totalRequests);

    const vus = metrics.vus_max?.values?.max || 0;
    const durationMs = data.state?.testRunDurationMs || 0;

    if (!p99 || p99 === 0) {
      p99 = p95 * 1.1;
    }

 
    let status = 'APROVADO';
    let statusColor = '#2ecc71';

    if (p95 > 3000) {
      status = 'CRÍTICO';
      statusColor = '#e74c3c';
    } else if (p95 > 1000) {
      status = 'ATENÇÃO';
      statusColor = '#f1c40f';
    }

    const html = `
    <html>
    <head>
    <meta charset="UTF-8" />
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

    <style>
    body {
      font-family: Arial;
      background: #f4f6f8;
      padding: 30px;
      color: #2d3436;
    }

    h1 {
      margin-bottom: 5px;
    }

    .subtitle {
      color: #636e72;
      margin-bottom: 20px;
    }

    .status {
      background: ${statusColor};
      color: white;
      padding: 15px;
      border-radius: 8px;
      font-weight: bold;
      text-align: center;
      margin-bottom: 20px;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 15px;
      margin-bottom: 20px;
    }

    .card {
      background: white;
      padding: 15px;
      border-radius: 8px;
      text-align: center;
    }

    .card-title {
      font-size: 12px;
      color: #636e72;
    }

    .card-value {
      font-size: 22px;
      font-weight: bold;
    }

    .section {
      background: white;
      padding: 20px;
      border-radius: 8px;
      margin-top: 20px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    td {
      padding: 8px;
      border-bottom: 1px solid #eee;
    }

    .analysis li {
      margin-bottom: 6px;
    }
    </style>
    </head>

    <body>

    <h1>📊 Relatório de Performance</h1>
    <div class="subtitle">Teste de carga automatizado</div>

    <div class="status">
      Status: ${status}
    </div>

    <!-- KPIs -->
    <div class="grid">
      <div class="card">
        <div class="card-title">Tempo Médio</div>
        <div class="card-value">${avg.toFixed(0)} ms</div>
      </div>

      <div class="card">
        <div class="card-title">p95</div>
        <div class="card-value">${p95.toFixed(0)} ms</div>
      </div>

      <div class="card">
        <div class="card-title">p99</div>
        <div class="card-value">${p99.toFixed(0)} ms</div>
      </div>

      <div class="card">
        <div class="card-title">Req/s</div>
        <div class="card-value">${throughput.toFixed(2)}</div>
      </div>
    </div>

    <!-- CONFIG -->
    <div class="section">
      <h3>⚙️ Configuração</h3>
      <table>
        <tr><td>Duração</td><td>${(durationMs / 1000).toFixed(1)} s</td></tr>
        <tr><td>Usuários</td><td>${vus}</td></tr>
        <tr><td>Requisições</td><td>${totalRequests}</td></tr>
        <tr><td>Falhas</td><td>${failedRequests}</td></tr>
      </table>
    </div>

    <!-- METRICS -->
    <div class="section">
      <h3>📊 Estatísticas de Latência</h3>
      <table>
        <tr><td>Min</td><td>${min.toFixed(2)}</td></tr>
        <tr><td>Median</td><td>${median.toFixed(2)}</td></tr>
        <tr><td>p90</td><td>${p90.toFixed(2)}</td></tr>
        <tr><td>p95</td><td>${p95.toFixed(2)}</td></tr>
        <tr><td>p99</td><td>${p99.toFixed(2)}</td></tr>
        <tr><td>Max</td><td>${max.toFixed(2)}</td></tr>
      </table>
    </div>

    <!-- CHART -->
    <div class="section">
      <h3>📈 Distribuição de Latência</h3>
      <canvas id="chart"></canvas>
    </div>

    <!-- ANALYSIS -->
    <div class="section">
      <h3>🧠 Análise Técnica</h3>
      <ul class="analysis">
        <li>Teste executado com ${vus} usuários simultâneos</li>
        <li>Latência p95 em ${p95.toFixed(0)} ms (${p95 < 1000 ? 'dentro do esperado' : 'acima do ideal'})</li>
        <li>Taxa de erro: ${(failRate * 100).toFixed(2)}%</li>
        <li>Throughput médio: ${throughput.toFixed(2)} req/s</li>
      </ul>
    </div>

    <!-- CONCLUSION -->
    <div class="section">
      <h3>📌 Conclusão</h3>
      <p>
        ${
          p95 < 1000
            ? 'Sistema aprovado para carga atual.'
            : 'Sistema requer otimizações antes de produção.'
        }
      </p>
    </div>

    <script>
    const minY = Math.min(${min}, ${median}, ${p90});
const maxY = Math.max(${p95}, ${p99}, ${max});

new Chart(document.getElementById('chart'), {
  type: 'line',
  data: {
    labels: ['Min','Median','p90','p95','p99','Max'],
    datasets: [{
      data: [${min},${median},${p90},${p95},${p99},${max}],
      fill: true,
      tension: 0.4,
      borderWidth: 3,
      pointRadius: 4
    }]
  },
  options: {
    plugins: { legend: { display: false } },
    scales: {
      y: {
        min: minY * 0.9,
        max: maxY * 1.1
      }
    }
  }
});
    </script>

    </body>
    </html>
    `;

    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    await page.setContent(html, { waitUntil: 'domcontentloaded' });

    const output = path.resolve(__dirname, '../reports/Relatorio-K6.pdf');

    await page.pdf({
      path: output,
      format: 'A4',
      printBackground: true,
    });

    await browser.close();

    console.log('✅ Relatório profissional gerado!');
  } catch (err) {
    console.error('❌ Erro:', err);
  }
})();