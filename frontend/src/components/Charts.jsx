import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

const GREEN = '#35c48d';
const BLUE = '#4cb8e8';
const AMBER = '#f0b44c';
const RED = '#e5534b';

/** 逐小时开口概率曲线（最佳窗口高亮；multi 传入时用于鱼种对比） */
export function ProbabilityChart({ hourly, bestWindow, multi }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current, null, { renderer: 'canvas' });

    if (multi?.length) {
      // 鱼种对比：多条曲线叠加
      const colors = [GREEN, BLUE, AMBER, RED];
      const hours = multi[0].hourly.map((h) => `${h.hour}:00`);
      chart.setOption({
        grid: { left: 36, right: 14, top: 30, bottom: 24 },
        legend: { textStyle: { color: '#a9c8d4', fontSize: 11 }, top: 0 },
        tooltip: {
          trigger: 'axis',
          backgroundColor: 'rgba(5,29,40,0.95)',
          borderColor: 'rgba(120,200,220,0.3)',
          textStyle: { color: '#eaf6fa', fontSize: 12 },
        },
        xAxis: {
          type: 'category', data: hours, boundaryGap: false,
          axisLine: { lineStyle: { color: 'rgba(120,200,220,0.2)' } },
          axisLabel: { color: '#6f95a5', fontSize: 10, interval: 2 },
          axisTick: { show: false },
        },
        yAxis: {
          type: 'value', min: 0, max: 100, interval: 25,
          axisLabel: { color: '#6f95a5', fontSize: 10 },
          splitLine: { lineStyle: { color: 'rgba(120,200,220,0.08)' } },
        },
        series: multi.map((m, i) => ({
          name: m.species, type: 'line', smooth: true, symbol: 'circle', symbolSize: 4,
          data: m.hourly.map((h) => h.score),
          lineStyle: { width: 2.5, color: colors[i % colors.length] },
          itemStyle: { color: colors[i % colors.length] },
        })),
      });
      const onResize = () => chart.resize();
      window.addEventListener('resize', onResize);
      return () => { window.removeEventListener('resize', onResize); chart.dispose(); };
    }

    if (!hourly?.length) return;
    const hours = hourly.map((h) => `${h.hour}:00`);
    const scores = hourly.map((h) => h.score);
    // markArea 需要成对端点对象
    let markArea = [];
    if (bestWindow) {
      const endIdx = hourly.findIndex((h) => h.hour === bestWindow.end);
      const nextHour = endIdx >= 0 && endIdx + 1 < hourly.length ? `${hourly[endIdx + 1].hour}:00` : null;
      if (nextHour) {
        markArea = [[
          {
            xAxis: `${bestWindow.start}:00`,
            itemStyle: { color: 'rgba(53,196,141,0.10)' },
            label: { show: true, position: 'insideTop', color: GREEN, fontSize: 10, formatter: '最佳窗口' },
          },
          { xAxis: nextHour },
        ]];
      }
    }
    chart.setOption({
      grid: { left: 36, right: 14, top: 30, bottom: 24 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(5,29,40,0.95)',
        borderColor: 'rgba(120,200,220,0.3)',
        textStyle: { color: '#eaf6fa', fontSize: 12 },
        formatter: (params) => {
          const p = params[0];
          const h = hourly[p.dataIndex];
          return `${h.hour}:00 · ${h.score}分（${h.level}）<br/>气压 ${h.pressure}hPa · ${h.windDir}风${h.windSpeed}m/s<br/>估算水温 ${h.waterTemp}℃`;
        },
      },
      xAxis: {
        type: 'category', data: hours, boundaryGap: false,
        axisLine: { lineStyle: { color: 'rgba(120,200,220,0.2)' } },
        axisLabel: { color: '#6f95a5', fontSize: 10, interval: 2 },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value', min: 0, max: 100, interval: 25,
        axisLabel: { color: '#6f95a5', fontSize: 10 },
        splitLine: { lineStyle: { color: 'rgba(120,200,220,0.08)' } },
      },
      series: [{
        type: 'line', data: scores, smooth: true, symbol: 'circle', symbolSize: 5,
        lineStyle: { width: 3, color: GREEN },
        itemStyle: { color: GREEN, borderColor: '#04202b', borderWidth: 1.5 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(53,196,141,0.35)' },
            { offset: 1, color: 'rgba(53,196,141,0.02)' },
          ]),
        },
        markLine: {
          silent: true, symbol: 'none',
          data: [{ yAxis: 82, lineStyle: { color: 'rgba(53,196,141,0.5)', type: 'dashed' }, label: { show: false } }],
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
          { xAxis: firstToday - 1, itemStyle: { color: 'rgba(76,184,232,0.08)' } },
          { xAxis: labels.length - 1 },
        ]]
      : [];
    chart.setOption({
      grid: { left: 44, right: 14, top: 26, bottom: 22 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(5,29,40,0.95)',
        borderColor: 'rgba(120,200,220,0.3)',
        textStyle: { color: '#eaf6fa', fontSize: 12 },
        formatter: (params) => `${labels[params[0].dataIndex]}<br/>气压 ${params[0].value} hPa`,
      },
      xAxis: {
        type: 'category', data: labels, boundaryGap: false,
        axisLine: { lineStyle: { color: 'rgba(120,200,220,0.2)' } },
        axisLabel: { color: '#6f95a5', fontSize: 9, interval: 7 },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value', scale: true,
        axisLabel: { color: '#6f95a5', fontSize: 10, formatter: '{value}' },
        splitLine: { lineStyle: { color: 'rgba(120,200,220,0.08)' } },
      },
      series: [{
        type: 'line', data: pressures, smooth: true, symbol: 'none',
        lineStyle: { width: 2.5, color: BLUE },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(76,184,232,0.28)' },
            { offset: 1, color: 'rgba(76,184,232,0.02)' },
          ]),
        },
        markArea: { silent: true, data: markArea },
        markLine: {
          silent: true, symbol: 'none',
          data: [
            { yAxis: 1020, lineStyle: { color: 'rgba(240,180,76,0.4)', type: 'dashed' }, label: { color: '#6f95a5', fontSize: 9, formatter: '1020 上限' } },
            { yAxis: 1000, lineStyle: { color: 'rgba(240,180,76,0.4)', type: 'dashed' }, label: { color: '#6f95a5', fontSize: 9, formatter: '1000 下限' } },
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
  const color = direction === 'positive' ? GREEN : AMBER;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
      <span style={{ width: 108, color: 'var(--text-2)', flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(4,24,33,0.7)', overflow: 'hidden' }}>
        <div style={{ width: `${score}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      <span style={{ width: 26, textAlign: 'right', color, fontWeight: 700 }}>{score}</span>
    </div>
  );
}
