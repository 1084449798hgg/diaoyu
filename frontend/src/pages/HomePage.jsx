import React, { useEffect, useMemo, useState } from 'react';
import { api, todayStr } from '../api.js';
import { useToast } from '../store.jsx';
import { Sheet, Spinner } from '../components/ui.jsx';
import Icon from '../components/icons.jsx';
import FishArt from '../components/fishArt.jsx';

/**
 * 首页 v4：深墨绿 hero（品牌 / 四钓法 / 大评分 / 黄金段）
 * + 浅色面板（四格指标 / 五入口 / 最新渔获双列 / 本地热门鱼种 / TANK / 附近钓点）
 */

const METHODS = [
  { key: 'freshwater', label: '台钓', en: 'FLOAT', cat: 'freshwater', defaultSpecies: '鲫鱼' },
  { key: 'lure', label: '路亚', en: 'LURE', cat: 'freshwater', defaultSpecies: '翘嘴' },
  { key: 'sea', label: '海钓', en: 'SEA', cat: 'sea', defaultSpecies: '鲈鱼' },
  { key: 'pond', label: '钓场', en: 'POND', cat: 'freshwater', defaultSpecies: '鲫鱼' },
];

function scoreTitle(score) {
  if (score >= 78) return '极佳';
  if (score >= 68) return '良好';
  if (score >= 52) return '一般';
  return '鱼口冷';
}

function windLevel(ms) {
  if (ms < 1.6) return '0';
  if (ms < 3.4) return '1';
  if (ms < 5.5) return '2';
  if (ms < 8.0) return '3';
  if (ms < 10.8) return '4';
  if (ms < 13.9) return '5';
  return '6';
}

function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))}分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
  return `${Math.floor(diff / 86400)}天前`;
}

const hh = (h) => String(h).padStart(2, '0');

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
  segs.forEach((s) => {
    const seg = hourly.filter((h) => h.hour >= s.startH && h.hour < s.endH);
    s.avg = Math.round(seg.reduce((a, b) => a + b.score, 0) / Math.max(1, seg.length));
  });
  return segs.sort((a, b) => b.avg - a.avg).slice(0, maxSegs);
}

/** 鱼种卡浅色底 */
function lightPalette(species = '') {
  if (/鲤|鲫/.test(species)) return { a: '#f0f1e9', b: '#dde4d5', ink: '#8d9a83' };
  if (/翘嘴|白条|鲌/.test(species)) return { a: '#edf1f2', b: '#d8e2e6', ink: '#7d959b' };
  if (/草鱼|青鱼|鳊/.test(species)) return { a: '#eef2e7', b: '#d9e4cd', ink: '#7f9169' };
  return { a: '#f1f0ea', b: '#dfddd2', ink: '#8c8778' };
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
  const [waterSheet, setWaterSheet] = useState(false);
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
        setForecast(await api.forecast({ spotId, date: today, species, days: 15 }));
      } catch (e) { showToast(e.message, 'error'); }
      finally { setLoading(false); }
    })();
  }, [spotId, species, today, showToast]);

  useEffect(() => {
    api.catches({ page: 1, pageSize: 8 }).then((d) => setCatches(d.items)).catch(() => {});
  }, []);

  useEffect(() => {
    if (method !== 'sea') return;
    api.tide(today).then(setTide).catch(() => setTide(null));
  }, [method, today]);

  const speciesOptions = useMemo(
    () => speciesList.filter((s) => s.category === methodCfg.cat),
    [speciesList, methodCfg]
  );

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

  const nearby = useMemo(() => {
    const list = [...spots];
    if (method === 'pond') {
      list.sort((a, b) => (b.waterType === '黑坑' ? 1 : 0) - (a.waterType === '黑坑' ? 1 : 0));
    }
    return list.filter((s) => s.distance != null).sort((a, b) => a.distance - b.distance).slice(0, 4);
  }, [spots, method]);

  const hotSpecies = useMemo(() => {
    const list = speciesList.filter((s) => s.category === 'freshwater');
    const order = ['鲫鱼', '翘嘴', '白条', '鲤鱼', '草鱼', '鳊鱼'];
    const picked = order.map((n) => list.find((s) => s.species === n)).filter(Boolean);
    const rest = list.filter((s) => !picked.includes(s));
    return [...picked, ...rest].slice(0, 3);
  }, [speciesList]);

  const rating = (r) => (r === 1 ? '5.0' : r === 2 ? '4.8' : '4.5');

  const quad = (() => {
    if (!cur) return [];
    const windCell = { icon: 'wind', label: '风力', value: windLevel(cur.windSpeed), unit: '级', sub: `${cur.windDir}风 ${Math.round(cur.windSpeed)}m/s` };
    const pressureCell = { icon: 'gauge', label: '气压', value: `${Math.round(cur.pressure)}`, unit: 'hPa', sub: `${pDelta >= 0 ? '↑' : '↓'} ${Math.abs(pDelta)} hPa`, subColor: pDelta >= 0 ? '#c2410c' : '#3f7d3a' };
    const tempCell = { icon: 'thermo', label: '气温', value: `${Math.round(cur.temp)}`, unit: '℃', sub: `体感 ${Math.round(cur.temp - 1)}℃` };
    const waterCell = { icon: 'water', label: '水温', value: `${cur.waterTemp?.toFixed?.(1) ?? '--'}`, unit: '℃', sub: `${wDelta >= 0 ? '↑' : '↓'} ${Math.abs(wDelta)}℃`, subColor: wDelta >= 0 ? '#c2410c' : '#3f7d3a' };
    const o2Cell = { icon: 'drop', label: '溶氧', value: cur.dissolvedOxygen?.toFixed?.(1) ?? '--', unit: 'mg/L', sub: '光合估算' };
    if (method === 'sea') return [windCell, { icon: 'water', label: '浪高', value: '0.4', unit: 'm', sub: '近岸平稳' }, { icon: 'clock', label: '潮汐', value: tideLabel(tide), unit: '', sub: tideSub(tide) }, waterCell];
    if (method === 'lure') return [waterCell, windCell, pressureCell, o2Cell];
    if (method === 'pond') return [tempCell, windCell, pressureCell, waterCell];
    return [tempCell, windCell, pressureCell, waterCell];
  })();

  if (loading && !forecast) return <div className="page hx-home"><Spinner /></div>;

  return (
    <div className="page hx-home">
      {/* ---------- Hero ---------- */}
      <div className="hx-hero">
        <div className="hx-top">
          <div style={{ minWidth: 0 }}>
            <div className="hx-brand">钓鱼佬<sup>ANGLER</sup></div>
            <button className="hx-loc" onClick={() => setSpotPicker(true)} style={{ maxWidth: 210 }}>
              <Icon name="pin" size={11} strokeWidth={1.8} />
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{spot?.city || '杭州市'} · {spot?.name || '千岛湖'}</span>
            </button>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ textAlign: 'right', marginRight: 2, marginTop: 3 }}>
            <div className="p-eyebrow" style={{ color: 'rgba(255,255,255,.42)' }}>{weekdayEn()}</div>
            <div style={{ fontFamily: 'var(--font-num)', fontSize: 11, color: 'rgba(255,255,255,.7)', marginTop: 2, letterSpacing: '.04em' }}>{dateEn()}</div>
          </div>
          <button className="hx-icon-btn" onClick={() => setNoticeSheet(true)} aria-label="通知">
            <Icon name="bell" size={17} />
          </button>
        </div>

        <div className="hx-method">
          {METHODS.map((m) => (
            <button key={m.key} className={`hx-method-item ${method === m.key ? 'active' : ''}`} onClick={() => setMethod(m.key)}>
              <span className="m-cn">{m.label}</span>
              <span className="m-en">{m.en}</span>
              {method === m.key && <i />}
            </button>
          ))}
        </div>

        <div className="hx-score">
          <div className="hx-score-num">{score}<span>/100</span></div>
          <div className="hx-score-side">
            <div className="hx-level"><i className="hx-level-dot" />{scoreTitle(score)}</div>
            <div className="hx-score-sub">城市实时{methodCfg.label}指数 · {spot?.name?.slice(0, 6) || '千岛湖'}</div>
          </div>
        </div>

        <p className="hx-advice">{forecast?.advice || '正在解析今日钓况…'}</p>

        <div className="hx-golden">
          <span className="hx-golden-label">GOLDEN</span>
          {segments.length > 0
            ? segments.map((s) => <span key={s.startH} className="hx-golden-pill">{hh(s.startH)}:00 – {hh(s.endH)}:00</span>)
            : <span className="hx-golden-pill">--</span>}
          <button className="hx-vip-mini" onClick={() => setVipSheet(true)}>
            <Icon name="gem" size={11} /> 15天
          </button>
        </div>
      </div>

      {/* ---------- 浅色面板 ---------- */}
      <div className="hx-panel">
        <div className="hx-panel-inner">
          <div className="hx-quad">
            {quad.map((q) => (
              <div key={q.label} className="hx-quad-cell">
                <div className="hx-quad-label">
                  <Icon name={q.icon} size={11} strokeWidth={1.9} />
                  {q.label}
                </div>
                <div className="hx-quad-value">{q.value}<small>{q.unit}</small></div>
                {q.sub && <div className="hx-quad-sub" style={{ color: q.subColor }}>{q.sub}</div>}
              </div>
            ))}
          </div>

          <div className="hx-quick">
            <QuickBtn icon="camera" label="记渔获" dark onClick={onPublish} />
            <QuickBtn icon="water" label={method === 'sea' ? '潮汐表' : '江河水位'} onClick={() => setWaterSheet(true)} />
            <QuickBtn icon="book" label="我的图鉴" onClick={onNavigateToProfile} />
            <QuickBtn icon="tank" label="赛博鱼缸" onClick={onNavigateToProfile} />
            <QuickBtn icon="filter" label="全部" onClick={onNavigateToCommunity} />
          </div>

          {/* 最新渔获 */}
          <div className="p-sec-head" style={{ marginTop: 20 }}>
            <div className="p-sec-title">最新渔获 <em>LATEST</em></div>
            <button className="p-more" onClick={onNavigateToCommunity}>更多渔获 <Icon name="right" size={11} /></button>
          </div>
          <div className="catch-grid">
            {catches.slice(0, 4).map((c, idx) => (
              <article key={c.id} className="catch-card" onClick={onNavigateToCommunity}>
                <FishArt species={c.fishSpecies} height={126} seed={idx}>
                  <div className="catch-user">
                    <span className="catch-avatar">{(c.nickname || '钓')[0]}</span>
                    {c.nickname || '钓友'}
                  </div>
                  <div className="catch-likes">
                    <Icon name="heart" size={9} strokeWidth={2} />{c.likesCount ?? 0}
                  </div>
                </FishArt>
                <div className="catch-body">
                  <div className="catch-line">
                    <span className="catch-name">{c.fishSpecies || '渔获'}</span>
                    {c.weightKg != null && <span className="catch-weight">{c.weightKg}<small>kg</small></span>}
                  </div>
                  <div className="catch-meta">
                    <Icon name="clock" size={9} strokeWidth={2} />{timeAgo(c.createdAt)}
                    <span style={{ opacity: .5 }}>·</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.spotName || '千岛湖'}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>

          {/* 本地热门鱼种 */}
          <div className="p-sec-head" style={{ marginTop: 20 }}>
            <div className="p-sec-title">本地热门鱼种 <em>杭州市</em></div>
            <button className="p-more" onClick={onNavigateToProfile}>鱼种百科 <Icon name="right" size={11} /></button>
          </div>
          <div className="species-strip">
            {hotSpecies.map((s) => (
              <button key={s.species} className="species-card" onClick={onNavigateToProfile}>
                <div className="species-art" style={{ background: `linear-gradient(160deg, ${lightPalette(s.species).a}, ${lightPalette(s.species).b})` }}>
                  <svg viewBox="0 0 120 58" width="100%" style={{ opacity: .92 }}>
                    <path d="M22 30c16-15 36-18 51-12 5 2.4 10 5.6 13 9-3 3.4-8 6.6-13 9-15 6-35 3-51-12z" fill={lightPalette(s.species).ink} />
                    <path d="M22 30 12 40 12 20z" fill={lightPalette(s.species).ink} />
                    <circle cx="64" cy="26" r="2.1" fill="#fff" opacity=".9" />
                    <path d="M40 21c6-3.4 13-4.4 19-3.4M40 39c6 3.4 13 4.4 19 3.4" stroke="#fff" strokeWidth="1.1" opacity=".45" fill="none" />
                  </svg>
                </div>
                <div className="species-name">{s.species}<em>{s.emoji}</em></div>
              </button>
            ))}
          </div>

          {/* TANK 横幅 */}
          <button className="hx-tank" onClick={onNavigateToProfile}>
            <span className="hx-sheen" />
            <div className="hx-tank-kicker">SHOW YOUR TANK</div>
            <div className="hx-tank-title">晒出你的鱼缸</div>
            <div className="hx-tank-sub">按赞领会员 · 记录每一次出钓</div>
            <span className="hx-tank-cta">去参加 <Icon name="right" size={11} /></span>
            <div className="hx-tank-fish"><Icon name="fish" size={46} strokeWidth={1.1} color="rgba(216,248,79,.55)" /></div>
          </button>

          {/* 附近钓点 */}
          <div className="p-sec-head" style={{ marginTop: 20 }}>
            <div className="p-sec-title">{method === 'pond' ? '附近钓场' : '附近钓点'} <em>NEARBY</em></div>
            <button className="p-more" onClick={() => onNavigateToMap()}>更多钓点 <Icon name="right" size={11} /></button>
          </div>
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--r-lg)', border: '1px solid var(--hair)', boxShadow: 'var(--shadow-card)', overflow: 'hidden' }}>
            {nearby.map((s, i) => (
              <button key={s.id} onClick={() => onNavigateToMap(s)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', textAlign: 'left', borderBottom: i === nearby.length - 1 ? 'none' : '1px solid #f2f4ee' }}>
                <div style={{ width: 42, height: 42, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-2)', color: 'var(--ink-2)' }}>
                  <Icon name="pin" size={18} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div>
                  <div style={{ fontSize: 9.5, color: 'var(--ink-3)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                    {s.waterType}
                    <span style={{ opacity: .5 }}>·</span>
                    {s.distance ? (s.distance / 1000).toFixed(1) : '--'}km
                    <span style={{ opacity: .5 }}>·</span>
                    <span style={{ color: s.fee?.includes('免费') ? '#4d7c3a' : '#a35322' }}>{s.fee}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 10.5, fontWeight: 700, color: 'var(--ink)' }}>
                  <Icon name="star" size={10} fill="var(--lime-deep)" color="var(--lime-deep)" />{rating(s.reliability)}
                </div>
              </button>
            ))}
            {nearby.length === 0 && <div style={{ padding: '18px 14px', fontSize: 11, color: 'var(--ink-3)' }}>暂无附近钓点数据</div>}
          </div>

          <p style={{ fontSize: 9.5, color: 'var(--ink-3)', lineHeight: 1.8, textAlign: 'center', margin: '18px 0 4px' }}>
            {forecast?.disclaimer || '预测仅供参考，不构成出钓决策保证'} · 请遵守当地禁渔法规
          </p>
        </div>
      </div>

      {/* ---------- Sheets ---------- */}
      <Sheet open={spotPicker} title="切换钓点" onClose={() => setSpotPicker(false)}>
        {spots.map((s) => (
          <button key={s.id} className="p-card" style={{ width: '100%', textAlign: 'left', display: 'block' }}
            onClick={() => { setSpotId(s.id); setSpotPicker(false); }}>
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>{s.name}</div>
            <div style={{ marginTop: 4, fontSize: 10.5, color: 'var(--ink-3)' }}>
              {s.waterType} · 渔获 {s.catchesCount} 条 · {s.fee}
            </div>
          </button>
        ))}
      </Sheet>

      <Sheet open={vipSheet} title="15 天鱼口趋势" onClose={() => setVipSheet(false)}>
        <VipTrend spotId={spotId} species={species} />
      </Sheet>

      <Sheet open={waterSheet} title={method === 'sea' ? '潮汐表' : '江河水位'} onClose={() => setWaterSheet(false)}>
        {method === 'sea' ? <TidePanel tide={tide} /> : <WaterPanel cur={cur} forecast={forecast} />}
      </Sheet>

      <Sheet open={noticeSheet} title="消息" onClose={() => setNoticeSheet(false)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            ['sparkle', '欢迎回来', `今日${methodCfg.label}指数 ${score} 分，黄金时段已为你标出`],
            ['gem', '会员权益', '开通会员解锁 15 天趋势与 AI 黄金窗口预测'],
            ['book', '图鉴进度', '记录渔获即可点亮鱼种图鉴，集齐有惊喜'],
          ].map(([ic, t, d]) => (
            <div key={t} style={{ display: 'flex', gap: 11, padding: '13px 14px', background: 'var(--surface-2)', borderRadius: 14 }}>
              <Icon name={ic} size={17} style={{ marginTop: 1 }} />
              <div>
                <b style={{ fontSize: 12.5 }}>{t}</b>
                <p style={{ margin: '3px 0 0', fontSize: 10.5, color: 'var(--ink-3)', lineHeight: 1.6 }}>{d}</p>
              </div>
            </div>
          ))}
        </div>
      </Sheet>
    </div>
  );
}

function QuickBtn({ icon, label, dark, onClick }) {
  return (
    <button className={`hx-quick-btn ${dark ? 'dark' : ''}`} onClick={onClick}>
      <span className="hx-quick-ico"><Icon name={icon} size={19} strokeWidth={1.75} /></span>
      <span className="hx-quick-lab">{label}</span>
    </button>
  );
}

function nextTide(tide) {
  if (!tide?.tides?.length) return null;
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const parsed = tide.tides
    .map((t) => ({ ...t, mins: Number(t.time.slice(0, 2)) * 60 + Number(t.time.slice(3, 5)) }))
    .filter((t) => !Number.isNaN(t.mins));
  return parsed.find((t) => t.mins >= nowMins) || parsed[0] || null;
}
const tideLabel = (tide) => nextTide(tide)?.type || '--';
const tideSub = (tide) => {
  const n = nextTide(tide);
  return n ? `${n.time} 转${n.type === '高潮' ? '退' : '涨'}` : '';
};

function TidePanel({ tide }) {
  if (!tide) return <Spinner />;
  return (
    <div>
      <p style={{ fontSize: 11, color: 'var(--ink-2)', lineHeight: 1.8, marginBottom: 14 }}>
        {tide.advice || '半日潮模型推算：每日两涨两退，涨潮初段与落潮末段海钓口最佳。'}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 7 }}>
        {tide.tides.map((e, i) => (
          <div key={i} style={{
            borderRadius: 13, padding: '12px 4px', textAlign: 'center',
            background: e.type === '高潮' ? 'var(--lime-soft)' : 'var(--surface-2)',
            border: `1px solid ${e.type === '高潮' ? '#dcecab' : 'var(--hair)'}`,
          }}>
            <div style={{ fontFamily: 'var(--font-num)', fontSize: 14, fontWeight: 800 }}>{e.time}</div>
            <div style={{ fontSize: 9.5, color: 'var(--ink-3)', marginTop: 3 }}>{e.type}</div>
            <div style={{ fontSize: 9.5, color: 'var(--ink-2)', marginTop: 2 }}>{e.height?.toFixed ? `${e.height.toFixed(1)}m` : e.height}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function WaterPanel({ cur, forecast }) {
  const rain24 = (forecast?.hourly || []).slice(0, 24).reduce((a, h) => a + (h.precip || 0), 0);
  const pDrop = cur ? 1013 - cur.pressure : 0;
  const level = Math.max(0, Math.min(100, Math.round(52 + rain24 * 2.2 + pDrop * 3)));
  const trendWord = level > 60 ? '上涨' : level < 45 ? '回落' : '平稳';
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <div className="p-display" style={{ fontSize: 44 }}>{level}<span style={{ fontSize: 14, color: 'var(--ink-3)', marginLeft: 3 }}>cm</span></div>
        <div className="p-pill p-pill-lime">{trendWord}</div>
      </div>
      <div style={{ height: 8, borderRadius: 5, background: 'var(--surface-2)', marginTop: 14, overflow: 'hidden' }}>
        <div style={{ width: `${level}%`, height: '100%', borderRadius: 5, background: 'linear-gradient(90deg, var(--lime-deep), #6fbf8e)' }} />
      </div>
      <p style={{ fontSize: 10.5, color: 'var(--ink-3)', lineHeight: 1.85, marginTop: 14 }}>
        基于近 24h 降雨量（{rain24.toFixed(1)}mm）与气压变化（{pDrop > 0 ? '-' : '+'}{Math.abs(pDrop).toFixed(1)}hPa）规则推算，仅供参考。
        江河涨水期鱼靠边觅食，水退后 1-2 天口性转稳；持续降雨建议改钓缓流区。
      </p>
    </div>
  );
}

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
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 130, padding: '0 2px' }}>
        {trend.map((t) => (
          <div key={t.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <span style={{ fontFamily: 'var(--font-num)', fontSize: 9, color: t.score >= 82 ? 'var(--ink)' : 'var(--ink-3)' }}>{t.score}</span>
            <div style={{
              width: '100%', borderRadius: 4, height: `${(t.score / max) * 84}px`,
              background: t.score >= 82 ? 'var(--lime-deep)' : t.score >= 68 ? '#b7d478' : '#dfe3d5',
              opacity: t.isVip ? 0.6 : 1,
            }} />
            <span style={{ fontSize: 8, color: 'var(--ink-3)' }}>{t.date.slice(8)}</span>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 10.5, color: 'var(--ink-3)', lineHeight: 1.8, marginTop: 12 }}>
        会员专享：未来 15 天逐日鱼口趋势，提前锁定适合出竿的时间。今天/明天免费查看。
      </p>
    </div>
  );
}

/* ---------- 工具 ---------- */
function weekdayEn() {
  return ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][new Date().getDay()];
}
function dateEn() {
  const M = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const d = new Date();
  return `${M[d.getMonth()]} ${String(d.getDate()).padStart(2, '0')}`;
}
