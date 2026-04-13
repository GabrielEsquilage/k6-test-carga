const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

(async () => {
  try {
    console.log("🚀 Gerando relatório HTML para e-mail...");

    const reportsDir = path.resolve(__dirname, "../reports");

    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir);
    }

    const summaryPath = path.resolve(reportsDir, "summary.json");

    if (!fs.existsSync(summaryPath)) {
      throw new Error("❌ summary.json não encontrado. Execute o K6 antes.");
    }

    const data = JSON.parse(fs.readFileSync(summaryPath, "utf8"));

    if (!data || !data.metrics) {
      throw new Error("❌ Dados inválidos do K6");
    }

    const metrics = data.metrics;

    const csvPath = path.resolve(reportsDir, "resultado.csv");
    const allLatencies = [];

    if (fs.existsSync(csvPath)) {
      const content = fs.readFileSync(csvPath, "utf-8");
      const lines = content.split("\n");

      // Identifica o índice das colunas (geralmente 0=name, 2=value)
      lines.slice(1).forEach((line) => {
        if (!line.trim()) return;
        const cols = line.split(",");

        // Filtra apenas métricas de latência de requisição HTTP
        if (cols[0] === "http_req_duration") {
          const latency = Number(cols[2]);
          if (!isNaN(latency) && latency > 0) {
            allLatencies.push(latency);
          }
        }
      });
    }

    // Latências para o gráfico de evolução (limitado a 100 pontos para performance)
    const latencies = allLatencies.slice(0, 100);

    const duration =
      metrics.http_req_duration?.values || metrics.http_req_duration || {};
    const failed =
      metrics.http_req_failed?.values || metrics.http_req_failed || {};
    const reqs = metrics.http_reqs?.values || metrics.http_reqs || {};

    const avg = duration.avg || 0;
    const p90 = duration["p(90)"] || 0;
    const p95 = duration["p(95)"] || 0;
    let p99 = duration["p(99)"] || 0;

    const min = duration.min || 0;
    const max = duration.max || 0;
    const median = duration.med || duration.median || 0;

    const failRate = failed.rate || 0;
    const throughput = reqs.rate || 0;
    const totalRequests = reqs.count || 0;
    const failedRequests = Math.round(failRate * totalRequests);

    // Cálculo da distribuição de latência (Buckets) usando as latências filtradas
    const buckets = [
      { label: "< 200ms", max: 200, count: 0 },
      { label: "200ms - 500ms", min: 200, max: 500, count: 0 },
      { label: "500ms - 1s", min: 500, max: 1000, count: 0 },
      { label: "1s - 2s", min: 1000, max: 2000, count: 0 },
      { label: "2s - 5s", min: 2000, max: 5000, count: 0 },
      { label: "> 5s", min: 5000, count: 0 },
    ];

    allLatencies.forEach((l) => {
      for (const b of buckets) {
        if (b.max && l < b.max && (!b.min || l >= b.min)) {
          b.count++;
          break;
        } else if (!b.max && l >= b.min) {
          b.count++;
          break;
        }
      }
    });

    // Se houver discrepância entre o total do resumo e o total do CSV,
    // priorizamos o total do CSV para a distribuição para fechar 100%
    const totalProcessed = allLatencies.length || totalRequests || 1;
    const bucketHtml = buckets
      .filter((b) => b.count > 0)
      .map((b) => {
        const percentage = ((b.count / totalProcessed) * 100).toFixed(1);
        return `<tr><td>${b.label}</td><td>${b.count} reqs</td><td>${percentage}%</td></tr>`;
      })
      .join("");

    let vus =
      data.metrics?.vus_max?.values?.max ||
      data.metrics?.vus_max?.max ||
      data.metrics?.vus?.values?.max ||
      data.metrics?.vus?.max;

    if (!vus || vus === 0) {
      vus =
        data.options?.stages?.reduce((max, stage) => {
          return stage.target > max ? stage.target : max;
        }, 0) || 1;
    }

    const durationMs =
      data.state?.testRunDurationMs ||
      data.metrics?.iteration_duration?.values?.count * (duration.avg || 1) ||
      30000;

    if (!p99 || p99 === 0) {
      p99 = p95 * 1.1;
    }

    let status = "APROVADO";
    let statusColor = "#2ecc71";

    if (p95 > 3000) {
      status = "CRÍTICO";
      statusColor = "#e74c3c";
    } else if (p95 > 1000) {
      status = "ATENÇÃO";
      statusColor = "#f1c40f";
    }

    let analysisText = "";
    if (p95 < 500)
      analysisText = "Sistema altamente performático mesmo sob carga.";
    else if (p95 < 1000)
      analysisText =
        "Sistema estável, porém apresenta leve degradação sob carga.";
    else
      analysisText =
        "Sistema apresenta degradação significativa sob carga elevada.";

    let errorAnalysis =
      failedRequests > 0
        ? `Foram identificadas ${failedRequests} falhas durante o teste.`
        : "Nenhuma falha detectada durante o teste.";

    // HTML Template para o Puppeteer renderizar
    const templateHtml = `
<html>
<head>
  <meta charset="UTF-8" />
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    body { font-family: Arial, sans-serif; background: #f4f6f8; padding: 20px; color: #2d3436; }
    .container { max-width: 800px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; }
    .status { color: white; padding: 15px; border-radius: 8px; font-weight: bold; text-align: center; margin-bottom: 20px; }
    .grid { display: table; width: 100%; border-spacing: 10px; margin-bottom: 20px; }
    .card { display: table-cell; background: #f8f9fa; padding: 15px; border-radius: 8px; text-align: center; width: 25%; }
    .card-title { font-size: 12px; color: #636e72; }
    .card-value { font-size: 20px; font-weight: bold; }
    .section { margin-top: 20px; border-top: 1px solid #eee; padding-top: 20px; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #f8f9fa; padding: 10px; text-align: left; border-bottom: 2px solid #dee2e6; }
    td { padding: 8px; border-bottom: 1px solid #eee; }
    .chart-container { width: 100%; height: 300px; margin-bottom: 20px; }
    canvas { width: 100% !important; height: 300px !important; }
  </style>
</head>
<body>
  <div class="container">
    <h1>📊 Relatório de Performance</h1>
    <div class="status" style="background:${statusColor}">Status: ${status}</div>

    <div class="grid">
      <div class="card"><div class="card-title">Médio</div><div class="card-value">${avg.toFixed(0)}ms</div></div>
      <div class="card"><div class="card-title">p95</div><div class="card-value">${p95.toFixed(0)}ms</div></div>
      <div class="card"><div class="card-title">p99</div><div class="card-value">${p99.toFixed(0)}ms</div></div>
      <div class="card"><div class="card-title">Req/s</div><div class="card-value">${throughput.toFixed(2)}</div></div>
    </div>

    <div class="section">
      <h3>📈 Evolução da Latência (500 VU's)</h3>
      <div class="chart-container">
        <canvas id="latencyChart"></canvas>
      </div>
    </div>

    <div class="section">
      <h3>📊 Distribuição por Faixa</h3>
      <div class="chart-container">
        <canvas id="distributionChart"></canvas>
      </div>
    </div>

    <div class="section">
      <h3>⌛ Tabela de Distribuição</h3>
      <table>
        <tr><th>Faixa</th><th>Quantidade</th><th>%</th></tr>
        ${bucketHtml}
      </table>
    </div>

    <div class="section">
      <h3>🧠 Análise Técnica</h3>
      <ul>
        <li>Usuários Simultâneos (VUs): ${vus}</li>
        <li>Latência p95: ${p95.toFixed(0)} ms</li>
        <li>Taxa de Erro: ${(failRate * 100).toFixed(2)}%</li>
        <li>Throughput: ${throughput.toFixed(2)} req/s</li>
        <li>${analysisText}</li>
        <li>${errorAnalysis}</li>
      </ul>
    </div>
  </div>

  <script>
    // Gráfico de Latência
    const ctxLatency = document.getElementById('latencyChart').getContext('2d');
    new Chart(ctxLatency, {
      type: 'line',
      data: {
        labels: ${JSON.stringify(latencies.map((_, i) => i + 1))},
        datasets: [{
          label: 'Latência (ms)',
          data: ${JSON.stringify(latencies)},
          borderColor: '#3498db',
          backgroundColor: 'rgba(52, 152, 219, 0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 0
        }]
      },
      options: {
        animation: false,
        responsive: false,
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: true } }
      }
    });

    // Gráfico de Distribuição
    const ctxDist = document.getElementById('distributionChart').getContext('2d');
    const buckets = ${JSON.stringify(buckets)};
    new Chart(ctxDist, {
      type: 'bar',
      data: {
        labels: buckets.map(b => b.label),
        datasets: [{
          label: 'Quantidade de Requisições',
          data: buckets.map(b => b.count),
          backgroundColor: '#3498db'
        }]
      },
      options: {
        animation: false,
        responsive: false,
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: true } }
      }
    });
  </script>
</body>
</html>`;

    // Usar Puppeteer para renderizar e capturar imagem do gráfico
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: process.env.CHROME_PATH || undefined,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 850, height: 1200 });
    await page.setContent(templateHtml);

    // Aguarda o gráfico renderizar
    await new Promise((r) => setTimeout(r, 800));

    const latencyChartBase64 = await (
      await page.$("#latencyChart")
    ).screenshot({ encoding: "base64" });
    const distributionChartBase64 = await (
      await page.$("#distributionChart")
    ).screenshot({ encoding: "base64" });
    await browser.close();

    // Gerar HTML Final (Estático para e-mail)
    const finalHtml = templateHtml
      .replace(
        '<canvas id="latencyChart"></canvas>',
        `<img src="data:image/png;base64,${latencyChartBase64}" style="width:100%; max-width:750px;" />`,
      )
      .replace(
        '<canvas id="distributionChart"></canvas>',
        `<img src="data:image/png;base64,${distributionChartBase64}" style="width:100%; max-width:750px;" />`,
      )
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ""); // Remove scripts

    const htmlOutput = path.resolve(reportsDir, "Relatorio-K6.html");
    fs.writeFileSync(htmlOutput, finalHtml);

    console.log("✅ Relatório HTML estático gerado com sucesso para o e-mail!");
  } catch (err) {
    console.error("❌ Erro:", err.message);
  }
})();
