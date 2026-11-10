# -*- coding: utf-8 -*-
"""
鱼图素材管线（可复现）：
  assets/fish-raw/fish_NN.jpg  →  抠透明底  →  紧裁 + 视觉质心居中  →
  assets/fish-cutout/*.png     →  压为 WebP →  frontend/public/fish/*.webp

关键：object-fit: contain 是按「图片画布」居中，不是按鱼体居中。
若画布里鱼体偏一侧、另一侧是透明留白，视觉上就会偏。因此：
  1) 按最大连通域紧裁到鱼体 bbox，排除孤立噪点把画布撑大；
  2) 以 bbox 内 alpha 加权「视觉质心」为准居中，而非 bbox 几何中心 ——
     鱼体头大尾细、背鳍展开，几何中心并不等于视觉重心，只做 bbox 居中
     仍会让黑鱼 / 鲟鱼等看起来偏上或偏下；
  3) 画布尺寸按「质心到两端最大距离的 2 倍 + 对称留白」计算，保证鱼体
     bbox 完整不被裁切，同时质心严格落在画布正中，任何 contain 容器内
     都水平垂直居中。

原始 JPG 由用户提供（棋盘格底写实鱼图）。运行：python3 assets/build_fish_assets.py
依赖：opencv-python、Pillow、numpy
"""
from pathlib import Path
import numpy as np
import cv2
from PIL import Image

BASE = Path(__file__).resolve().parents[1]
RAW = BASE / 'assets' / 'fish-raw'
CUTOUT = BASE / 'assets' / 'fish-cutout'
PUBLIC = BASE / 'frontend' / 'public' / 'fish'
CUTOUT.mkdir(parents=True, exist_ok=True)
PUBLIC.mkdir(parents=True, exist_ok=True)

NAMES = {
    '01': ('bighead_carp', '鳙鱼'), '02': ('culter', '翘嘴鲌'),
    '03': ('yellow_catfish', '黄颡鱼'), '04': ('pompano', '鲳鱼'),
    '05': ('bream', '鳊鱼'), '06': ('snakehead', '乌鳢'),
    '07': ('salmon', '鲑鱼'), '08': ('catfish', '鲶鱼'),
    '09': ('grass_carp', '草鱼'), '10': ('crucian_carp', '鲫鱼'),
    '11': ('sturgeon', '鲟鱼'), '12': ('common_carp', '鲤鱼'),
}
MAX_EDGE = 1200
EDGE_PAD = 0.05   # 相对鱼体最长边，四周对称留白
ALPHA_TH = 40     # 实体像素阈值，与自检口径一致


def cutout(path: Path) -> Image.Image:
    """去棋盘格底，返回带 alpha 的 RGBA（不裁边，居中交给 center）。"""
    im = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if im is None:
        raise RuntimeError(f'读取失败: {path}')
    b, g, r = [c.astype(np.int16) for c in cv2.split(im)]
    mx = np.maximum(np.maximum(b, g), r)
    mn = np.minimum(np.minimum(b, g), r)
    # 棋盘格是近白 / 浅灰、低饱和；鱼体银白高光被深色轮廓包住，不与边界连通
    bg = ((mn >= 224) & ((mx - mn) <= 22)).astype(np.uint8)
    n, labels = cv2.connectedComponents(bg, connectivity=4)
    border = set(labels[0, :].tolist()) | set(labels[-1, :].tolist()) \
             | set(labels[:, 0].tolist()) | set(labels[:, -1].tolist())
    border.discard(0)
    mask_bg = np.isin(labels, list(border)) if border else np.zeros_like(bg, dtype=bool)

    alpha = np.where(mask_bg, 0, 255).astype(np.uint8)
    alpha = cv2.morphologyEx(alpha, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    alpha = cv2.GaussianBlur(alpha, (3, 3), 0.55)
    out = np.dstack([cv2.cvtColor(im, cv2.COLOR_BGR2RGB), alpha])
    return Image.fromarray(out, 'RGBA')


def centroid_offset(pil: Image.Image):
    """鱼体视觉质心相对画布中心的偏移（百分比），自检居中效果。"""
    a = np.array(pil)[:, :, 3].astype(float)
    w = np.where(a > ALPHA_TH, a, 0.0)
    if w.sum() == 0:
        return 0.0, 0.0
    ys, xs = np.mgrid[0:a.shape[0], 0:a.shape[1]]
    cx, cy = (xs * w).sum() / w.sum(), (ys * w).sum() / w.sum()
    W, H = a.shape[1], a.shape[0]
    return (cx - W / 2) / W * 100, (cy - H / 2) / H * 100


def center(pil: Image.Image) -> Image.Image:
    """紧裁到鱼体 bbox，再按 alpha 视觉质心居中并四周对称留白。"""
    a = np.array(pil)[:, :, 3]
    solid = (a > ALPHA_TH).astype(np.uint8)
    # 取面积最大的连通块作为「鱼体主体」，排除残留的孤立噪点把 bbox 撑大
    n, lab, stats, _ = cv2.connectedComponentsWithStats(solid, connectivity=8)
    if n > 1:
        k = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        x, y, w, h = [int(v) for v in stats[k, :4]]
    else:
        ys, xs = np.where(a > 16)
        if not len(xs):
            return pil
        x, y, w, h = int(xs.min()), int(ys.min()), int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1)
    crop = pil.crop((x, y, x + w, y + h))

    # 视觉质心（相对 crop 左上角），用实体 alpha 加权，忽略半透明毛边
    ca = np.array(crop)[:, :, 3].astype(float)
    cw = np.where(ca > ALPHA_TH, ca, 0.0)
    ys, xs = np.mgrid[0:ca.shape[0], 0:ca.shape[1]]
    cx, cy = (xs * cw).sum() / cw.sum(), (ys * cw).sum() / cw.sum()

    # 以质心到 bbox 两端的较大距离为「半边」，画布即 2*半边 + 对称留白：
    # 既保证整条鱼不被裁切，又让质心严格落在画布正中。
    half_w, half_h = max(cx, w - cx), max(cy, h - cy)
    pad = max(6, round(max(w, h) * EDGE_PAD))
    W, H = int(round(2 * half_w + 2 * pad)), int(round(2 * half_h + 2 * pad))
    px, py = W / 2 - cx, H / 2 - cy

    canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    canvas.paste(crop, (round(px), round(py)))
    return canvas


def main():
    total = 0
    for k, (fn, cn) in sorted(NAMES.items()):
        src = RAW / f'fish_{k}.jpg'
        if not src.exists():
            print(f'{k} 跳过（缺 {src.name}）')
            continue
        img = center(cutout(src))
        w, h = img.size
        if max(w, h) > MAX_EDGE:
            s = MAX_EDGE / max(w, h)
            img = img.resize((round(w * s), round(h * s)), Image.LANCZOS)
        img.save(CUTOUT / f'{fn}.png', optimize=True)
        wp = PUBLIC / f'{fn}.webp'
        img.save(wp, 'WEBP', quality=86, method=6)
        total += wp.stat().st_size
        dx, dy = centroid_offset(img)
        flag = 'OK' if max(abs(dx), abs(dy)) < 2 else 'CHECK'
        print(f'{k}  {fn:16s} {cn:6s} {img.size[0]}x{img.size[1]}  '
              f'{wp.stat().st_size // 1024}KB  质心偏移=({dx:+.1f}%,{dy:+.1f}%) {flag}')
    print(f'WebP 合计 {total // 1024} KB（{len(list(PUBLIC.glob("*.webp")))} 张）')


if __name__ == '__main__':
    main()
