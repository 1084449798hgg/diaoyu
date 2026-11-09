# -*- coding: utf-8 -*-
"""
鱼图素材管线（可复现）：
  assets/fish-raw/fish_NN.jpg  →  抠透明底 + 裁边  →  assets/fish-cutout/*.png
                              →  压为 WebP        →  frontend/public/fish/*.webp

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
    '11': ('sturgeon', '鲟鱼'),
}
MAX_EDGE = 1200


def cutout(path: Path) -> Image.Image:
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

    ys, xs = np.where(alpha > 12)
    if len(xs):
        x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
        pad = int(max(x1 - x0, y1 - y0) * 0.03)
        out = out[max(0, y0 - pad):min(out.shape[0], y1 + pad),
                  max(0, x0 - pad):min(out.shape[1], x1 + pad)]

    pil = Image.fromarray(out, 'RGBA')
    w, h = pil.size
    if max(w, h) > MAX_EDGE:
        s = MAX_EDGE / max(w, h)
        pil = pil.resize((round(w * s), round(h * s)), Image.LANCZOS)
    return pil


def main():
    total = 0
    for k, (fn, cn) in sorted(NAMES.items()):
        src = RAW / f'fish_{k}.jpg'
        if not src.exists():
            print(f'{k} 跳过（缺 {src.name}）')
            continue
        img = cutout(src)
        img.save(CUTOUT / f'{fn}.png', optimize=True)
        wp = PUBLIC / f'{fn}.webp'
        img.save(wp, 'WEBP', quality=86, method=6)
        total += wp.stat().st_size
        print(f'{k}  {fn:16s} {cn:6s} {img.size[0]}x{img.size[1]}  {wp.stat().st_size // 1024}KB')
    print(f'WebP 合计 {total // 1024} KB（{len(list(PUBLIC.glob("*.webp")))} 张）')


if __name__ == '__main__':
    main()
