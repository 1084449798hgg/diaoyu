import React, { useEffect, useMemo, useState } from 'react';
import { api, todayStr } from '../api.js';
import { useAuth, useToast } from '../store.jsx';
import { Spinner, Sheet, Segmented } from '../components/ui.jsx';
import { PressureChart, ProbabilityChart } from '../components/Charts.jsx';
import Icon from '../components/icons.jsx';

const SKY_ICON = { 晴: '☀️', 多云: '⛅', 阴: '☁️', 小雨: '🌦️', 中雨: '🌧️', 大雨: '⛈️' };

function biteText(score) {
  if (score >= 82) return ['爆护', 'tag-green'];
  if (score >= 68) return ['有口', 'tag-blue'];
  if (score >= 52) return ['口慢', 'tag-amber'];
  return ['无口', 'tag-red'];
}

function fmtDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
const hh = (n) => String(n).padStart(2, '0');
function weekdayEn(d = new Date()) {
  return ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][d.getDay()];
}
function dateEn(d = new Date()) {
  const M = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  return `${M[d.getMonth()]} ${String(d.getDate()).padStart(2, '0')}`;
}
function windLevel(ms) {
  if (ms < 1.6) return '0';
  if (ms < 3.4) return '1';
  if (ms < 5.5) return '2';
  if (ms < 8.0) return '3';
  if (ms < 10.8) return '4';
  return '5';
}

/** 环形仪表：细弧 + 端点黄绿圆点 */
function Ring({ value, unit, pct, sub }) {
  const size = 64, r = 26, c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, pct ?? 0.5));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef0ea" strokeWidth="4.5" />
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ink)" strokeWidth="4.5" strokeLinecap="round"
            strokeDasharray={`${c * p} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: 'stroke-dasharray .7s cubic-bezier(.2,.9,.3,1)' }}
          />
          <circle
            cx={size / 2} cy={size / 2 - r} r="2.8" fill="var(--lime-deep)"
            stroke="#fff" strokeWidth="1.4"
            style={{ opacity: p > 0.03 ? 1 : 0 }}
          />
        </svg>
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 0,
        }}>
          <span style={{ fontFamily: 'var(--font-num)', fontSize: String(value).length >= 4 ? 13.5 : 17, fontWeight: 800, letterSpacing: '-.05em', lineHeight: 1 }}>{value}</span>
          <span style={{ fontSize: 7.5, color: 'var(--ink-3)', marginTop: 2, fontWeight: 600 }}>{unit}</span>
        </div>
      </div>
      {sub && <span style={{ fontSize: 8.5, color: 'var(--ink-3)', fontWeight: 600 }}>{sub}</span>}
    </div>
  );
}

/** 云朵插画（淡蓝柔光） */
function CloudArt({ sky = '阴' }) {
  const sun = /晴/.test(sky);
  const rain = /雨/.test(sky);
  return (
    <svg width="112" height="88" viewBox="0 0 96 76">
      <defs>
        <linearGradient id="cl" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#b3c9e0" />
        </linearGradient>
        <radialGradient id="sunG" cx="50%" cy="50%">
          <stop offset="0%" stopColor="#ffe9a8" />
          <stop offset="100%" stopColor="#ffd166" />
        </radialGradient>
      </defs>
      {sun && <circle cx="66" cy="24" r="15" fill="url(#sunG)" opacity=".95" />}
      <g>
        <ellipse cx="58" cy="50" rx="36" ry="18" fill="url(#cl)" />
        <circle cx="38" cy="40" r="15" fill="url(#cl)" />
        <circle cx="60" cy="31" r="21" fill="url(#cl)" />
        <circle cx="80" cy="43" r="13" fill="url(#cl)" />
      </g>
      {rain && (
        <g stroke="#8fb6d4" strokeWidth="2.4" strokeLinecap="round" opacity=".75">
          <path d="M34 62v6M46 62v6M58 62v6" />
        </g>
      )}
    </svg>
  );
}


/** 从当前小时起，找最近一个未结束的高分段（≥68） */
function upcomingWindow(hourly, nowH) {
  if (!hourly?.length) return null;
  const segs = [];
  let start = -1;
  for (let i = 0; i < hourly.length; i++) {
    const hot = hourly[i].score >= 68;
    if (hot && start < 0) start = i;
    const isLast = i === hourly.length - 1;
    if (start >= 0 && (!hot || isLast)) {
      const endIdx = hot && isLast ? i : i - 1;
      const slice = hourly.slice(start, endIdx + 1);
      segs.push({
        startH: hourly[start].hour,
        endH: hourly[endIdx].hour + 1,
        avg: Math.round(slice.reduce((a, b) => a + b.score, 0) / Math.max(1, slice.length)),
      });
      start = -1;
    }
  }
  return segs.find((s) => s.endH > nowH) || segs[0] || null;
}

export default function FishingIndexPage({ onNavigateToMap }) {
  const showToast = useToast();
  const { user } = useAuth();
  const [speciesList, setSpeciesList] = useState([]);
  const [method, setMethod] = useState('freshwater');
  const [species, setSpecies] = useState('鲫鱼');
  const [spotId, setSpotId] = useState(1);
  const [date, setDate] = useState(todayStr(0));
  const [forecast, setForecast] = useState(null);
  const [loading, setLoading] = useState(true);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareSpecies, setCompareSpecies] = useState([]);
  const [compareData, setCompareData] = useState([]);
  const [readOpen, setReadOpen] = useState(false);

  useEffect(() => {
    api.species().then((d) => setSpeciesList(d.items)).catch(() => {});
  }, []);

  const speciesOptions = useMemo(
    () => speciesList.filter((s) => (method === 'sea' ? s.category === 'sea' : s.category === 'freshwater')),
    [speciesList, method]
  );

  useEffect(() => {
    if (speciesOptions.length && !speciesOptions.some((s) => s.species === species)) {
      setSpecies(speciesOptions[0].species);
    }
  }, [speciesOptions, species]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        setForecast(await api.forecast({ spotId, date, species, days: 15 }));
      } catch (e) { showToast(e.message, 'error'); }
      finally { setLoading(false); }
    })();
  }, [spotId, date, species, showToast]);

  const trend = forecast?.dailyTrend || [];
  const hourly = forecast?.hourly || [];
  const sp = speciesOptions.find((s) => s.species === species);
  const nowHour = new Date().getHours();
  const cur = hourly[nowHour] || hourly[0];
  const score = Math.round(forecast?.bestWindow?.avgScore ?? 0);
  const [bite] = biteText(score);
  const nextWin = upcomingWindow(hourly, nowHour);

  async function toggleCompare(name) {
    const next = compareSpecies.includes(name)
      ? compareSpecies.filter((s) => s !== name)
      : compareSpecies.length >= 3 ? compareSpecies : [...compareSpecies, name];
    setCompareSpecies(next);
    const datas = await Promise.all(
      next.map((n) => api.forecast({ spotId, date, species: n }).catch(() => null))
    );
    setCompareData(datas.filter(Boolean));
  }

  const pctOf = (v, lo, hi) => (v - lo) / (hi - lo);

  return (
    <div className="page">
      {/* 头部 */}
      <div className="wx-head">
        <div style={{ display: 'flex', alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <div className="wx-title">钓鱼天气<em>{weekdayEn()} · {dateEn()}</em></div>
            <div className="wx-locline">
              <Icon name="pin" size={11} />
              <span>{forecast?.spotName || '千岛湖中心湖区钓场'}</span>
              <Icon name="right" size={10} style={{ opacity: .4 }} />
              <span className="wx-refresh"><Icon name="clock" size={10} />{hh(nowHour)}:{String(new Date().getMinutes()).padStart(2, '0')} 更新</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 7, marginTop: 2 }}>
            <button className="hx-icon-btn" style={{ background: 'var(--surface)', border: '1px solid var(--hair)', color: 'var(--ink)' }} onClick={() => onNavigateToMap()}>
              <Icon name="locate" size={16} />
            </button>
            <button className="hx-icon-btn" style={{ background: 'var(--surface)', border: '1px solid var(--hair)', color: 'var(--ink)' }} onClick={() => showToast('已刷新最新鱼情数据', 'success')}>
              <Icon name="share" size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* 橙色提示：最佳窗口 */}
      <button className="wx-alert" style={{ width: '100%', textAlign: 'left' }} onClick={() => showToast(`黄金时段 ${forecast?.bestWindow ? `${hh(forecast.bestWindow.start)}:00-${hh(forecast.bestWindow.end)}:00` : '-'}，建议提前打窝`, 'info')}>
        <Icon name="flame" size={20} />
        <div style={{ flex: 1 }}>
          <b>{nextWin && nextWin.startH <= nowHour ? '当前正是黄金窗口' : '今天的最佳出竿窗口'}</b>
          <span>{nextWin ? `${hh(nextWin.startH)}:00 – ${hh(nextWin.endH)}:00 · 均分 ${nextWin.avg}` : '正在计算逐小时鱼口…'}</span>
        </div>
        <Icon name="right" size={16} />
      </button>

      {loading && !forecast && <Spinner />}

      {cur && (
        <>
          {/* 大天气卡 */}
          <div className="wx-hero-card hx-rise">
            <div className="wx-main">
              <div>
                <div className="wx-temp">{Math.round(cur.temp)}<sup>°</sup></div>
                <div className="wx-cond">
                  {SKY_ICON[cur.skycon] || '☁️'} {cur.skycon || '阴'}
                  <span>体感 {Math.round(cur.temp - 1)}° · 今日 {Math.round(Math.min(...hourly.map((h) => h.temp)))}°~{Math.round(Math.max(...hourly.map((h) => h.temp)))}°</span>
                </div>
              </div>
              <CloudArt sky={cur.skycon} />
            </div>
            <div className="wx-rings">
              <div className="wx-ring">
                <Ring value={windLevel(cur.windSpeed)} unit="级" pct={Math.min(1, cur.windSpeed / 10)} sub={`阵风 ${Math.round(cur.windSpeed * 1.6)}`} />
                <div className="wx-ring-cap"><b>风</b>{cur.windDir}风</div>
              </div>
              <div className="wx-ring">
                <Ring value={Math.round(cur.pressure)} unit="hPa" pct={pctOf(cur.pressure, 990, 1035)} sub={cur.pressureTrend3h >= 0 ? '↑ 上升' : '↓ 下降'} />
                <div className="wx-ring-cap"><b>气压</b>{cur.pressureTrend3h >= 0 ? '利好' : '偏闷'}</div>
              </div>
              <div className="wx-ring">
                <Ring value={cur.waterTemp?.toFixed?.(1)} unit="℃" pct={pctOf(cur.waterTemp, 0, 32)} sub={sp ? `${sp.waterTempMin}-${sp.waterTempMax}℃` : ''} />
                <div className="wx-ring-cap"><b>水温</b>{sp && cur.waterTemp >= sp.waterTempMin && cur.waterTemp <= sp.waterTempMax ? '适宜' : '偏离'}</div>
              </div>
              <div className="wx-ring">
                <Ring value={cur.humidity} unit="%" pct={cur.humidity / 100} sub="相对湿度" />
                <div className="wx-ring-cap"><b>湿度</b>{cur.humidity > 80 ? '偏潮' : '舒适'}</div>
              </div>
            </div>
          </div>

          {/* 绿色提示条 */}
          <div className="wx-strip">
            <span className="wx-strip-dot" />
            <span className="wx-strip-txt">
              {hourly.slice(nowHour, nowHour + 2).every((h) => !h.precip || h.precip < 0.1)
                ? '未来两小时不会下雨，放心出门'
                : '未来两小时有降雨，注意防雨与湿滑'}
            </span>
            <button className="p-pill p-pill-line" onClick={() => setReadOpen(true)}>解读</button>
          </div>

          {/* 今日鱼情 */}
          <div className="p-card hx-rise hx-rise-1">
            <div className="wx-bite-head">
              <div className="wx-bite-title">今日鱼情 <em>FISHING</em></div>
              <button className="wx-select" onClick={() => setReadOpen(true)}>
                {method === 'sea' ? '海钓' : method === 'lure' ? '路亚' : '台钓'} · {species}
                <Icon name="right" size={10} style={{ transform: 'rotate(90deg)' }} />
              </button>
            </div>
            <div className="wx-bite-body">
              <div style={{ position: 'relative', width: 104, height: 104, flexShrink: 0 }}>
                <svg width="104" height="104" viewBox="0 0 104 104">
                  <defs>
                    <linearGradient id="biteArc" x1="0" y1="1" x2="1" y2="0">
                      <stop offset="0%" stopColor="#f7b955" />
                      <stop offset="55%" stopColor="#d8e85a" />
                      <stop offset="100%" stopColor="#b8e226" />
                    </linearGradient>
                  </defs>
                  <circle cx="52" cy="52" r="42" fill="none" stroke="#f0f2ec" strokeWidth="9" />
                  <circle
                    cx="52" cy="52" r="42" fill="none" stroke="url(#biteArc)" strokeWidth="9" strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 42 * (Math.min(100, score) / 100)} ${2 * Math.PI * 42}`}
                    transform="rotate(-90 52 52)"
                  />
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontFamily: 'var(--font-num)', fontSize: 30, fontWeight: 800, letterSpacing: '-.06em', lineHeight: 1 }}>{score}</span>
                  <span style={{ fontSize: 8.5, color: 'var(--ink-3)', marginTop: 2, fontWeight: 600 }}>分</span>
                </div>
                <div style={{ position: 'absolute', left: '50%', bottom: -2, transform: 'translateX(-50%)' }}>
                  <span className="p-pill p-pill-lime" style={{ height: 22, fontSize: 9.5 }}>{bite}</span>
                </div>
              </div>
              <div className="wx-bite-right">
                <div className="wx-bite-next">下一个黄金时段</div>
                <div className="wx-window">
                  {nextWin ? `${hh(nextWin.startH)}:00–${hh(nextWin.endH)}:00` : '--'}
                  <small>/ 均分 {nextWin?.avg ?? '--'}</small>
                </div>
                <div style={{ display: 'flex', gap: 5, marginTop: 9, flexWrap: 'wrap' }}>
                  <span className="p-pill p-pill-line" style={{ height: 22, fontSize: 9.5 }}>{sp ? `适宜 ${sp.waterTempMin}-${sp.waterTempMax}℃` : '水温适宜'}</span>
                  <span className="p-pill p-pill-line" style={{ height: 22, fontSize: 9.5 }}>{forecast?.weatherMeta?.moonPhaseName || '月相'}</span>
                </div>
              </div>
            </div>
            {/* 24h 柱 */}
            <div className="wx-hourbars">
              {hourly.slice(0, 24).map((h) => (
                <div key={h.hour}
                  className={`wx-hb${h.score >= 75 ? ' on' : h.score >= 68 ? ' mid' : ''}${h.hour === nowHour ? ' now' : ''}`}
                  style={{ height: `${22 + h.score * 0.52}%` }}
                  title={`${hh(h.hour)}:00 · ${h.score}分`} />
              ))}
            </div>
            <div className="wx-hourline">
              {['00', '06', '12', '18', '23'].map((t) => <span key={t}>{t}</span>)}
            </div>
          </div>

          {/* 日期条 */}
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '2px 0 10px', scrollbarWidth: 'none' }}>
            {trend.map((t, i) => {
              const yesterday = i === 0 && t.date < todayStr(0);
              const on = date === t.date;
              return (
                <button key={t.date}
                  onClick={() => {
                    if (yesterday) return showToast('昨天的指数已成历史，从今天看起', 'info');
                    if (t.isVip && !user?.isVip) showToast('该日期为会员专享，已为你免费体验', 'info');
                    setDate(t.date);
                  }}
                  style={{
                    flexShrink: 0, minWidth: 68, height: 50, borderRadius: 13, padding: '0 12px',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
                    background: on ? 'var(--forest)' : 'var(--surface)',
                    border: `1px solid ${on ? 'var(--forest)' : 'var(--hair)'}`,
                    color: on ? '#fff' : 'var(--ink-2)', opacity: yesterday ? .38 : 1,
                  }}>
                  <span style={{ fontSize: 8.5, letterSpacing: '.06em', color: on ? 'rgba(216,248,79,.9)' : 'var(--ink-3)', fontWeight: 700 }}>
                    {i === 0 ? '昨天' : i === 1 ? '今天' : i === 2 ? '明天' : t.weekday}
                  </span>
                  <span style={{ fontFamily: 'var(--font-num)', fontSize: 12, fontWeight: 700 }}>{fmtDate(t.date)}{t.isVip ? '·VIP' : ''}</span>
                </button>
              );
            })}
          </div>

          {/* 钓法 / 鱼种 */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            {[{ key: 'freshwater', label: '台钓' }, { key: 'lure', label: '路亚' }, { key: 'sea', label: '海钓' }].map((m) => (
              <button key={m.key} onClick={() => setMethod(m.key)}
                className={`p-pill${method === m.key ? ' p-pill-dark' : ' p-pill-line'}`}
                style={{ height: 30, padding: '0 14px', fontSize: 11.5 }}>{m.label}</button>
            ))}
            <div style={{ flex: 1 }} />
            <button className="p-pill p-pill-line" style={{ height: 30, fontSize: 10.5 }} onClick={() => setCompareOpen(true)}>
              <Icon name="trend" size={12} /> 对比
            </button>
          </div>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 12, scrollbarWidth: 'none' }}>
            {speciesOptions.map((s) => (
              <button key={s.species} onClick={() => setSpecies(s.species)}
                style={{
                  flexShrink: 0, height: 28, padding: '0 12px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                  background: species === s.species ? 'var(--lime)' : 'var(--surface)',
                  color: species === s.species ? 'var(--forest)' : 'var(--ink-2)',
                  border: `1px solid ${species === s.species ? 'transparent' : 'var(--hair)'}`,
                }}>{s.species}</button>
            ))}
          </div>

          {/* 逐小时表 */}
          <div className="p-sec-head">
            <div className="p-sec-title">逐小时鱼口 <em>HOURLY</em></div>
            <span style={{ fontSize: 9, color: 'var(--ink-3)' }}>低 — 高</span>
          </div>
          <div className="hx-table-wrap">
            <div style={{ overflowX: 'auto' }}>
              <table className="hx-table">
                <thead>
                  <tr><th>时间</th><th>天气</th><th>气温</th><th>气压</th><th>风速</th><th>水温</th><th>水氧</th><th>指数</th></tr>
                </thead>
                <tbody>
                  {hourly.map((h) => {
                    const [bt] = biteText(h.score);
                    return (
                      <tr key={h.hour}>
                        <td className="hm">{hh(h.hour)}</td>
                        <td>{SKY_ICON[h.skycon] || '🌤️'}</td>
                        <td>{h.temp}</td>
                        <td>{h.pressure}</td>
                        <td>{Math.round(h.windSpeed * 3.6)}</td>
                        <td>{h.waterTemp}</td>
                        <td>{h.dissolvedOxygen ?? '-'}</td>
                        <td style={{ minWidth: 84 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <div className="hx-score-bar" style={{ flex: 1 }}>
                              <i style={{ width: `${h.score}%`, background: h.score >= 82 ? 'var(--lime-deep)' : h.score >= 68 ? '#9fc36a' : h.score >= 52 ? '#e6c37a' : '#d8c2bb' }} />
                            </div>
                            <span style={{ fontFamily: 'var(--font-num)', fontSize: 10, width: 16, textAlign: 'right', color: 'var(--ink)', fontWeight: 700 }}>{h.score}</span>
                          </div>
                          <span style={{ fontSize: 7.5, color: 'var(--ink-3)' }}>{bt}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 曲线 */}
          <div className="p-card">
            <div className="p-sec-head" style={{ margin: '0 0 10px' }}>
              <div className="p-sec-title" style={{ fontSize: 15 }}>开口概率 <em>PROBABILITY</em></div>
              <span style={{ fontSize: 9, color: 'var(--ink-3)' }}>高亮为黄金段</span>
            </div>
            <ProbabilityChart hourly={hourly} bestWindow={forecast.bestWindow} />
          </div>

          {forecast.pressureTrend?.length > 0 && (
            <div className="p-card">
              <div className="p-sec-head" style={{ margin: '0 0 10px' }}>
                <div className="p-sec-title" style={{ fontSize: 15 }}>气压趋势 <em>PRESSURE</em></div>
                <span style={{ fontSize: 9, color: 'var(--ink-3)' }}>过去 24h</span>
              </div>
              <PressureChart trend={forecast.pressureTrend} />
            </div>
          )}

          {/* 环境因子 */}
          <div className="p-card">
            <div className="p-sec-head" style={{ margin: '0 0 12px' }}>
              <div className="p-sec-title" style={{ fontSize: 15 }}>环境因子 <em>FACTORS</em></div>
            </div>
            <EnvGrid hourly={hourly} sp={sp} />
          </div>

          <p style={{ fontSize: 9.5, color: 'var(--ink-3)', textAlign: 'center', lineHeight: 1.8, margin: '4px 0 8px' }}>
            {forecast?.disclaimer || '预测仅供参考，不构成出钓决策保证'}
          </p>
        </>
      )}

      {/* 鱼种对比 */}
      <Sheet open={compareOpen} title="鱼种对比（最多 3 种）" onClose={() => setCompareOpen(false)}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {speciesList.map((s) => (
            <button key={s.species} onClick={() => toggleCompare(s.species)}
              className={`p-pill${compareSpecies.includes(s.species) ? ' p-pill-dark' : ' p-pill-line'}`}
              style={{ height: 30, fontSize: 11 }}>{s.species}</button>
          ))}
        </div>
        {compareData.length > 0
          ? <ProbabilityChart multi={compareData.map((d) => ({ species: d.species, hourly: d.hourly }))} />
          : <p style={{ fontSize: 11, color: 'var(--ink-3)' }}>选择鱼种查看对比曲线</p>}
      </Sheet>

      {/* 解读 */}
      <Sheet open={readOpen} title="钓况解读" onClose={() => setReadOpen(false)}>
        {forecast && (
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>AI 钓况解析</div>
            <p style={{ fontSize: 11.5, lineHeight: 1.9, color: 'var(--ink-2)' }}>{forecast.advice}</p>
            <div className="p-divider" />
            <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 10 }}>Top 影响因子</div>
            {(forecast.topFactors || []).map((f) => (
              <div key={f.key} style={{ marginBottom: 11 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                  <span>{f.label}</span>
                  <span style={{ color: f.direction === 'positive' ? '#4d7c3a' : '#a35322', fontWeight: 600 }}>
                    {f.direction === 'positive' ? '正向' : '负向'} · {Math.round(f.weight * 100)}%
                  </span>
                </div>
                <div style={{ height: 5, borderRadius: 3, background: 'var(--surface-2)', marginTop: 5, overflow: 'hidden' }}>
                  <div style={{ width: `${f.score}%`, height: '100%', borderRadius: 3, background: f.direction === 'positive' ? 'var(--lime-deep)' : '#e6b27a' }} />
                </div>
              </div>
            ))}
            <div className="p-divider" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                ['黄金鱼段', forecast.bestWindow ? `${forecast.bestWindow.start}:00–${forecast.bestWindow.end}:00` : '-'],
                ['窗口均分', forecast.bestWindow?.avgScore ?? '-'],
                ['适宜水温', sp ? `${sp.waterTempMin}-${sp.waterTempMax}℃` : '-'],
                ['月相', forecast.weatherMeta?.moonPhaseName || '-'],
              ].map(([k, v]) => (
                <div key={k} style={{ background: 'var(--surface-2)', borderRadius: 12, padding: '9px 11px' }}>
                  <div style={{ fontSize: 9, color: 'var(--ink-3)' }}>{k}</div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 3 }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}

function EnvGrid({ hourly, sp }) {
  const h = hourly[new Date().getHours()] || hourly[0];
  const cells = [
    ['气温', `${h.temp}℃`, 'thermo'],
    ['气压', `${h.pressure}`, 'gauge'],
    ['3h 变压', `${h.pressureTrend3h > 0 ? '+' : ''}${h.pressureTrend3h}`, 'trend'],
    ['风', `${h.windDir} ${h.windSpeed}m/s`, 'wind'],
    ['降水量', `${h.precip}mm/h`, 'drop'],
    ['湿度', `${h.humidity}%`, 'water'],
    ['水温', `${h.waterTemp}℃`, 'water'],
    ['溶氧', `${h.dissolvedOxygen ?? '-'}mg/L`, 'drop'],
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
      {cells.map(([k, v, ic]) => (
        <div key={k} style={{ background: 'var(--surface-2)', borderRadius: 12, padding: '10px 2px', textAlign: 'center' }}>
          <Icon name={ic} size={15} style={{ margin: '0 auto', color: 'var(--ink-2)' }} />
          <div style={{ fontSize: 11, fontWeight: 700, marginTop: 5, fontFamily: 'var(--font-num)', letterSpacing: '-.02em' }}>{v}</div>
          <div style={{ fontSize: 8.5, color: 'var(--ink-3)', marginTop: 2 }}>{k}</div>
        </div>
      ))}
    </div>
  );
}
