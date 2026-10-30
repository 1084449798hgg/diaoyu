// 坐标系转换工具
// 原始坐标（钓点 / GPS 定位）均为 WGS-84（GPS 真实坐标）。
// 高德、腾讯地图使用 GCJ-02（火星坐标系）；百度地图使用 BD-09。
// 导航前必须把 WGS-84 转换为目标地图坐标系，否则会出现数百米定位偏差。

const PI = Math.PI;
const A = 6378245.0;
const EE = 0.00669342162296594323;

export function outOfChina(lng, lat) {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function transformLat(lng, lat) {
  let ret =
    -100 + 2 * lng + 3 * lat + 0.2 * lat * lat + 0.1 * lng * lat + 0.2 * Math.sqrt(Math.abs(lng));
  ret += ((20 * Math.sin(6 * lng * PI) + 20 * Math.sin(2 * lng * PI)) * 2) / 3;
  ret += ((20 * Math.sin(lat * PI) + 40 * Math.sin((lat / 3) * PI)) * 2) / 3;
  ret += ((160 * Math.sin((lat / 12) * PI) + 320 * Math.sin((lat * PI) / 30)) * 2) / 3;
  return ret;
}

function transformLng(lng, lat) {
  let ret = 300 + lng + 2 * lat + 0.1 * lng * lng + 0.1 * lng * lat + 0.1 * Math.sqrt(Math.abs(lng));
  ret += ((20 * Math.sin(6 * lng * PI) + 20 * Math.sin(2 * lng * PI)) * 2) / 3;
  ret += ((150 * Math.sin((lng / 12) * PI) + 300 * Math.sin((lng / 30) * PI)) * 2) / 3;
  return ret;
}

export function wgs84ToGcj02(lng, lat) {
  if (outOfChina(lng, lat)) return { lng, lat };
  let dlat = transformLat(lng - 105, lat - 35);
  let dlng = transformLng(lng - 105, lat - 35);
  const radlat = (lat / 180) * PI;
  let magic = Math.sin(radlat);
  magic = 1 - EE * magic * magic;
  const sqrtmagic = Math.sqrt(magic);
  dlat = (dlat * 180) / (((A * (1 - EE)) / (magic * sqrtmagic)) * PI);
  dlng = (dlng * 180) / ((A / sqrtmagic) * Math.cos(radlat) * PI);
  return { lng: lng + dlng, lat: lat + dlat };
}

export function gcj02ToBd09(lng, lat) {
  const z = Math.sqrt(lng * lng + lat * lat) + 0.00002 * Math.sin(lat * PI);
  const theta = Math.atan2(lat, lng) + 0.000003 * Math.cos(lng * PI);
  return {
    lng: z * Math.cos(theta) + 0.0065,
    lat: z * Math.sin(theta) + 0.006,
  };
}

export function wgs84ToBd09(lng, lat) {
  const g = wgs84ToGcj02(lng, lat);
  return gcj02ToBd09(g.lng, g.lat);
}
