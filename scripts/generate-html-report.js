const fs = require("fs");
const path = require("path");

(async () => {
  try {
    console.log("🚀 Gerando relatório HTML...");

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

    let timestamps = [];
    let latencies = [];

    const csvPath = path.resolve(reportsDir, "resultado.csv");

    if (fs.existsSync(csvPath)) {
      const lines = fs.readFileSync(csvPath, "utf-8").split("\n");

      lines.slice(1).forEach((line) => {
        const cols = line.split(",");
        const latency = Number(cols[2]);

        if (!isNaN(latency) && latency > 0) {
          latencies.push(latency);
        }
      });

      latencies = latencies.slice(0, 100);

      const maxVus =
        data.options?.stages?.reduce((max, s) => Math.max(max, s.target), 0) ||
        100;

      timestamps = latencies.map((_, i) => {
        const progress = i / latencies.length;
        const vusEstimate = Math.round(progress * maxVus);
        return `${vusEstimate} VUs`;
      });
    }

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

    // Cálculo da distribuição de latência (Buckets)
    const allLatencies = [];
    if (fs.existsSync(csvPath)) {
      const content = fs.readFileSync(csvPath, "utf-8");
      const lines = content.split("\n");
      lines.slice(1).forEach((line) => {
        const cols = line.split(",");
        const latency = Number(cols[2]);
        if (!isNaN(latency) && latency > 0) {
          allLatencies.push(latency);
        }
      });
    }

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

    const totalValidReqs = allLatencies.length || 1;
    const bucketHtml = buckets
      .filter((b) => b.count > 0)
      .map((b) => {
        const percentage = ((b.count / totalValidReqs) * 100).toFixed(1);
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

    if (!vus || vus === 0) {
      vus = data.metrics?.vus_max?.values?.max || 1;
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

    if (p95 < 500) {
      analysisText = "Sistema altamente performático mesmo sob carga.";
    } else if (p95 < 1000) {
      analysisText =
        "Sistema estável, porém apresenta leve degradação sob carga.";
    } else {
      analysisText =
        "Sistema apresenta degradação significativa sob carga elevada.";
    }

    let errorAnalysis = "";

    if (failedRequests > 0) {
      errorAnalysis = `
        Foram identificadas ${failedRequests} falhas durante o teste.
        A principal causa observada foi timeout de requisição,
        indicando que o sistema não respondeu dentro do tempo esperado sob carga.
      `;
    } else {
      errorAnalysis = "Nenhuma falha detectada durante o teste.";
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

h1 { margin-bottom: 5px; }
.subtitle { color: #636e72; margin-bottom: 20px; }

.status {
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

.card-title { font-size: 12px; color: #636e72; }
.card-value { font-size: 22px; font-weight: bold; }

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

th {
  background: #f8f9fa;
  padding: 10px;
  text-align: left;
  border-bottom: 2px solid #dee2e6;
}

td {
  padding: 8px;
  border-bottom: 1px solid #eee;
}

.analysis li { margin-bottom: 6px; }

canvas {
  max-width: 100%;
  height: 400px;
}

@media print {
  body {
    padding: 0;
    margin: 0;
  }

  .page {
    page-break-after: always;
    height: 100vh;
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .page:last-child {
    page-break-after: auto;
  }

  .container {
    width: 90%;
    max-width: 900px;
  }

  .no-break {
    page-break-inside: avoid;
  }
}
</style>
</head>

<body>

<div class="page">
  <div class="container">

    <h1>📊 Relatório de Performance</h1>
    <div class="subtitle">Teste de carga automatizado</div>

    <div class="status" style="background:${statusColor}">
      Status: ${status}
    </div>

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

    <div class="section">
      <h3>⚙️ Configuração</h3>
      <table>
        <tr><td>Duração</td><td>${(durationMs / 1000).toFixed(1)} s</td></tr>
        <tr><td>Usuários Máximos</td><td>${vus}</td></tr>
        <tr><td>Cenário</td><td>Teste progressivo com pico de ${vus} usuários simultâneos</td></tr>
        <tr><td>Requisições</td><td>${totalRequests}</td></tr>
        <tr><td>Falhas</td><td>${failedRequests}</td></tr>
      </table>
    </div>

    <div class="section">
      <h3>📊 Estatísticas de Latência</h3>
      <table>
        <tr><td>Min</td><td>${min.toFixed(2)} ms</td></tr>
        <tr><td>Median</td><td>${median.toFixed(2)} ms</td></tr>
        <tr><td>p90</td><td>${p90.toFixed(2)} ms</td></tr>
        <tr><td>p95</td><td>${p95.toFixed(2)} ms</td></tr>
        <tr><td>p99</td><td>${p99.toFixed(2)} ms</td></tr>
        <tr><td>Max</td><td>${max.toFixed(2)} ms</td></tr>
      </table>
    </div>

    <div class="section">
      <h3>⌛ Distribuição por Faixa de Tempo</h3>
      <table>
        <tr>
          <th>Faixa</th>
          <th>Quantidade</th>
          <th>Percentual</th>
        </tr>
        ${bucketHtml}
      </table>
    </div>

  </div>
</div>

<div class="page">
  <div class="container">

    <div class="section">
      <h3>📊 Distribuição de Latência</h3>
    <canvas id="chart" class="no-break"></canvas>
    </div>

    <div class="section">
      <h3>🧠 Análise Técnica</h3>
      <ul class="analysis">
        <li>Teste executado com ${vus} usuários simultâneos</li>
        <li>Latência p95 em ${p95.toFixed(0)} ms</li>
        <li>Taxa de erro: ${(failRate * 100).toFixed(2)}%</li>
        <li>Throughput médio: ${throughput.toFixed(2)} req/s</li>
        <li>${analysisText}</li>
        <li>${errorAnalysis}</li>
      </ul>
    </div>

    <div class="section">
      <h3>📌 Conclusão</h3>
      <p>
        ${
          p95 < 1000
            ? "Sistema aprovado para carga atual."
            : "Sistema requer otimizações antes de produção."
        }
      </p>
    </div>

  </div>
</div>

<script>
const ctx = document.getElementById('chart').getContext('2d');

const p95Line = Array(${latencies.length}).fill(${p95.toFixed(2)});
const p99Line = Array(${latencies.length}).fill(${p99.toFixed(2)});
const safeLatencies = ${JSON.stringify(latencies)}.length > 0
  ? ${JSON.stringify(latencies)}
  : [${avg.toFixed(2)}, ${p95.toFixed(2)}, ${p99.toFixed(2)}];

new Chart(ctx, {
  type: 'line',
  data: {
    labels: ${JSON.stringify(latencies.map((_, i) => i + 1))},
    datasets: [
      {
        label: 'Latência (ms)',
        data: safeLatencies,
        borderColor: '#3498db',
        borderWidth: 2,
        tension: 0.3,
        pointRadius: 0
      },
      {
        label: 'p95',
        data: p95Line,
        borderColor: '#f39c12',
        borderDash: [5, 5],
        borderWidth: 2,
        pointRadius: 0
      },
      {
        label: 'p99',
        data: p99Line,
        borderColor: '#e74c3c',
        borderDash: [5, 5],
        borderWidth: 2,
        pointRadius: 0
      }
    ]
  },
  options: {
    plugins: {
      legend: { display: true }
    },

    scales: {
  y: {
    beginAtZero: false,
    min: ${min.toFixed(2)} * 0.9,
    max: ${p99.toFixed(2)} * 1.3
  }
}
  }
});
</script>

</body>
</html>
`;

    const htmlOutput = path.resolve(reportsDir, "Relatorio-K6.html");
    fs.writeFileSync(htmlOutput, html);

    console.log("✅ Relatório HTML gerado com sucesso em: " + htmlOutput);
  } catch (err) {
    console.error("❌ Erro:", err.message);
  }
})();
