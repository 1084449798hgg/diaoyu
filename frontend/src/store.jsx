import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { api, setToken } from './api.js';
import { SPRING, MOTION_VARIANTS, ENABLE_MOTION } from './motion/config.js';
import { useReducedMotionSafe } from './motion/hooks.js';

const AuthCtx = createContext(null);
const ToastCtx = createContext(() => {});
const LocationCtx = createContext(null);

export function useAuth() {
  return useContext(AuthCtx);
}

export function useToast() {
  return useContext(ToastCtx);
}

/**
 * 全局「当前生效钓点/区域」——全站唯一的地区数据源。
 * 首页负责写入（GPS 实时定位 / 手动选城市 / 选钓点），其它页面只读。
 * 这样切首页定位或城市后，天气/推理/地图/我的/发布页的数据会同源联动，
 * 而各页面原有的钓法、鱼种、日期等交互与 UI 完全不变。
 *
 * 形状：
 * { spotId, lng, lat, waterType, cityName, region:{province,city,district,street}, label, version }
 * - spotId 模式：手动选了具体钓点，用 spotId 请求
 * - 坐标模式：GPS 或城市坐标，用 lng/lat 请求（真实天气）
 * - source: 'gps' | 'manual' | 'default'
 */
const DEFAULT_LOCATION = {
  spotId: 1,
  lng: null,
  lat: null,
  waterType: '湖泊',
  cityName: '杭州市',
  region: null,
  label: '千岛湖',
  source: 'default',
  version: 0,
};

export function useLocation() {
  return useContext(LocationCtx);
}

export function LocationProvider({ children }) {
  const [loc, setLocState] = useState(DEFAULT_LOCATION);
  const versionRef = useRef(0);

  // 稳定引用：只有关键字段真正变化才更新，避免其它页面 effect 抖动
  const setLocation = useCallback((next) => {
    setLocState((prev) => {
      const same = prev.spotId === (next.spotId ?? null)
        && prev.lng === (next.lng ?? null)
        && prev.lat === (next.lat ?? null)
        && prev.waterType === (next.waterType ?? null)
        && prev.cityName === (next.cityName ?? null)
        && prev.label === (next.label ?? null);
      if (same) return prev;
      versionRef.current += 1;
      return {
        spotId: next.spotId ?? null,
        lng: next.lng ?? null,
        lat: next.lat ?? null,
        waterType: next.waterType ?? '湖泊',
        cityName: next.cityName ?? '',
        region: next.region ?? null,
        label: next.label ?? '',
        source: next.source ?? 'default',
        version: versionRef.current,
      };
    });
  }, []);

  return (
    <LocationCtx.Provider value={{ loc, setLocation }}>
      {children}
    </LocationCtx.Provider>
  );
}

/**
 * 由全局位置生成 forecast / forecastReasoning 的公共请求参数（地区维度）。
 * 调用方在此基础上叠加自己的 date / species / days 等参数。
 * - 有坐标优先走坐标模式（真实天气，随地区变化）
 * - 否则回退 spotId
 */
export function forecastParams(loc, extra = {}) {
  if (!loc) return { spotId: 1, ...extra };
  if (loc.lng != null && loc.lat != null) {
    return { lng: loc.lng, lat: loc.lat, waterType: loc.waterType, cityName: loc.cityName, ...extra };
  }
  return { spotId: loc.spotId || 1, ...extra };
}

export function AuthProvider({ children }) {
  const reduce = useReducedMotionSafe();
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('fa_user');
    return raw ? JSON.parse(raw) : null;
  });
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type, id: Date.now() });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const login = useCallback(async (phone, code) => {
    const data = await api.login(phone, code);
    setToken(data.token);
    localStorage.setItem('fa_user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    localStorage.removeItem('fa_user');
    setUser(null);
  }, []);

  return (
    <AuthCtx.Provider value={{ user, login, logout }}>
      <ToastCtx.Provider value={showToast}>
        {children}
        <AnimatePresence>
          {toast && (
            <motion.div
              className={`toast toast-${toast.type}`}
              key={toast.id}
              initial={ENABLE_MOTION.toast && !reduce ? MOTION_VARIANTS.toast.initial : false}
              animate={MOTION_VARIANTS.toast.animate}
              exit={ENABLE_MOTION.toast && !reduce ? MOTION_VARIANTS.toast.exit : undefined}
              transition={reduce ? { duration: 0 } : SPRING.ui}
            >
              {toast.message}
            </motion.div>
          )}
        </AnimatePresence>
      </ToastCtx.Provider>
    </AuthCtx.Provider>
  );
}
