import React, { useEffect, useMemo, useState } from 'react';
import { api, todayStr } from '../api.js';
import { useAuth, useToast } from '../store.jsx';
import { Spinner, Sheet, Segmented, LevelBadge } from '../components/ui.jsx';
import { PressureChart, ProbabilityChart } from '../components/Charts.jsx';

const SKY_ICON = { 晴: '☀️', 多云: '⛅', 阴: '☁️', 小雨: '🌦️', 中雨: '🌧️', 大雨: '⛈️' };

/** 逐小时「有口」程度 */
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

  /** 鱼种对比：拉取多个鱼种当日逐小时分 */
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

  return (
    <div className="page">
      <div className="topbar">
        <div style={{ flex: 1 }}>
          <div className="topbar-title">🌤️ 天气与鱼情</div>
          <div className="topbar-sub">{forecast?.spotName} · {fmtDate(date)} · 逐小时适宜钓指数</div>
        </div>
        <span className="vip-badge">👑 VIP</span>
      </div>

      {/* 日期条：昨天置灰 / 今天明天免费 / 第三天起 VIP */}
      <div className="chip-row" style={{ marginBottom: 10 }}>
        {trend.map((t, i) => {
          const yesterday = i === 0 && t.date < todayStr(0);
          return (
            <button key={t.date}
              className={`chip ${date === t.date ? 'active' : ''}`}
              style={yesterday ? { opacity: 0.4 } : {}}
              onClick={() => {
                if (yesterday) return showToast('昨天的指数已成历史，从今天看起', 'info');
                if (t.isVip && !user?.isVip) showToast('该日期为会员专享，已为你免费体验', 'info');
                setDate(t.date);
              }}>
              {i === 0 ? '昨天 ' : i === 1 ? '今天 ' : i === 2 ? '明天 ' : `${t.weekday} `}
              {fmtDate(t.date)}{t.isVip ? ' 👑' : ''}
            </button>
          );
        })}
      </div>

      {/* 钓法 + 鱼种 */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {[{ key: 'freshwater', label: '台钓' }, { key: 'lure', label: '路亚' }, { key: 'sea', label: '海钓' }].map((m) => (
          <button key={m.key} className={`chip ${method === m.key ? 'active' : ''}`} onClick={() => setMethod(m.key)}>{m.label}</button>
        ))}
      </div>
      <div className="chip-row" style={{ marginBottom: 12 }}>
        {speciesOptions.map((s) => (
          <button key={s.species} className={`chip ${species === s.species ? 'active' : ''}`}
            onClick={() => setSpecies(s.species)}>{s.species}</button>
        ))}
      </div>

      <div className="card-title">
        <span>🎣 {species}逐小时钓鱼指数</span>
        <span className="extra">
          低 <i style={{ display: 'inline-block', width: 40, height: 5, borderRadius: 3, background: 'linear-gradient(90deg,var(--red),var(--amber),var(--green))', margin: '0 4px' }} /> 高
        </span>
      </div>

      {/* 操作行 */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        <button className="chip" onClick={() => showToast('已解锁今日免费体验', 'success')}>🎁 免费体验</button>
        <button className="chip" onClick={() => setCompareOpen(true)}>⚖️ 鱼种对比</button>
        <button className="chip" onClick={() => onNavigateToMap()}>✨ AI找钓点</button>
        <button className="chip" onClick={() => setReadOpen(true)}>📖 解读</button>
      </div>

      {loading && <Spinner />}

      {!loading && hourly.length > 0 && (
        <>
          {/* 逐小时表（含溶氧列，对齐参考竞品） */}
          <div className="card" style={{ padding: '6px 10px' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="hourly-table">
                <thead>
                  <tr>
                    <th>时间</th><th>天气</th><th>气温℃</th><th>气压hPa</th><th>风速km/h</th><th>水温℃</th><th>水氧mg/L</th><th>指数</th>
                  </tr>
                </thead>
                <tbody>
                  {hourly.map((h) => {
                    const [bite, cls] = biteText(h.score);
                    return (
                      <tr key={h.hour}>
                        <td className="hm">{String(h.hour).padStart(2, '0')}</td>
                        <td>{SKY_ICON[h.skycon] || '🌤️'}</td>
                        <td>{h.temp}</td>
                        <td>{h.pressure}</td>
                        <td>{Math.round(h.windSpeed * 3.6)}</td>
                        <td>{h.waterTemp}</td>
                        <td>{h.dissolvedOxygen ?? '-'}</td>
                        <td style={{ minWidth: 92 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(4,24,33,0.6)', overflow: 'hidden' }}>
                              <div style={{
                                width: `${h.score}%`, height: '100%',
                                background: h.score >= 82 ? 'var(--green)' : h.score >= 68 ? 'var(--blue)' : h.score >= 52 ? 'var(--amber)' : 'var(--red)',
                              }} />
                            </div>
                            <span style={{ fontSize: 10.5, width: 18, textAlign: 'right' }}>{h.score}</span>
                          </div>
                          <span className={`badge ${cls}`} style={{ fontSize: 9, padding: '1px 5px', marginTop: 2 }}>{bite}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 概率曲线（PRD FR-01：逐小时开口概率 + 最佳窗口高亮） */}
          <div className="card">
            <div className="card-title"><span>📊 逐小时开口概率</span><span className="extra">高亮为黄金鱼段</span></div>
            <ProbabilityChart hourly={hourly} bestWindow={forecast.bestWindow} />
          </div>

          {/* 气压趋势（PRD FR-02：过去 24h 气压曲线） */}
          {forecast.pressureTrend?.length > 0 && (
            <div className="card">
              <div className="card-title"><span>🌡️ 气压趋势</span><span className="extra">过去 24h + 今日</span></div>
              <PressureChart trend={forecast.pressureTrend} />
            </div>
          )}

          {/* 环境因子 */}
          <div className="card">
            <div className="card-title"><span>🔬 环境因子（当前小时）</span></div>
            <EnvGrid hourly={hourly} sp={sp} />
          </div>
        </>
      )}

      {/* 免责声明 */}
      <p className="muted" style={{ fontSize: 10.5, textAlign: 'center', lineHeight: 1.7 }}>
        {forecast?.disclaimer || '预测仅供参考，不构成出钓决策保证'}
      </p>

      {/* 鱼种对比 */}
      <Sheet open={compareOpen} title="⚖️ 鱼种对比（最多 3 种）" onClose={() => setCompareOpen(false)}>
        <div className="chip-row" style={{ marginBottom: 12 }}>
          {speciesList.map((s) => (
            <button key={s.species} className={`chip ${compareSpecies.includes(s.species) ? 'active' : ''}`}
              onClick={() => toggleCompare(s.species)}>{s.species}</button>
          ))}
        </div>
        {compareData.length > 0
          ? <ProbabilityChart multi={compareData.map((d) => ({ species: d.species, hourly: d.hourly }))} />
          : <p className="muted" style={{ fontSize: 12 }}>选择鱼种查看对比曲线</p>}
      </Sheet>

      {/* 解读 */}
      <Sheet open={readOpen} title="📖 钓况解读" onClose={() => setReadOpen(false)}>
        {forecast && (
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>AI 钓况解析</div>
            <p style={{ fontSize: 12.5, lineHeight: 1.8, color: 'var(--text-2)' }}>{forecast.advice}</p>
            <div className="divider" />
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Top 影响因子</div>
            {(forecast.topFactors || []).map((f) => (
              <div key={f.key} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span>{f.label}</span>
                  <span className={f.direction === 'positive' ? 'green-text' : 'amber-text'}>
                    {f.direction === 'positive' ? '正向' : '负向'} · 权重 {Math.round(f.weight * 100)}%
                  </span>
                </div>
                <div style={{ height: 5, borderRadius: 3, background: 'rgba(4,24,33,0.6)', marginTop: 4 }}>
                  <div style={{ width: `${f.score}%`, height: '100%', borderRadius: 3, background: f.direction === 'positive' ? 'var(--green)' : 'var(--amber)' }} />
                </div>
              </div>
            ))}
            <div className="divider" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                ['黄金鱼段', forecast.bestWindow ? `${forecast.bestWindow.start}:00–${forecast.bestWindow.end}:00` : '-'],
                ['窗口均分', forecast.bestWindow?.avgScore ?? '-'],
                ['适宜水温', sp ? `${sp.waterTempMin}-${sp.waterTempMax}℃` : '-'],
                ['月相', forecast.weatherMeta?.moonPhaseName || '-'],
              ].map(([k, v]) => (
                <div key={k} style={{ background: 'rgba(4,24,33,0.45)', borderRadius: 10, padding: '8px 10px' }}>
                  <div className="muted" style={{ fontSize: 10.5 }}>{k}</div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, marginTop: 2 }}>{v}</div>
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
    ['气温', `${h.temp}℃`, '🌡️'],
    ['气压', `${h.pressure}hPa`, '📊'],
    ['3h 变压', `${h.pressureTrend3h > 0 ? '+' : ''}${h.pressureTrend3h}hPa`, '📉'],
    ['风', `${h.windDir} ${h.windSpeed}m/s`, '💨'],
    ['降水量', `${h.precip}mm/h`, '🌧️'],
    ['湿度', `${h.humidity}%`, '💧'],
    ['估算水温', `${h.waterTemp}℃`, '🌊'],
    ['溶氧', `${h.dissolvedOxygen ?? '-'}mg/L`, '🫧'],
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
      {cells.map(([k, v, icon]) => (
        <div key={k} style={{ background: 'rgba(4,24,33,0.45)', borderRadius: 10, padding: '8px 4px', textAlign: 'center' }}>
          <div style={{ fontSize: 15 }}>{icon}</div>
          <div style={{ fontSize: 12, fontWeight: 700, marginTop: 2 }}>{v}</div>
          <div className="muted" style={{ fontSize: 9.5 }}>{k}</div>
        </div>
      ))}
    </div>
  );
}
