/** API 客户端：fetch + JWT + 统一错误 */

const BASE = '/api/v1';

let token = localStorage.getItem('fa_token') || null;

export function setToken(t) {
  token = t || null;
  if (t) localStorage.setItem('fa_token', t);
  else localStorage.removeItem('fa_token');
}

export function getToken() {
  return token;
}

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && token) headers['Authorization'] = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(BASE + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError('网络连接失败，请检查网络', 0, null);
  }
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { /* ignore */ }
  if (!res.ok) {
    throw new ApiError(data.detail || data.title || `请求失败(${res.status})`, res.status, data);
  }
  return data;
}

function qs(params) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const api = {
  // auth
  sendCode: (phone) => request('/auth/code', { method: 'POST', body: { phone }, auth: false }),
  login: (phone, code) => request('/auth/login', { method: 'POST', body: { phone, code }, auth: false }),
  // spots
  spots: (params) => request(`/spots${qs(params)}`),
  spot: (id) => request(`/spots/${id}`),
  spotStats: () => request('/spots/stats'),
  // forecast
  forecast: (params) => request(`/forecast${qs(params)}`),
  // users（个人中心/图鉴/鱼缸/VIP）
  me: () => request('/users/me'),
  encyclopedia: () => request('/users/me/encyclopedia'),
  activateVip: (plan) => request('/users/me/vip', { method: 'POST', body: { plan } }),
  // wiki（百科/附近渔具/潮汐）
  articles: () => request('/wiki/articles'),
  gearShops: () => request('/wiki/gear-shops'),
  tide: (date) => request(`/wiki/tide${qs({ date })}`),
  // community
  catches: (params) => request(`/catches${qs(params)}`),
  publishCatch: (body) => request('/catches', { method: 'POST', body }),
  like: (id) => request(`/likes/${id}`, { method: 'POST' }),
  unlike: (id) => request(`/likes/${id}`, { method: 'DELETE' }),
  comments: (catchId) => request(`/comments${qs({ catchId })}`),
  addComment: (body) => request('/comments', { method: 'POST', body }),
  report: (body) => request('/reports', { method: 'POST', body }),
  // logs
  logs: (params) => request(`/logs${qs(params)}`),
  addLog: (body) => request('/logs', { method: 'POST', body }),
  logStats: () => request('/logs/stats'),
  // config
  species: () => request('/config/species'),
  waterTypes: () => request('/config/water-types'),
  // upload
  upload: async (file) => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`${BASE}/upload`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(data.detail || '上传失败', res.status, data);
    return data;
  },
};

export function todayStr(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
