import { api } from '../api.js';

/**
 * 逆地理编码：GPS 经纬度 → 中文地区名（省 / 市 / 区县 / 街道）
 * 通过同源后端接口 /spots/reverse-geocode 代理高德网页版逆地理（免 key、稳定、避开跨域与封禁）。
 * 模块级缓存：坐标量化到 0.001°（≈100m），TTL 10 分钟，避免切 Tab 重复外呼。
 */
const CACHE = new Map();
const TTL = 10 * 60 * 1000;

export async function reverseGeocode(lng, lat) {
  const key = `${Number(lng).toFixed(3)},${Number(lat).toFixed(3)}`;
  const hit = CACHE.get(key);
  if (hit && hit.expireAt > Date.now()) return hit.value;

  const value = await api.reverseGeocode(lng, lat);
  // 只有拿到有效省/市才缓存，空结果不缓存（允许下次重试）
  if (value && (value.city || value.province)) {
    CACHE.set(key, { value, expireAt: Date.now() + TTL });
  }
  return value || { province: '', city: '', district: '', street: '' };
}

/** 把地区名拼成简短标签，如「杭州市·西湖区」 */
export function regionLabel(region) {
  if (!region) return '';
  return [region.city || region.province, region.district].filter(Boolean).join('·');
}

export default reverseGeocode;
