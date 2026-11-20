import React from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, useDragControls } from 'framer-motion';
import Icon from './icons.jsx';
import { SPRING, ENABLE_MOTION, MOTION_VARIANTS } from '../motion/config.js';
import { useReducedMotionSafe, useHaptic } from '../motion/hooks.js';

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
  // 弹簧 + 手势：AnimatePresence 管理进出场，拖拽把手可下拉关闭，速度交接。
  // 签名保持不变（全站 20+ 调用点不受影响）。降级开关见 ENABLE_MOTION.sheet/gesture。
  const reduce = useReducedMotionSafe();
  const animate = ENABLE_MOTION.sheet;
  const gesture = ENABLE_MOTION.gesture && !reduce;
  const vibrate = useHaptic();
  const transition = reduce ? { duration: 0 } : SPRING.sheet;

  // 拖拽位移驱动遮罩渐隐：向下拖时遮罩连续变淡（不是只在结束时跳变）
  const dragY = useMotionValue(0);
  const maskOpacity = useTransform(dragY, [0, 320], [1, 0.15]);
  const dragControls = useDragControls();

  const handleDrag = (_, info) => {
    dragY.set(Math.max(0, info.offset.y));
  };
  const handleDragEnd = (_, info) => {
    // 位移阈值 110px 或下拉速度 600px/s → 关闭
    if (info.offset.y > 110 || info.velocity.y > 600) {
      vibrate(12);
      // 不清零 dragY：让 AnimatePresence 的 exit 从当前位置直接飞出（速度交接、进出场同路径），
      // 避免先弹回 0 再退场造成两段动画叠加、WebKit 下退场拖到 1.5s
      onClose();
    } else {
      dragY.set(0); // 未达阈值：遮罩透明度复位，面板由 motion 弹簧弹回
    }
  };

  const body = (
    <>
      <motion.div
        key="sheet-mask"
        className="sheet-mask"
        initial={animate ? { opacity: 0 } : false}
        animate={{ opacity: 1 }}
        exit={animate ? { opacity: 0 } : undefined}
        transition={reduce ? { duration: 0 } : { duration: 0.22 }}
        style={gesture ? { opacity: maskOpacity } : undefined}
        onClick={onClose}
      />
      <motion.div
        key="sheet-panel"
        className="sheet"
        initial={animate ? { y: '100%' } : false}
        animate={{ y: 0 }}
        exit={animate ? MOTION_VARIANTS.bottomSheet.exit : undefined}
        transition={transition}
        drag={gesture ? 'y' : false}
        dragListener={false}
        dragControls={dragControls}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.4 }}
        dragMomentum={false}
        onDrag={handleDrag}
        onDragEnd={handleDragEnd}
        role="dialog"
        aria-modal="true"
      >
        {/* 拖拽把手成为唯一拖动热区，避免干扰 Sheet 内部长列表滚动 */}
        <div
          className="sheet-handle-zone"
          style={{ paddingTop: 6, paddingBottom: 10, cursor: gesture ? 'grab' : 'default', touchAction: 'none' }}
          onPointerDown={(e) => gesture && dragControls.start(e)}
        >
          <div className="sheet-handle" />
        </div>
        {title && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>{title}</h3>
            <button className="muted" style={{ fontSize: 13 }} onClick={onClose}>关闭</button>
          </div>
        )}
        {children}
      </motion.div>
    </>
  );

  if (!animate) return open ? body : null;
  return <AnimatePresence>{open && body}</AnimatePresence>;
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
            background: value === o.value ? '#0d1a15' : 'transparent',
            color: value === o.value ? '#fff' : 'var(--ink-2, #5c6862)',
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

export function Empty({ text = '暂无数据', icon = 'fish', iconSize = 30 }) {
  // 兼容历史调用：非 ASCII 图标名（旧 emoji 传参）统一回退到线性鱼图标
  const glyph = /^[a-zA-Z][a-zA-Z0-9]*$/.test(icon) ? icon : 'fish';
  return (
    <div className="empty">
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8, color: 'var(--ink-3)' }}>
        <Icon name={glyph} size={iconSize} strokeWidth={1.4} />
      </div>
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
