import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 30,
  duration: '30s',
};

export default function () {
  const url = 'https://erp-api-dev-922117522963.us-central1.run.app/api/v1/app/auth/login';

  const payload = JSON.stringify({
    login: 'admin',
    senha: '7Y/6p0p\\iYd{'
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
  };

  const res = http.post(url, payload, params);

  check(res, {
    'status é 200': (r) => r.status === 200,
    'login funcionou': (r) => r.body && r.body.includes('token'),
  });

  sleep(1);
}