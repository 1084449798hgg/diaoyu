import React, { useEffect, useMemo, useState } from 'react';
import { api, todayStr } from '../api.js';
import { useToast } from '../store.jsx';
import { Sheet, Spinner } from '../components/ui.jsx';

/**
 * 首页（对齐参考竞品交互）：
 * 品牌头 + 钓法四段（台钓/路亚/海钓/钓场）+ 城市实时指数大评分 + 段位文案
 * + 建议文案 + 多段黄金时段胶囊 + 动态指标四格 + 白色大面板（五圆形入口 /
 * SHOW YOUR TANK 横幅 / 附近钓点推荐列表）
 */

/** 钓法四段：台钓=淡水综合 / 路亚=淡水路亚 / 海钓=近海 / 钓场=黑坑推荐 */
const METHODS = [
  { key: 'freshwater', label: '台钓', en: 'FLOAT', cat: 'freshwater', defaultSpecies: '鲫鱼' },
  { key: 'lure', label: '路亚', en: 'LURE', cat: 'freshwater', defaultSpecies: '翘嘴' },
  { key: 'sea', label: '海钓', en: 'SEA', cat: 'sea', defaultSpecies: '鲈鱼' },
  { key: 'pond', label: '钓场', en: 'POND', cat: 'freshwater', defaultSpecies: '鲫鱼' },
];

/** 段位文案（参考竞品：极佳 / 良好） */
function scoreTitle(score) {
  if (score >= 78) return '极佳';
  if (score >= 68) return '良好';
  if (score >= 52) return '一般';
  return '鱼口冷';
}

const SKY_ICON = { 晴: '☀️', 多云: '⛅', 阴: '☁️', 小雨: '🌦️', 中雨: '🌧️', 大雨: '🌧️' };

/** 蒲福风级近似（m/s → 级） */
function windLevel(ms) {
  if (ms < 1.6) return '0级';
  if (ms < 3.4) return '1级';
  if (ms < 5.5) return '2级';
  if (ms < 8.0) return '3级';
  if (ms < 10.8) return '4级';
  if (ms < 13.9) return '5级';
  if (ms < 17.2) return '6级';
  return '7级+';
}

function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))}分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
  return `${Math.floor(diff / 86400)}天前`;
}

const hh = (h) => String(h).padStart(2, '0');

/** 从逐小时分数提取多段高分连续时段（允许中间断 1 小时），最多 3 段 */
function goldenSegments(hourly, threshold = 68, maxSegs = 3) {
  if (!hourly?.length) return [];
  const flagged = hourly.map((h) => ({ ...h, hot: h.score >= threshold }));
  const segs = [];
  let start = -1, lastHot = -1, gap = 0;
  flagged.forEach((h, i) => {
    if (h.hot) {
      if (start < 0) start = i;
      lastHot = i; gap = 0;
    } else if (start >= 0) {
      gap += 1;
      if (gap > 1 || i === flagged.length - 1) {
        segs.push({ startH: flagged[start].hour, endH: flagged[lastHot].hour + 1, avg: 0 });
        start = -1;
      }
    }
  });
  if (start >= 0) segs.push({ startH: flagged[start].hour, endH: flagged[lastHot].hour + 1, avg: 0 });
  // 计算每段均分并排序
  segs.forEach((s) => {
    const seg = hourly.filter((h) => h.hour >= s.startH && h.hour < s.endH);
    s.avg = Math.round(seg.reduce((a, b) => a + b.score, 0) / Math.max(1, seg.length));
  });
  return segs.sort((a, b) => b.avg - a.avg).slice(0, maxSegs);
}

export default function HomePage({ onNavigateToMap, onNavigateToCommunity, onNavigateToProfile, onPublish }) {
  const showToast = useToast();
  const [spots, setSpots] = useState([]);
  const [speciesList, setSpeciesList] = useState([]);
  const [spotId, setSpotId] = useState(1);
  const [method, setMethod] = useState('freshwater');
  const [species, setSpecies] = useState('鲫鱼');
  const [forecast, setForecast] = useState(null);
  const [catches, setCatches] = useState([]);
  const [tide, setTide] = useState(null);
  const [loading, setLoading] = useState(true);
  const [spotPicker, setSpotPicker] = useState(false);
  const [vipSheet, setVipSheet] = useState(false);
  const [waterSheet, setWaterSheet] = useState(false); // 江河水位 / 潮汐表
  const [noticeSheet, setNoticeSheet] = useState(false);

  const today = todayStr(0);
  const nowHour = useMemo(() => new Date().getHours(), []);
  const methodCfg = METHODS.find((m) => m.key === method);

  useEffect(() => {
    (async () => {
      try {
        const [spotsData, speciesData] = await Promise.all([
          api.spots({ lng: 119.05, lat: 29.6, radius: 40000 }),
          api.species(),
        ]);
        setSpots(spotsData.spots.filter((s) => !s.banned));
        setSpeciesList(speciesData.items);
      } catch (e) { showToast(e.message, 'error'); }
    })();
  }, [showToast]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await api.forecast({ spotId, date: today, species, days: 15 });
        setForecast(data);
      } catch (e) { showToast(e.message, 'error'); }
      finally { setLoading(false); }
    })();
  }, [spotId, species, today, showToast]);

  useEffect(() => {
    api.catches({ page: 1, pageSize: 8 }).then((d) => setCatches(d.items)).catch(() => {});
  }, []);

  // 海钓模式拉潮汐
  useEffect(() => {
    if (method !== 'sea') return;
    api.tide(today).then(setTide).catch(() => setTide(null));
  }, [method, today]);

  const speciesOptions = useMemo(
    () => speciesList.filter((s) => s.category === methodCfg.cat),
    [speciesList, methodCfg]
  );

  // 切换钓法时重置鱼种
  useEffect(() => {
    if (speciesOptions.length && !speciesOptions.some((s) => s.species === species)) {
      setSpecies(speciesOptions[0].species);
    }
  }, [speciesOptions, species]);

  const hourly = forecast?.hourly || [];
  const cur = hourly[nowHour] || hourly[0];
  const topHour = useMemo(
    () => hourly.reduce((a, b) => (b.score > a.score ? b : a), hourly[0] || { score: 0 }),
    [hourly]
  );
  const bw = forecast?.bestWindow;
  const spot = spots.find((s) => s.id === spotId);
  const p3h = cur && hourly[Math.max(0, nowHour - 3)];
  const pDelta = cur && p3h ? Math.round((cur.pressure - p3h.pressure) * 10) / 10 : 0;
  const wDelta = cur && hourly[Math.max(0, nowHour - 3)]
    ? Math.round((cur.waterTemp - hourly[Math.max(0, nowHour - 3)].waterTemp) * 10) / 10 : 0;
  const score = Math.round(bw?.avgScore ?? topHour.score ?? 0);
  const segments = useMemo(() => goldenSegments(hourly), [hourly]);

  // 附近钓点推荐（钓场模式优先黑坑）
  const nearby = useMemo(() => {
    const list = [...spots];
    if (method === 'pond') {
      list.sort((a, b) => (b.waterType === '黑坑' ? 1 : 0) - (a.waterType === '黑坑' ? 1 : 0));
    }
    return list.filter((s) => s.distance != null).sort((a, b) => a.distance - b.distance).slice(0, 4);
  }, [spots, method]);

  const rating = (r) => (r === 1 ? '5.0' : r === 2 ? '4.8' : '4.5');

  async function share() {
    const text = `今日${spot?.name || '千岛湖'}${species}鱼情 ${score} 分（${scoreTitle(score)}），黄金时段 ${segments.map((s) => `${hh(s.startH)}:00-${hh(s.endH)}:00`).join(' / ') || '-'}，来自鱼情预报 App`;
    try {
      if (navigator.share) await navigator.share({ title: '鱼情预报', text });
      else showToast('分享文案已复制（演示环境）', 'success');
    } catch { /* 用户取消 */ }
  }

  if (loading && !forecast) {
    return <div className="page home-page"><Spinner /></div>;
  }

  /** 动态四格指标（按钓法） */
  const quad = (() => {
    if (!cur) return [];
    const windCell = { icon: '🧭', label: '风力', value: windLevel(cur.windSpeed), sub: `${cur.windDir}风 ${Math.round(cur.windSpeed)}m/s` };
    const pressureCell = { icon: '📊', label: '气压', value: `${Math.round(cur.pressure)}`, sub: `hPa ${pDelta >= 0 ? '↑' : '↓'}${Math.abs(pDelta)}`, subColor: pDelta >= 0 ? 'var(--red)' : 'var(--green)' };
    const tempCell = { icon: '🌡️', label: '气温', value: `${Math.round(cur.temp)}℃`, sub: `体感 ${Math.round(cur.temp - 1)}℃` };
    const waterCell = { icon: '🌊', label: '水温', value: `${cur.waterTemp?.toFixed?.(1) ?? '--'}℃`, sub: `${wDelta >= 0 ? '↑' : '↓'}${Math.abs(wDelta)}`, subColor: wDelta >= 0 ? 'var(--red)' : 'var(--green)' };
    const o2Cell = { icon: '💧', label: '溶氧', value: cur.dissolvedOxygen?.toFixed?.(1) ?? '--', sub: 'mg/L', arrow: true };
    if (method === 'sea') return [windCell, { icon: '🌊', label: '浪高', value: '--', sub: '近岸平稳' }, { icon: '🌀', label: '潮汐', value: tideLabel(tide), sub: tideSub(tide) }, waterCell];
    if (method === 'lure') return [waterCell, windCell, pressureCell, o2Cell];
    if (method === 'pond') return [tempCell, windCell, pressureCell, waterCell];
    return [tempCell, windCell, pressureCell, waterCell];
  })();

  return (
    <div className="page home-page">
      {/* ===== 深色顶区：品牌头 + 钓法段 + 评分 ===== */}
      <div className="home-hero">
        <div className="home-topline">
          <div>
            <div className="brand-title">钓鱼佬</div>
            <button className="loc-line" onClick={() => setSpotPicker(true)}>
              📍 {spot?.city || '杭州市'} <span className="loc-dot">·</span> {weekdayCn()} · {dateEn()}
            </button>
          </div>
          <div style={{ flex: 1 }} />
          <button className="icon-btn" onClick={() => setNoticeSheet(true)} aria-label="通知">
            <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8a6 6 0 10-12 0c0 7-3 8-3 8h18s-3-1-3-8" /><path d="M13.7 21a2 2 0 01-3.4 0" />
            </svg>
          </button>
        </div>

        {/* 钓法四段 */}
        <div className="method-seg">
          {METHODS.map((m) => (
            <button key={m.key} className={`method-seg-item ${method === m.key ? 'active' : ''}`} onClick={() => setMethod(m.key)}>
              <span className="ms-cn">{m.label}</span>
              <span className="ms-en">{m.en}</span>
              {method === m.key && <i className="ms-underline" />}
            </button>
          ))}
        </div>

        {/* 大评分 */}
        <div className="score-hero">
          <div className="score-big">{score}</div>
          <div className="score-meta">
            <div className="score-level">{scoreTitle(score)}</div>
            <div className="score-sub">城市实时{methodCfg.label}指数 <span>/ 100</span></div>
          </div>
        </div>
        <p className="score-advice">💡 {forecast?.advice || '正在解析今日钓况…'}</p>

        {/* 黄金时段胶囊（多段） */}
        <div className="golden-row">
          <span className="golden-tag">{method === 'sea' ? '涨潮黄金段' : '黄金时段'}</span>
          {segments.length > 0
            ? segments.map((s) => (
              <span key={s.startH} className="golden-pill">{hh(s.startH)}:00 - {hh(s.endH)}:00</span>
            ))
            : <span className="golden-pill">--</span>}
          <button className="golden-vip" onClick={() => setVipSheet(true)}>👑 15天</button>
        </div>
      </div>

      {/* ===== 浅色大面板：四格指标 + 五入口 + 横幅 + 附近钓点 ===== */}
      <div className="home-panel">
        {/* 动态指标四格（按钓法切换） */}
        <div className="quad-grid">
          {quad.map((q) => (
            <div key={q.label} className="quad-cell">
              <div className="quad-head">
                <span className="quad-icon">{q.icon}</span>
                <span className="quad-label">{q.label}</span>
              </div>
              <div className="quad-value">{q.value}</div>
              {q.sub && <div className="quad-sub" style={{ color: q.subColor || undefined }}>{q.sub}</div>}
            </div>
          ))}
        </div>

        <div className="quick-grid">
          <QuickBtn icon="🎣" label="记渔获" dark onClick={onPublish} />
          <QuickBtn icon={method === 'sea' ? '🌊' : '💧'} label={method === 'sea' ? '潮汐表' : '江河水位'} onClick={() => setWaterSheet(true)} />
          <QuickBtn icon="📖" label="我的图鉴" onClick={onNavigateToProfile} />
          <QuickBtn icon="🐠" label="赛博鱼缸" onClick={onNavigateToProfile} />
          <QuickBtn icon="⊞" label="全部" onClick={onNavigateToCommunity} />
        </div>

        {/* SHOW YOUR TANK 横幅 */}
        <button className="tank-promo" onClick={onNavigateToProfile}>
          <div className="tp-left">
            <div className="tp-kicker">SHOW YOUR TANK</div>
            <div className="tp-title">晒出你的鱼缸</div>
            <div className="tp-sub">按赞领会员</div>
            <span className="tp-cta">去参加 &gt;</span>
          </div>
          <div className="tp-fish">🐟</div>
        </button>

        {/* 附近钓点推荐 */}
        <div className="nearby-head">
          <div className="nearby-title">{method === 'pond' ? '附近钓场推荐' : '附近钓点推荐'}<span className="nearby-en">NEARBY</span></div>
          <button className="nearby-more" onClick={() => onNavigateToMap()}>更多钓点 &gt;</button>
        </div>
        <div className="nearby-list">
          {nearby.map((s) => (
            <button key={s.id} className="spot-row" onClick={() => onNavigateToMap(s)}>
              <div className="spot-thumb" style={{ background: thumbGrad(s.waterType) }}>
                <span>{s.waterType === '黑坑' ? '🎯' : s.waterType === '近海' ? '🌊' : s.waterType === '河流' ? '🏞️' : '🏔️'}</span>
              </div>
              <div className="spot-info">
                <div className="spot-name">{s.name}</div>
                <div className="spot-meta">{(s.city || '').split('·').pop() || '杭州'} · {s.distance?.toFixed?.(1) ?? '--'}km</div>
                {s.fee && <div className={`spot-fee ${s.fee.includes('免费') ? 'free' : ''}`}>{s.fee}</div>}
              </div>
              <div className="spot-rating">★ {rating(s.reliability)}</div>
            </button>
          ))}
          {nearby.length === 0 && <div className="muted" style={{ fontSize: 12, padding: '14px 4px' }}>暂无附近钓点数据</div>}
        </div>

        {/* 今日战报横滚（保留 v1 能力） */}
        <div className="nearby-head" style={{ marginTop: 18 }}>
          <div className="nearby-title">今日战报<span className="nearby-en">LIVE</span></div>
          <button className="nearby-more" onClick={onNavigateToCommunity}>更多 &gt;</button>
        </div>
        <div className="home-hscroll">
          {catches.map((c) => (
            <div key={c.id} className="live-card">
              <div className="live-img">
                {c.imageUrls?.[0]
                  ? <img src={c.imageUrls[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span style={{ fontSize: 26 }}>🐟</span>}
              </div>
              <div className="live-name">{c.fishSpecies || '渔获'}{c.weightKg ? ` ${c.weightKg}kg` : ''}</div>
              <div className="live-meta">{c.nickname} · {timeAgo(c.createdAt)}</div>
            </div>
          ))}
          {catches.length === 0 && <div className="muted" style={{ fontSize: 12, padding: '16px 4px' }}>今天还没有渔获上报</div>}
        </div>

        <p className="home-disclaimer">
          {forecast?.disclaimer || '预测仅供参考，不构成出钓决策保证'} · 请遵守当地禁渔法规，注意出钓安全
        </p>
      </div>

      {/* ===== 各类 Sheet ===== */}
      <Sheet open={spotPicker} title="切换钓点" onClose={() => setSpotPicker(false)}>
        {spots.map((s) => (
          <button key={s.id} className="card" style={{ width: '100%', textAlign: 'left', display: 'block' }}
            onClick={() => { setSpotId(s.id); setSpotPicker(false); }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{s.name}</div>
            <div className="muted" style={{ marginTop: 4, fontSize: 11.5 }}>
              {s.waterType} · 渔获 {s.catchesCount} 条 · {s.fee}
            </div>
          </button>
        ))}
      </Sheet>

      <Sheet open={vipSheet} title="👑 15 天鱼口趋势" onClose={() => setVipSheet(false)}>
        <VipTrend spotId={spotId} species={species} />
      </Sheet>

      <Sheet open={waterSheet} title={method === 'sea' ? '🌊 潮汐表' : '💧 江河水位'} onClose={() => setWaterSheet(false)}>
        {method === 'sea'
          ? <TidePanel date={today} tide={tide} />
          : <WaterPanel cur={cur} forecast={forecast} />}
      </Sheet>

      <Sheet open={noticeSheet} title="🔔 消息通知" onClose={() => setNoticeSheet(false)}>
        <div className="notice-list">
          <div className="notice-item"><span className="ni-ico">🎉</span><div><b>欢迎回来</b><p>今日{methodCfg.label}指数 {score} 分，黄金时段已为你标出</p></div></div>
          <div className="notice-item"><span className="ni-ico">👑</span><div><b>会员权益</b><p>开通会员解锁 15 天趋势与 AI 黄金窗口预测</p></div></div>
          <div className="notice-item"><span className="ni-ico">📖</span><div><b>图鉴进度</b><p>记录渔获即可点亮鱼种图鉴，集齐有惊喜</p></div></div>
        </div>
      </Sheet>
    </div>
  );
}

/** 五圆形入口 */
function QuickBtn({ icon, label, dark, onClick }) {
  return (
    <button className={`quick-btn ${dark ? 'dark' : ''}`} onClick={onClick}>
      <span className="qb-icon">{icon}</span>
      <span className="qb-label">{label}</span>
    </button>
  );
}

/** 潮汐标签（用于四格）：找下一个高潮/低潮时刻 */
function nextTide(tide) {
  if (!tide?.tides?.length) return null;
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const parsed = tide.tides
    .map((t) => ({ ...t, mins: Number(t.time.slice(0, 2)) * 60 + Number(t.time.slice(3, 5)) }))
    .filter((t) => !Number.isNaN(t.mins));
  return parsed.find((t) => t.mins >= nowMins) || parsed[0] || null;
}
function tideLabel(tide) {
  const n = nextTide(tide);
  return n ? n.type : '--';
}
function tideSub(tide) {
  const n = nextTide(tide);
  if (!n) return '';
  return `${n.time} 转${n.type === '高潮' ? '退' : '涨'}`;
}

/** 潮汐表面板 */
function TidePanel({ tide }) {
  if (!tide) return <Spinner />;
  return (
    <div>
      <p className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
        {tide.advice || '半日潮模型推算：每日两涨两退，涨潮初段与落潮末段海钓口最佳。'}
      </p>
      <div className="tide-timeline">
        {tide.tides.map((e, i) => (
          <div key={i} className={`tide-node ${e.type === '高潮' ? 'high' : 'low'}`}>
            <div className="tn-time">{e.time}</div>
            <div className="tn-type">{e.type === '高潮' ? '🌊 高潮' : '🪣 低潮'}</div>
            <div className="tn-height">{e.height?.toFixed ? `${e.height.toFixed(1)}m` : e.height}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 江河水位面板（规则推算：气压下降+降雨→水位上涨） */
function WaterPanel({ cur, forecast }) {
  const rain24 = (forecast?.hourly || []).slice(0, 24).reduce((a, h) => a + (h.precip || 0), 0);
  const pDrop = cur ? 1013 - cur.pressure : 0;
  const level = Math.max(0, Math.min(100, Math.round(52 + rain24 * 2.2 + pDrop * 3)));
  const trendWord = level > 60 ? '上涨' : level < 45 ? '回落' : '平稳';
  return (
    <div>
      <div className="water-level">
        <div className="wl-num">{level}<span>cm</span></div>
        <div className="wl-tag">{trendWord}</div>
      </div>
      <div className="wl-bar"><i style={{ width: `${level}%` }} /></div>
      <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.8, marginTop: 12 }}>
        基于近 24h 降雨量（{rain24.toFixed(1)}mm）与气压变化（{pDrop > 0 ? '-' : '+'}{Math.abs(pDrop).toFixed(1)}hPa）规则推算，仅供参考。
        江河涨水期鱼靠边觅食，水退后 1-2 天口性转稳；持续降雨建议改钓缓流区。
      </p>
    </div>
  );
}

/** VIP 15 天趋势 */
function VipTrend({ spotId, species }) {
  const [trend, setTrend] = useState(null);
  useEffect(() => {
    api.forecast({ spotId, date: todayStr(0), species, days: 15 })
      .then((d) => setTrend(d.dailyTrend))
      .catch(() => setTrend([]));
  }, [spotId, species]);

  if (!trend) return <Spinner />;
  const max = Math.max(...trend.map((t) => t.score), 1);
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 120, padding: '0 2px' }}>
        {trend.map((t) => (
          <div key={t.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 9, color: t.score >= 82 ? 'var(--green)' : 'var(--text-3)' }}>{t.score}</span>
            <div style={{
              width: '100%', borderRadius: 3,
              height: `${(t.score / max) * 78}px`,
              background: t.score >= 82 ? 'var(--green)' : t.score >= 68 ? 'var(--blue)' : 'var(--amber)',
              opacity: t.isVip ? 0.55 : 1,
            }} />
            <span style={{ fontSize: 8.5, color: 'var(--text-3)' }}>{t.date.slice(8)}</span>
            {t.isVip && <span style={{ fontSize: 8.5 }}>👑</span>}
          </div>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 11, lineHeight: 1.7, marginTop: 10 }}>
        会员专享：未来 15 天逐日鱼口趋势，提前锁定适合出竿的时间。今天/明天免费查看。
      </p>
    </div>
  );
}

/* ---------- 工具 ---------- */
function weekdayCn() {
  return ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][new Date().getDay()];
}
function dateEn() {
  const M = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const d = new Date();
  return `${M[d.getMonth()]} ${d.getDate()}`;
}
function thumbGrad(waterType) {
  if (waterType === '黑坑') return 'linear-gradient(135deg,#3d5a80,#293f5c)';
  if (waterType === '近海') return 'linear-gradient(135deg,#1b6ca8,#0d3a5c)';
  if (waterType === '河流') return 'linear-gradient(135deg,#3a7d5c,#1f4a36)';
  return 'linear-gradient(135deg,#2c6e8f,#17384a)';
}
