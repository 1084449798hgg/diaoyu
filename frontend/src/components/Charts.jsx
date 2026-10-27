import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

/* 浅色高级主题配色 */
const INK = '#0d1512';
const INK_2 = '#5c6862';
const MUTED = '#97a09a';
const HAIR = '#e8ebe4';
const LIME = '#c4ea25';
const LIME_SOFT = 'rgba(196,234,37,0.16)';
const GREEN = '#4a7c3f';
const SERIES = ['#0d1512', '#4a7c3f', '#a8823c', '#8a6a8f'];

const TOOLTIP = {
  backgroundColor: 'rgba(255,255,255,0.97)',
  borderColor: '#e8ebe4',
  borderWidth: 1,
  padding: [9, 12],
  extraCssText: 'box-shadow:0 10px 30px rgba(13,26,21,.12);border-radius:12px;',
  textStyle: { color: INK, fontSize: 11.5 },
};

/** 逐小时开口概率曲线（最佳窗口高亮；multi 传入时用于鱼种对比） */
export function ProbabilityChart({ hourly, bestWindow, multi }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current, null, { renderer: 'canvas' });

    if (multi?.length) {
      const hours = multi[0].hourly.map((h) => `${h.hour}:00`);
      chart.setOption({
        grid: { left: 34, right: 12, top: 30, bottom: 22 },
        legend: { textStyle: { color: INK_2, fontSize: 10.5 }, top: 0, itemWidth: 12, itemHeight: 3 },
        tooltip: { ...TOOLTIP, trigger: 'axis' },
        xAxis: {
          type: 'category', data: hours, boundaryGap: false,
          axisLine: { lineStyle: { color: HAIR } },
          axisLabel: { color: MUTED, fontSize: 9.5, interval: 2 },
          axisTick: { show: false },
        },
        yAxis: {
          type: 'value', min: 0, max: 100, interval: 25,
          axisLabel: { color: MUTED, fontSize: 9.5 },
          splitLine: { lineStyle: { color: '#f2f4ee' } },
        },
        series: multi.map((m, i) => ({
          name: m.species, type: 'line', smooth: true, symbol: 'circle', symbolSize: 4,
          data: m.hourly.map((h) => h.score),
          lineStyle: { width: 2.4, color: SERIES[i % SERIES.length] },
          itemStyle: { color: SERIES[i % SERIES.length], borderColor: '#fff', borderWidth: 1.2 },
        })),
      });
      const onResize = () => chart.resize();
      window.addEventListener('resize', onResize);
      return () => { window.removeEventListener('resize', onResize); chart.dispose(); };
    }

    if (!hourly?.length) return;
    const hours = hourly.map((h) => `${h.hour}:00`);
    const scores = hourly.map((h) => h.score);
    let markArea = [];
    if (bestWindow) {
      const endIdx = hourly.findIndex((h) => h.hour === bestWindow.end);
      const nextHour = endIdx >= 0 && endIdx + 1 < hourly.length ? `${hourly[endIdx + 1].hour}:00` : null;
      if (nextHour) {
        markArea = [[
          {
            xAxis: `${bestWindow.start}:00`,
            itemStyle: { color: LIME_SOFT },
            label: { show: true, position: 'insideTop', color: '#6f8a25', fontSize: 9.5, fontWeight: 700, formatter: '黄金窗口' },
          },
          { xAxis: nextHour },
        ]];
      }
    }
    chart.setOption({
      grid: { left: 34, right: 12, top: 28, bottom: 22 },
      tooltip: {
        ...TOOLTIP,
        trigger: 'axis',
        formatter: (params) => {
          const p = params[0];
          const h = hourly[p.dataIndex];
          return `<b>${h.hour}:00 · ${h.score} 分</b><br/><span style="color:#5c6862">气压 ${h.pressure}hPa · ${h.windDir}风${h.windSpeed}m/s</span><br/><span style="color:#5c6862">估算水温 ${h.waterTemp}℃</span>`;
        },
      },
      xAxis: {
        type: 'category', data: hours, boundaryGap: false,
        axisLine: { lineStyle: { color: HAIR } },
        axisLabel: { color: MUTED, fontSize: 9.5, interval: 2 },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value', min: 0, max: 100, interval: 25,
        axisLabel: { color: MUTED, fontSize: 9.5 },
        splitLine: { lineStyle: { color: '#f2f4ee' } },
      },
      series: [{
        type: 'line', data: scores, smooth: true, symbol: 'circle', symbolSize: 5,
        lineStyle: { width: 2.6, color: INK },
        itemStyle: { color: INK, borderColor: '#fff', borderWidth: 1.4 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(196,234,37,0.42)' },
            { offset: 1, color: 'rgba(196,234,37,0.02)' },
          ]),
        },
        markLine: {
          silent: true, symbol: 'none',
          data: [{ yAxis: 82, lineStyle: { color: 'rgba(196,234,37,0.75)', type: 'dashed', width: 1 }, label: { show: false } }],
        },
        markArea: { silent: true, data: markArea },
      }],
    });
    const onResize = () => chart.resize();
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); chart.dispose(); };
  }, [hourly, bestWindow]);
  return <div ref={ref} className="chart chart-tall" />;
}

/** 过去 24h 气压趋势（今天部分高亮） */
export function PressureChart({ trend }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || !trend?.length) return;
    const chart = echarts.init(ref.current, null, { renderer: 'canvas' });
    const labels = trend.map((p) => `${p.isToday ? '今天' : '昨天'} ${String(p.hour).padStart(2, '0')}:00`);
    const pressures = trend.map((p) => p.pressure);
    const firstToday = trend.findIndex((p) => p.isToday);
    const markArea = firstToday > 0
      ? [[
          { xAxis: firstToday - 1, itemStyle: { color: 'rgba(196,234,37,0.08)' } },
          { xAxis: labels.length - 1 },
        ]]
      : [];
    chart.setOption({
      grid: { left: 40, right: 14, top: 26, bottom: 20 },
      tooltip: {
        ...TOOLTIP,
        trigger: 'axis',
        formatter: (params) => `${labels[params[0].dataIndex]}<br/><b>气压 ${params[0].value} hPa</b>`,
      },
      xAxis: {
        type: 'category', data: labels, boundaryGap: false,
        axisLine: { lineStyle: { color: HAIR } },
        axisLabel: { color: MUTED, fontSize: 8.5, interval: 7 },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value', scale: true,
        axisLabel: { color: MUTED, fontSize: 9.5, formatter: '{value}' },
        splitLine: { lineStyle: { color: '#f2f4ee' } },
      },
      series: [{
        type: 'line', data: pressures, smooth: true, symbol: 'none',
        lineStyle: { width: 2.2, color: GREEN },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(74,124,63,0.22)' },
            { offset: 1, color: 'rgba(74,124,63,0.01)' },
          ]),
        },
        markArea: { silent: true, data: markArea },
        markLine: {
          silent: true, symbol: 'none',
          data: [
            { yAxis: 1020, lineStyle: { color: 'rgba(168,130,60,0.4)', type: 'dashed' }, label: { color: MUTED, fontSize: 8.5, formatter: '1020' } },
            { yAxis: 1000, lineStyle: { color: 'rgba(168,130,60,0.4)', type: 'dashed' }, label: { color: MUTED, fontSize: 8.5, formatter: '1000' } },
          ],
        },
      }],
    });
    const onResize = () => chart.resize();
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); chart.dispose(); };
  }, [trend]);
  return <div ref={ref} className="chart" />;
}

/** 小评分条（用于因子展示） */
export function FactorBar({ score, label, direction }) {
  const color = direction === 'positive' ? LIME : '#a8823c';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5 }}>
      <span style={{ width: 108, color: 'var(--ink-2)', flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'var(--surface-2)', overflow: 'hidden' }}>
        <div style={{ width: `${score}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      <span style={{ width: 26, textAlign: 'right', color: 'var(--ink)', fontWeight: 700 }}>{score}</span>
    </div>
  );
}
