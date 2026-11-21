import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 实时 GPS 定位 hook（不持久化坐标、不用 watchPosition）
 * - locate() 每次取当前真实坐标（maximumAge:0）
 * - 失败保留上一次成功坐标；首次失败则 location 为 null，由调用方降级
 * - 4 秒防抖，避免 Tab 激活 + visibilitychange 双触发重复申请权限
 */
export function useGeolocation() {
  const [location, setLocation] = useState(null); // {lng, lat}
  const [status, setStatus] = useState('idle');   // idle|loading|ok|denied|error|unsupported
  const [locatedAt, setLocatedAt] = useState(0);  // 每次定位成功 +1，供调用方感知「重新定位」（即使坐标未变）
  const mounted = useRef(true);
  const lastAt = useRef(0);
  const statusRef = useRef('idle');

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const locate = useCallback(({ minInterval = 4000 } = {}) => {
    if (!('geolocation' in navigator)) {
      statusRef.current = 'unsupported';
      setStatus('unsupported');
      return;
    }
    const now = Date.now();
    if (now - lastAt.current < minInterval && statusRef.current === 'ok') return;
    lastAt.current = now;
    statusRef.current = 'loading';
    setStatus('loading');
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!mounted.current) return;
          const lng = Number(pos.coords.longitude);
          const lat = Number(pos.coords.latitude);
          if (Number.isFinite(lng) && Number.isFinite(lat)) {
            setLocation({ lng, lat });
            statusRef.current = 'ok';
            setStatus('ok');
            setLocatedAt((n) => n + 1);
          } else {
            statusRef.current = 'error';
            setStatus('error');
          }
        },
        (err) => {
          if (!mounted.current) return;
          const s = err && err.code === 1 ? 'denied' : 'error';
          statusRef.current = s;
          setStatus(s);
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
      );
    } catch (_) {
      statusRef.current = 'error';
      setStatus('error');
    }
  }, []); // locate 引用稳定：避免 status 变化导致调用方 effect 反复触发

  return { location, status, locate, locatedAt };
}

export default useGeolocation;
