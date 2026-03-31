import http from "k6/http";
import { check, sleep } from "k6";
import { htmlReport } from "https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js";
import { Trend } from "k6/metrics";

const latencyTrend = new Trend("latency_over_time");

export const options = {
  stages: [
    { duration: "30s", target: 40 },
    { duration: "4m", target: 100 },
    { duration: "2m", target: 80 },
    { duration: "30s", target: 0 },
  ],
};

const users = JSON.parse(open("./users_prod.json"));

export default function () {
  const user = users[__VU % users.length];

  const res = http.post(
    "https://erp-api-prod-964330493122.southamerica-east1.run.app/api-external/v1/portal/auth/login",
    JSON.stringify({
      login: user.login,
      senha: user.senha,
    }),
    {
      headers: { "Content-Type": "application/json" },
      timeout: "60s",
    },
  );

  latencyTrend.add(res.timings.duration);

  check(res, {
    "status 200": (r) => r.status === 200,
  });

  sleep(1);
}

export function handleSummary(data) {
  return {
    "reports/report.html": htmlReport(data),
    "reports/summary.json": JSON.stringify(data, null, 2),
  };
}
