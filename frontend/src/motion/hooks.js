/**
 * 交互基础 hooks：无障碍、触觉反馈、主题。
 * iOS Safari 无 navigator.vibrate，触觉调用静默降级（安卓 Chrome 生效）。
 */
import { useReducedMotion as useFramerReducedMotion } from 'framer-motion';
import { useEffect, useState, useCallback } from 'react';

/** 包装 framer-motion 的 useReducedMotion，null 视为 false */
export function useReducedMotionSafe() {
  const reduce = useFramerReducedMotion();
  return !!reduce;
}

/**
 * 触觉反馈。iOS Safari 不支持 Vibration API；
 * 未来若接入 Capacitor/Cordova 可在此替换为 Taptic Engine 桥接。
 */
export function useHaptic() {
  return useCallback((pattern = 10) => {
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(pattern);
      }
    } catch (_) {
      /* Web 触觉不可用时静默降级，绝不阻塞交互 */
    }
  }, []);
}

/** 主题三态：跟随系统 / 浅色 / 深色 */
const THEME_KEY = 'fa_theme_mode';

export function useTheme() {
  const [mode, setMode] = useState(() => {
    try { return localStorage.getItem(THEME_KEY) || 'system'; } catch (_) { return 'system'; }
  });
  const [systemDark, setSystemDark] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
  );

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return undefined;
    const onChange = (e) => setSystemDark(e.matches);
    // Safari < 14 用 addListener，现代用 addEventListener
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', onChange);
      else mq.removeListener(onChange);
    };
  }, []);

  const resolved = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolved);
    try { localStorage.setItem(THEME_KEY, mode); } catch (_) { /* 隐私模式忽略 */ }
  }, [mode, resolved]);

  const setThemeMode = useCallback((next) => setMode(next), []);
  return { mode, resolved, setThemeMode, isDark: resolved === 'dark' };
}
