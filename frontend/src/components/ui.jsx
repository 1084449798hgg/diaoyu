import React, { useState, useEffect } from 'react';

/** 分数圆环 */
export function ScoreRing({ score, level, size = 96 }) {
  const r = (size - 12) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const color = level === '窗口期' ? 'var(--green)' : level === '较好' ? 'var(--blue)' : level === '一般' ? 'var(--amber)' : 'var(--red)';
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(120,200,220,0.12)" strokeWidth="9" />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - pct)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
      <text x="50%" y="47%" textAnchor="middle" dominantBaseline="middle" fill="#eaf6fa" fontSize={size * 0.3} fontWeight="800">
        {score}
      </text>
      <text x="50%" y="66%" textAnchor="middle" dominantBaseline="middle" fill={color} fontSize={size * 0.14} fontWeight="600">
        {level}
      </text>
    </svg>
  );
}

export function LevelBadge({ level }) {
  const cls = level === '窗口期' ? 'tag-green' : level === '较好' ? 'tag-blue' : level === '一般' ? 'tag-amber' : 'tag-red';
  return <span className={`badge ${cls}`}>{level}</span>;
}

export function ReliabilityBadge({ level }) {
  const map = { 1: ['数据可靠', 'tag-green'], 2: ['数据中等', 'tag-amber'], 3: ['仅供参考', ''] };
  const [text, cls] = map[level] || map[3];
  return <span className={`badge ${cls}`}>{text}</span>;
}

export function Sheet({ open, title, onClose, children }) {
  const [visible, setVisible] = useState(open);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (open) {
      setVisible(true);
      setClosing(false);
    } else if (visible) {
      // 退场动画：先播 closing，240ms 后真正卸载
      setClosing(true);
      const t = setTimeout(() => { setVisible(false); setClosing(false); }, 240);
      return () => clearTimeout(t);
    }
  }, [open, visible]);

  if (!visible) return null;
  return (
    <>
      <div className={`sheet-mask${closing ? ' closing' : ''}`} onClick={onClose} />
      <div className={`sheet${closing ? ' closing' : ''}`}>
        <div className="sheet-handle" />
        {title && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>{title}</h3>
            <button className="muted" style={{ fontSize: 13 }} onClick={onClose}>关闭</button>
          </div>
        )}
        {children}
      </div>
    </>
  );
}

export function Segmented({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', background: 'var(--seg-bg)', borderRadius: 12, padding: 3, gap: 2 }}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          style={{
            flex: 1, padding: '7px 0', borderRadius: 9, fontSize: 12.5, fontWeight: 600,
            background: value === o.value ? 'var(--green)' : 'transparent',
            color: value === o.value ? '#04202b' : 'var(--text-2)',
            transition: 'all 0.15s',
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Spinner() {
  return <div className="spinner" />;
}

export function Empty({ text = '暂无数据', icon = '🎣' }) {
  return (
    <div className="empty">
      <div style={{ fontSize: 34, marginBottom: 8 }}>{icon}</div>
      {text}
    </div>
  );
}

/** 风向图文：箭头按风向旋转 */
export function WindIndicator({ dir, speed }) {
  const dirMap = { 北: 0, 东北: 45, 东: 90, 东南: 135, 南: 180, 西南: 225, 西: 270, 西北: 315 };
  const rotate = dirMap[dir] ?? 0;
  const scale = speed <= 3.3 ? 'var(--green)' : speed <= 8 ? 'var(--amber)' : 'var(--red)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{
        width: 44, height: 44, borderRadius: '50%',
        border: `2px solid ${scale}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
        transform: `rotate(${rotate + 180}deg)`, flexShrink: 0,
      }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={scale} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20V5M6 11l6-6 6 6" />
        </svg>
      </div>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{dir}风 {speed} m/s</div>
        <div className="muted" style={{ marginTop: 2 }}>
          {speed >= 1.6 && speed <= 3.3 ? '二级风，最适宜' : speed < 1.6 ? '风偏小，水体闷' : speed <= 8 ? '风浪偏大，注意安全' : '大风，不建议出钓'}
        </div>
      </div>
    </div>
  );
}

/** 水温温度计 */
export function WaterTempBar({ temp, min, max }) {
  const lo = Math.min(min, temp) - 2;
  const hi = Math.max(max, temp) + 2;
  const pct = ((temp - lo) / (hi - lo)) * 100;
  const rangeLo = ((min - lo) / (hi - lo)) * 100;
  const rangeHi = ((max - lo) / (hi - lo)) * 100;
  const ok = temp >= min && temp <= max;
  return (
    <div>
      <div style={{ position: 'relative', height: 10, borderRadius: 5, background: 'rgba(4,24,33,0.7)', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', left: `${rangeLo}%`, width: `${rangeHi - rangeLo}%`, top: 0, bottom: 0,
          background: 'var(--green-dim)', borderLeft: '1px solid var(--green)', borderRight: '1px solid var(--green)',
        }} />
        <div style={{
          position: 'absolute', left: `calc(${pct}% - 2px)`, top: -2, width: 4, height: 14, borderRadius: 2,
          background: ok ? 'var(--green)' : 'var(--amber)', transition: 'left 0.4s',
        }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: ok ? 'var(--green)' : 'var(--amber)' }}>估算水温 {temp}℃</span>
        <span className="muted">适宜 {min}-{max}℃</span>
      </div>
    </div>
  );
}
