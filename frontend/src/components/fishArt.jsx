import React from 'react';

/** 鱼种色板：深墨青水底，保持"产品图"质感，避免与卡片文字冲突 */
export function fishPalette(species = '') {
  if (/鲤|鲫/.test(species)) return { a: '#1a3a42', b: '#0a1a21', fish: '#d7dfd9', accent: 'rgba(216,248,79,.18)' };
  if (/翘嘴|白条|鲌/.test(species)) return { a: '#1b3345', b: '#0a1822', fish: '#e4cf94', accent: 'rgba(216,248,79,.14)' };
  if (/草鱼|青鱼|鳊/.test(species)) return { a: '#17392a', b: '#0a1a13', fish: '#a9ce93', accent: 'rgba(216,248,79,.16)' };
  if (/鲈|鳜|黑鱼/.test(species)) return { a: '#1c3540', b: '#0a171e', fish: '#b9cdd2', accent: 'rgba(216,248,79,.13)' };
  if (/鲢|鳙/.test(species)) return { a: '#20343a', b: '#0c171b', fish: '#cfd6d2', accent: 'rgba(216,248,79,.12)' };
  return { a: '#1b333c', b: '#0a171d', fish: '#cfd6d0', accent: 'rgba(216,248,79,.14)' };
}

/** 体型：翘嘴细长、鲫鱼圆润、草鱼修长 */
function bodyShape(species = '') {
  if (/翘嘴|白条|鲌/.test(species)) return { sy: 0.68, sx: 1.1 };
  if (/草鱼|青鱼|鳊/.test(species)) return { sy: 0.86, sx: 1.06 };
  if (/鲢|鳙/.test(species)) return { sy: 1.02, sx: 1.0 };
  return { sy: 0.94, sx: 1.0 };
}

/**
 * 渔获视觉：深墨青水底 + 波纹 + 鱼形剪影
 * seed 用于制造每张卡不同的波光位置
 */
export default function FishArt({ species, height = 140, seed = 0, children }) {
  const p = fishPalette(species);
  const { sx, sy } = bodyShape(species);
  const bob = (seed % 3) * 6 - 6;
  return (
    <div style={{
      height, position: 'relative', overflow: 'hidden',
      background: `linear-gradient(160deg, ${p.a} 0%, ${p.b} 78%)`,
    }}>
      <svg viewBox="0 0 200 140" preserveAspectRatio="xMidYMid slice"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        {/* 光晕 */}
        <ellipse cx="150" cy="18" rx="70" ry="46" fill={p.accent} opacity=".5" />
        {/* 水纹 */}
        <g stroke="rgba(255,255,255,.055)" strokeWidth="1" fill="none">
          <path d="M0 34c26-8 44 6 68 0s40-10 64-2 44 6 68 0" />
          <path d="M0 52c26-8 44 6 68 0s40-10 64-2 44 6 68 0" />
          <path d="M0 118c26-8 44 6 68 0s40-10 64-2 44 6 68 0" />
        </g>
        {/* 鱼 */}
        <g transform={`translate(100 ${72 + bob}) scale(${sx * 0.86} ${sy * 0.86})`} fill={p.fish} opacity=".92">
          <path d="M-46 0C-30-17 6-19 30-8 38-4 38 4 30 8 6 19-30 17-46 0Z" />
          <path d="M-44 0-60-14-55 0-60 14Z" />
          <path d="M-6-14c5-6 12-8 18-7-6 2-11 5-14 9Z" opacity=".7" />
          <path d="M-6 14c5 6 12 8 18 7-6-2-11-5-14-9Z" opacity=".7" />
        </g>
        <g transform={`translate(100 ${72 + bob}) scale(${sx * 0.86} ${sy * 0.86})`}>
          <circle cx="21" cy="-4.5" r="2.6" fill="#0a1418" opacity=".55" />
          <circle cx="21.8" cy="-5.2" r="0.9" fill="#fff" opacity=".8" />
          <path d="M-30 0c8-3 16-4 24-3" stroke="rgba(10,20,24,.28)" strokeWidth="1.2" fill="none" />
        </g>
        {/* 底部压暗，保证文字可读 */}
        <rect x="0" y="78" width="200" height="62" fill="url(#fade)" />
        <defs>
          <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(6,14,12,0)" />
            <stop offset="100%" stopColor="rgba(6,14,12,.72)" />
          </linearGradient>
        </defs>
      </svg>
      {children}
    </div>
  );
}
