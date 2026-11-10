/**
 * 逐小时鱼口「黄金窗口」提取（首页 Hero / 天气页共用）
 *
 * 旧逻辑用固定阈值 68 判定高分小时。当逐小时曲线整体偏高且平缓时
 * （例如 24 小时都在 85–92 分），会把 00:00–24:00 判成一整段黄金窗口，
 * 既不符合常识，也让「最佳出竿窗口」失去参考价值。
 *
 * 改为：按当日相对水平取阈值（高于均值、贴近峰值），并限制单段长度，
 * 过长时收敛到分数最高的连续子段。
 */

/** 当日高分阈值：至少高于均值 1 分、贴近峰值（峰值 -8），且不低于 70 */
export function windowThreshold(hourly = []) {
  if (!hourly.length) return 70;
  const scores = hourly.map((h) => Number(h.score) || 0);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const max = Math.max(...scores);
  return Math.max(Math.round(mean + 1), max - 8, 70);
}

/**
 * 提取高分连续段。
 * @param {Array} hourly 逐小时数据（需含 hour / score）
 * @param {number} maxHours 单段最长小时数，超出则取该段内分数最高的连续子段
 * @param {number} maxSegs 最多返回段数（按均分从高到低）
 */
export function goldenWindows(hourly = [], { maxHours = 6, maxSegs = 3 } = {}) {
  if (!hourly.length) return [];
  const threshold = windowThreshold(hourly);
  const segs = [];
  let start = -1;

  for (let i = 0; i <= hourly.length; i++) {
    const hot = i < hourly.length && (Number(hourly[i].score) || 0) >= threshold;
    if (hot && start < 0) start = i;
    if (start >= 0 && (!hot || i === hourly.length)) {
      let s = start;
      let e = i - 1;
      if (e - s + 1 > maxHours) {
        let best = s;
        let bestAvg = -1;
        for (let k = s; k + maxHours - 1 <= e; k++) {
          const avg = hourly.slice(k, k + maxHours)
            .reduce((a, b) => a + (Number(b.score) || 0), 0) / maxHours;
          if (avg > bestAvg) { bestAvg = avg; best = k; }
        }
        s = best;
        e = best + maxHours - 1;
      }
      const slice = hourly.slice(s, e + 1);
      segs.push({
        startH: hourly[s].hour,
        endH: hourly[e].hour + 1,
        avg: Math.round(slice.reduce((a, b) => a + (Number(b.score) || 0), 0) / slice.length),
      });
      start = -1;
    }
  }
  return segs.sort((a, b) => b.avg - a.avg).slice(0, maxSegs);
}

/** 从当前小时起，找时间上最近、且尚未结束的高分窗口 */
export function upcomingWindow(hourly = [], nowH = 0) {
  const segs = goldenWindows(hourly, { maxHours: 6, maxSegs: 8 });
  const upcoming = segs.filter((s) => s.endH > nowH).sort((a, b) => a.startH - b.startH);
  return upcoming[0] || segs[0] || null;
}
