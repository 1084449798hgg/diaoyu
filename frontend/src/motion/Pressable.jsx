/**
 * 统一按压反馈组件（Phase 1 只做弹簧缩放，Phase 2 接入触觉）。
 * 苹果交互：pointer-down 立即响应，不是等 click 才动；全程连续、可打断。
 */
import React from 'react';
import { motion } from 'framer-motion';
import { SPRING, ENABLE_MOTION } from './config.js';
import { useReducedMotionSafe, useHaptic } from './hooks.js';

/**
 * @param {object}  props
 * @param {'button'|'div'} [props.as]  渲染元素
 * @param {number}  [props.scale=0.97] 按下缩放比
 * @param {boolean} [props.haptic=false] 按下是否给触觉反馈
 */
export default function Pressable({
  as = 'button', scale = 0.97, haptic = false,
  children, style, whileTap, transition, ...rest
}) {
  const reduce = useReducedMotionSafe();
  const vibrate = useHaptic();
  const Comp = motion[as] || motion.button;

  const tap = ENABLE_MOTION.press && !reduce
    ? (whileTap || { scale })
    : undefined;

  return (
    <Comp
      {...rest}
      style={style}
      whileTap={tap}
      transition={transition || SPRING.press}
      onPointerDown={(e) => {
        if (haptic) vibrate(8);
        rest.onPointerDown?.(e);
      }}
    >
      {children}
    </Comp>
  );
}
