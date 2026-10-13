// All calls go to the server; the browser never holds Google tokens or authorizes sends itself.
async function call(method, path, body) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', 'x-requested-with': 'pa-billing' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const err = new Error(data?.error || `${res.status} ${res.statusText}`);
    err.status = res.status;
    err.details = data?.details;
    throw err;
  }
  return data;
}
export const api = {
  get: (p) => call('GET', p),
  post: (p, b = {}) => call('POST', p, b),
  put: (p, b) => call('PUT', p, b),
  patch: (p, b) => call('PATCH', p, b),
};
