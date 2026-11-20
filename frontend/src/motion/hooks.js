/**
 * 交互基础 hooks：无障碍、触觉反馈、主题。
 * iOS Safari 无 navigator.vibrate，触觉调用静默降级（安卓 Chrome 生效）。
 */
import { useReducedMotion as useFramerReducedMotion } from 'framer-motion';
import { useEffect, useState, useCallback, useRef } from 'react';

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

/**
 * 边缘滑动返回：从屏幕左缘起的横向拖拽，超过阈值即触发返回。
 * 返回一个 pointer 事件绑定对象，展开到需要手势的容器上（如 .app-layer）。
 * 只识别「起点在左缘 26px 内、向右滑」的手势，避免与页面内部横向滚动冲突。
 */
export function useEdgeBack(onClose, enabled = true) {
  const vibrate = useHaptic();
  const start = useRef({ x: 0, y: 0, tracking: false });

  const onPointerDown = useCallback((e) => {
    if (!enabled) return;
    const x = e.clientX ?? (e.touches?.[0]?.clientX);
    const y = e.clientY ?? (e.touches?.[0]?.clientY);
    if (x == null || y == null) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (x - rect.left > 26) return; // 非左缘起手，忽略
    start.current = { x, y, tracking: true };
  }, [enabled]);

  const onPointerUp = useCallback((e) => {
    const st = start.current;
    if (!st.tracking) return;
    start.current.tracking = false;
    const x = e.clientX ?? (e.changedTouches?.[0]?.clientX);
    const y = e.clientY ?? (e.changedTouches?.[0]?.clientY);
    if (x == null || y == null) return;
    const dx = x - st.x;
    const dy = y - st.y;
    // 右滑 >90px 且横向为主（排除斜向误触）→ 返回
    if (dx > 90 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      vibrate(10);
      onClose();
    }
  }, [enabled, onClose, vibrate]);

  return enabled ? { onPointerDown, onPointerUp } : {};
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
