/**
 * 苹果流体交互 · 弹簧参数基线
 *
 * 设计依据：WWDC《Designing Fluid Interfaces》
 * - 默认 UI 弹簧：临界阻尼（damping 1.0）、response 0.3–0.4s，回弹干净不晃动
 * - 带动量手势（Sheet 拖拽）：略欠阻尼，允许轻微回弹与速度交接
 *
 * framer-motion 用 stiffness/damping/mass 描述弹簧，与 UIKit 的
 * dampingRatio/duration 不同；下列数值按临界阻尼公式 c = 2√(k·m) 换算：
 *   sheet: k=420, m=.9 → 临界 c≈38.9，取 34（略欠阻尼，一手感回弹）
 *   ui:    k=520, m=.9 → 临界 c≈43.3，取 43（≈临界阻尼）
 */

export const SPRING = {
  /** 弹出层：Sheet / 全屏页，轻微回弹 */
  sheet: { type: 'spring', stiffness: 420, damping: 34, mass: 0.9 },
  /** 常规 UI：Tab 图标、按钮、开关，临界阻尼 */
  ui: { type: 'spring', stiffness: 520, damping: 43, mass: 0.9 },
  /** 按压：更快更硬，按下即时跟手 */
  press: { type: 'spring', stiffness: 700, damping: 42, mass: 0.7 },
  /** 手势落点：Sheet 松手归位/飞出，继承速度 */
  gesture: { type: 'spring', stiffness: 480, damping: 38, mass: 0.85, velocity: 0 },
};

/** 语义化位移：进出场同路径 */
export const MOTION_VARIANTS = {
  /** 底部弹出（Sheet）：从下方进入，退出更快（苹果：退场比进场利落） */
  bottomSheet: {
    initial: { y: '100%', opacity: 0.85 },
    animate: { y: 0, opacity: 1 },
    exit: { y: '100%', opacity: 0.6, transition: { type: 'spring', stiffness: 620, damping: 46, mass: 0.8 } },
  },
  /** 全屏页：轻微下沉 + 淡入，退出回到下沉位 */
  fullLayer: {
    initial: { y: 22, opacity: 0 },
    animate: { y: 0, opacity: 1 },
    exit: { y: 14, opacity: 0 },
  },
  /** Toast：从上方短距落下。x:'-50%' 保留原有水平居中（toast CSS 靠 translateX(-50%) 定位） */
  toast: {
    initial: { x: '-50%', y: -12, opacity: 0 },
    animate: { x: '-50%', y: 0, opacity: 1 },
    exit: { x: '-50%', y: -8, opacity: 0 },
  },
};

/** 交错入场：子项依次浮现（用于首页 hero / 列表卡） */
export const staggerChildren = (stagger = 0.05, delayChildren = 0.02) => ({
  animate: { transition: { staggerChildren: stagger, delayChildren } },
});
export const riseItem = {
  initial: { y: 14, opacity: 0 },
  animate: { y: 0, opacity: 1 },
};

/**
 * 特性开关：任一关闭即退回传统 CSS/无动效，便于 A/B 或紧急回退。
 * 用法：ENABLE_MOTION.sheet === false 时组件走纯条件渲染（瞬开瞬关）。
 */
export const ENABLE_MOTION = {
  sheet: true,
  tab: true,
  layer: true,
  toast: true,
  gesture: true, // Phase 2 启用前保持 true 也无害，drag 属性在 Phase 1 不加
  press: true,
};
