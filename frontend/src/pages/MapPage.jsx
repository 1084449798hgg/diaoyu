import React, { useEffect, useRef, useState, useCallback } from 'react';
import { api } from '../api.js';
import { useAuth, useToast } from '../store.jsx';
import { ReliabilityBadge, Sheet, Spinner, Empty } from '../components/ui.jsx';
import Icon from '../components/icons.jsx';
import { wgs84ToGcj02, wgs84ToBd09 } from '../utils/geo.js';

/* 演示水域边界：杭州 · 千岛湖 */
const BOUNDS = { lngMin: 118.95, lngMax: 119.25, latMin: 29.43, latMax: 29.67 };
const W = 430;
const H = 930;
const USER = { lng: 119.05, lat: 29.6 };

function project(lng, lat) {
  return [
    ((lng - BOUNDS.lngMin) / (BOUNDS.lngMax - BOUNDS.lngMin)) * W,
    ((BOUNDS.latMax - lat) / (BOUNDS.latMax - BOUNDS.latMin)) * H,
  ];
}

const WATER_TYPES = ['全部', '水库', '河流', '湖泊', '黑坑'];

function markerColor(s) {
  if (s.banned) return '#ff6a18';
  return s.reliability === 1 ? '#d8f84f' : s.reliability === 2 ? '#e9f7a8' : '#ffffff';
}

export default function MapPage({ onNavigateToCommunity }) {
  const showToast = useToast();
  const { user } = useAuth();
  const [spots, setSpots] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('全部');
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [satellite, setSatellite] = useState(false);
  const [history, setHistory] = useState(false);
  const [compliance, setCompliance] = useState(false);
  const [layerOpen, setLayerOpen] = useState(false);
  const [hint, setHint] = useState(true);
  const [userLoc, setUserLoc] = useState(USER);
  const [locStatus, setLocStatus] = useState('idle');
  const [navSpot, setNavSpot] = useState(null);
  const dragRef = useRef(null);
  const longPressRef = useRef(null);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const [spotsData, statsData] = await Promise.all([
          api.spots({ lng: USER.lng, lat: USER.lat, radius: 40000 }),
          api.spotStats().catch(() => null),
        ]);
        setSpots(spotsData.spots);
        setStats(statsData);
        const focus = window.__pendingSpotFocus;
        if (focus) {
          const s = spotsData.spots.find((x) => x.id === focus.id);
          if (s) openDetail(s);
          window.__pendingSpotFocus = null;
        }
      } catch (e) {
        showToast(e.message, 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, [showToast]);

  // 获取手机当前位置（GPS / WGS-84）：成功则刷新附近钓点距离，失败回退默认坐标
  useEffect(() => {
    if (!('geolocation' in navigator)) { setLocStatus('unsupported'); return; }
    setLocStatus('loading');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const ll = { lng: pos.coords.longitude, lat: pos.coords.latitude };
        setUserLoc(ll); setLocStatus('ok');
        try {
          const [sd, st] = await Promise.all([
            api.spots({ lng: ll.lng, lat: ll.lat, radius: 40000 }),
            api.spotStats().catch(() => null),
          ]);
          setSpots(sd.spots); setStats(st);
        } catch (_) { /* 保留初始结果 */ }
      },
      (err) => { setLocStatus(err?.code === 1 ? 'denied' : 'error'); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setHint(false), 4200);
    return () => clearTimeout(t);
  }, []);

  const openDetail = useCallback(async (spot) => {
    setSelected(spot);
    setDetail(null);
    try {
      setDetail(await api.spot(spot.id));
    } catch { /* 详情失败不影响基础信息 */ }
  }, []);

  const filtered = spots.filter((s) => (filter === '全部' || s.waterType === filter) && (!compliance || s.banned));

  function onPointerDown(e) {
    suppressClickRef.current = false;
    dragRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y, captured: false };
    longPressRef.current = setTimeout(() => {
      suppressClickRef.current = true;
      showToast('已收藏该位置标记', 'success');
    }, 650);
  }
  function onPointerMove(e) {
    if (!dragRef.current) return;
    clearTimeout(longPressRef.current);
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    if (!dragRef.current.captured && Math.hypot(dx, dy) > 6) {
      dragRef.current.captured = true;
      suppressClickRef.current = true;
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* 忽略 */ }
    }
    if (dragRef.current.captured) {
      setOffset({ x: dragRef.current.ox + dx * 0.6, y: dragRef.current.oy + dy * 0.6 });
    }
  }
  function onPointerUp() {
    dragRef.current = null;
    clearTimeout(longPressRef.current);
  }
  function onMarkerClick(spot) {
    if (suppressClickRef.current) return;
    openDetail(spot);
  }

  const clusters = React.useMemo(() => {
    if (scale < 2) return filtered.map((s) => ({ type: 'single', spot: s }));
    const grid = {};
    const cell = 110 / scale;
    for (const s of filtered) {
      const [x, y] = project(s.lng, s.lat);
      const key = `${Math.floor(x / cell)}_${Math.floor(y / cell)}`;
      if (!grid[key]) grid[key] = { type: 'cluster', x: 0, y: 0, spots: [] };
      grid[key].spots.push(s);
      grid[key].x += x / grid[key].spots.length;
      grid[key].y += y / grid[key].spots.length;
    }
    return Object.values(grid).map((c) =>
      c.spots.length === 1 ? { type: 'single', spot: c.spots[0] } : { ...c, x: c.x / c.spots.length, y: c.y / c.spots.length }
    );
  }, [filtered, scale]);

  // —— 导航：起点=当前定位，终点=钓点，按目标地图坐标系转换后唤起对应 App ——
  const NAV_ITEMS = [
    { key: 'amap', name: '高德地图', desc: '驾车导航 · 实时路况', color: '#1B9CFF' },
    { key: 'baidu', name: '百度地图', desc: '驾车导航 · 智能路线', color: '#2932E1' },
    { key: 'tencent', name: '腾讯地图', desc: '驾车导航 · 精准到达', color: '#12B7F5' },
  ];
  function conv(lng, lat, provider) {
    return provider === 'baidu' ? wgs84ToBd09(lng, lat) : wgs84ToGcj02(lng, lat);
  }
  function buildNavUrl(spot, provider) {
    const f = conv(userLoc.lng, userLoc.lat, provider);
    const t = conv(Number(spot.lng), Number(spot.lat), provider);
    const enc = encodeURIComponent;
    if (provider === 'amap') {
      return `https://uri.amap.com/navigation?from=${f.lng},${f.lat},${enc('我的位置')}&to=${t.lng},${t.lat},${enc(spot.name)}&mode=car&policy=1&src=fishing&coordinate=gaode&callnative=1`;
    }
    if (provider === 'baidu') {
      // 百度：坐标格式 lat,lng；coord_type=bd09ll
      return `https://api.map.baidu.com/direction?origin=${f.lat},${f.lng}&destination=${t.lat},${t.lng}&mode=driving&region=${enc(spot.city || '杭州')}&output=html&coord_type=bd09ll&src=fishing`;
    }
    // 腾讯：坐标格式 lat,lng（GCJ-02），需 referer
    return `https://apis.map.qq.com/uri/v1/routeplan?type=drive&from=${enc('我的位置')}&fromcoord=${f.lat},${f.lng}&to=${enc(spot.name)}&tocoord=${t.lat},${t.lng}&referer=fishingapp`;
  }
  function goNav(provider) {
    const spot = navSpot; if (!spot) return;
    const item = NAV_ITEMS.find((x) => x.key === provider);
    showToast(`正在调起${item?.name || '地图'}…`, 'success');
    setNavSpot(null);
    window.location.href = buildNavUrl(spot, provider);
  }
  function openNav(spot) { setNavSpot(spot); }
  function locateMe() {
    if (!('geolocation' in navigator)) { showToast('当前环境不支持定位', 'error'); return; }
    setLocStatus('loading');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const ll = { lng: pos.coords.longitude, lat: pos.coords.latitude };
        setUserLoc(ll); setLocStatus('ok');
        api.spots({ lng: ll.lng, lat: ll.lat, radius: 40000 }).then((d) => setSpots(d.spots)).catch(() => {});
        showToast('已定位到当前位置', 'success');
      },
      (err) => { setLocStatus(err?.code === 1 ? 'denied' : 'error'); showToast('定位失败，已使用默认位置', 'error'); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
    setScale(1); setOffset({ x: 0, y: 0 });
  }

  async function reportSpot(spot) {
    if (!user) return;
    try {
      await api.report({ targetType: 'spot', targetId: spot.id, reason: '钓点信息有误' });
      showToast('已收到举报，管理员将尽快核实', 'success');
    } catch (e) { showToast(e.message, 'error'); }
  }

  const [ux, uy] = project(userLoc.lng, userLoc.lat);

  return (
    <div style={{ position: 'relative', flex: 1, overflow: 'hidden', background: satellite ? '#07160f' : '#0b1512' }}>
      {/* 顶部搜索胶囊 */}
      <div className="mp-search">
        <span className="mp-brand">钓鱼佬</span>
        <div className="mp-search-line">
          <Icon name="search" size={13} strokeWidth={2} />
          搜水库、钓点
        </div>
        <button className="mp-star" onClick={() => showToast('已收藏 3 个钓点', 'info')}>
          <Icon name="star" size={15} />
        </button>
      </div>

      {/* 水域筛选 */}
      <div style={{ position: 'absolute', top: 68, left: 0, right: 0, zIndex: 25, display: 'flex', gap: 6, padding: '0 12px', overflowX: 'auto', scrollbarWidth: 'none' }}>
        {WATER_TYPES.map((t) => (
          <button key={t} onClick={() => setFilter(t)}
            style={{
              flexShrink: 0, height: 30, padding: '0 13px', borderRadius: 999, fontSize: 10.5, fontWeight: 600,
              background: filter === t ? 'var(--lime)' : 'rgba(255,255,255,.9)', color: filter === t ? 'var(--forest)' : 'var(--ink-2)',
              backdropFilter: 'blur(10px)', boxShadow: '0 4px 14px rgba(0,0,0,.16)',
            }}>{t}</button>
        ))}
      </div>

      {loading && <Spinner />}

      {/* 地图 */}
      {!loading && (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="xMidYMid meet"
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', touchAction: 'none',
            cursor: dragRef.current ? 'grabbing' : 'grab',
            filter: satellite ? 'saturate(1.15) hue-rotate(-6deg)' : history ? 'grayscale(.9)' : 'none',
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <g transform={`translate(${W / 2 + offset.x} ${H / 2 + offset.y + 26}) scale(${scale}) translate(${-W / 2} ${-H / 2})`}>
            <LakeShapes satellite={satellite} />

            {/* 用户定位 */}
            <g transform={`translate(${ux} ${uy})`}>
              <circle r="30" fill="rgba(216,248,79,.14)" />
              <circle r="26" fill="none" stroke="rgba(216,248,79,.35)" strokeWidth="1.2" />
              <circle r="7" fill="#d8f84f" stroke="#0b1512" strokeWidth="3" />
            </g>

            {/* markers */}
            {clusters.map((c, i) =>
              c.type === 'single' ? (
                <g key={c.spot.id} transform={`translate(${project(c.spot.lng, c.spot.lat)[0]} ${project(c.spot.lng, c.spot.lat)[1]})`}
                  style={{ cursor: 'pointer' }} onClick={() => onMarkerClick(c.spot)}>
                  <ellipse cx="0" cy="2" rx="9" ry="3.4" fill="rgba(0,0,0,.32)" />
                  <path
                    d="M0 0 C-10 -12 -17 -20 -17 -28 A17 17 0 1 1 17 -28 C17 -20 10 -12 0 0 Z"
                    fill={markerColor(c.spot)} stroke="rgba(11,21,18,.55)" strokeWidth="1.6"
                  />
                  <text textAnchor="middle" y="-23" fontSize="12.5" fontWeight="800"
                    fill={c.spot.banned ? '#fff' : '#1a2a12'}>
                    {c.spot.banned ? '!' : i + 1}
                  </text>
                </g>
              ) : (
                <g key={i} transform={`translate(${c.x} ${c.y})`} style={{ cursor: 'pointer' }}
                  onClick={() => { if (!suppressClickRef.current) setScale((s) => Math.min(4, s * 1.8)); }}>
                  <circle r="21" fill="rgba(216,248,79,.9)" stroke="rgba(11,21,18,.4)" strokeWidth="2" />
                  <text textAnchor="middle" y="5" fontSize="13" fill="#1a2a12" fontWeight="800">{c.spots.length}</text>
                </g>
              )
            )}
          </g>
        </svg>
      )}

      {/* 右侧控件 */}
      <div className="mp-side">
        <button className="mp-ctrl" onClick={() => showToast('地图图层已展开', 'info')}>
          <Icon name="layers" size={17} /><span>图层</span>
        </button>
        <button className={`mp-ctrl ${compliance ? 'on' : ''}`} onClick={() => { setCompliance((v) => !v); showToast(compliance ? '已显示全部钓点' : '仅显示禁钓合规信息', 'info'); }}>
          <Icon name="shield" size={17} /><span>合规</span>
        </button>
        <button className={`mp-ctrl ${history ? 'on' : ''}`} onClick={() => setHistory((v) => !v)}>
          <Icon name="clock" size={17} /><span>历史</span>
        </button>
        <button className={`mp-ctrl ${satellite ? 'on' : ''}`} onClick={() => setSatellite((v) => !v)}>
          <Icon name="satellite" size={17} /><span>卫星</span>
        </button>
        <div className="mp-zoom">
          <button onClick={() => setScale((s) => Math.min(4, s * 1.5))}>＋</button>
          <i />
          <button onClick={() => setScale((s) => Math.max(1, s / 1.5))}>－</button>
        </div>
        <button className={`mp-ctrl ${locStatus === 'ok' ? 'on' : ''}`} onClick={locateMe}>
          <Icon name="locate" size={17} /><span>定位</span>
        </button>
      </div>

      {/* 长按提示 */}
      {hint && (
        <div className="mp-toast" style={{ animation: 'hx-rise .4s ease both' }}>
          长按地图也能收藏标记
        </div>
      )}

      {/* AI 找钓点 */}
      <button className="mp-ai" onClick={() => showToast('AI 正在分析气压 / 水温 / 鱼道…（演示）', 'info')}>
        <span className="mp-ai-orb"><Icon name="sparkle" size={16} color="#2a3a10" strokeWidth={2} /></span>
        <b>AI 找钓点<em>AI SPOT</em></b>
      </button>

      {/* 底部统计 */}
      <div className="mp-stats">
        {[
          ['水域', stats?.waterAreas ?? spots.length, 'WATERS'],
          ['钓点', stats?.spots ?? spots.length, 'SPOTS'],
          ['渔获', stats?.catches ?? 0, 'CATCHES'],
        ].map(([k, v, en]) => (
          <div key={k} className="mp-stat">
            <b>{v}</b>
            <span>{k} <span style={{ opacity: .55 }}>{en}</span></span>
            <i />
          </div>
        ))}
      </div>

      {!loading && filtered.length === 0 && <Empty text="当前筛选下暂无钓点" icon="🗺️" />}

      {/* 钓点详情 */}
      <Sheet open={!!selected} onClose={() => setSelected(null)}>
        {selected && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <h2 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontSize: 19, fontWeight: 900, letterSpacing: '.04em' }}>{selected.name}</h2>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
              {selected.banned
                ? <span className="p-pill" style={{ background: 'var(--orange-soft)', color: '#a33c00', borderColor: 'transparent' }}>禁钓区域</span>
                : <ReliabilityBadge level={selected.reliability} />}
              <span className="p-pill p-pill-line">{selected.waterType}</span>
              <span className="p-pill p-pill-line">{selected.fee}</span>
              {selected.distance != null && <span className="p-pill p-pill-line">{(selected.distance / 1000).toFixed(1)}km</span>}
            </div>

            {selected.banned && (
              <div style={{ background: 'var(--orange-soft)', borderRadius: 13, padding: '11px 13px', marginBottom: 14, fontSize: 11, color: '#a33c00', lineHeight: 1.7 }}>
                该水域为禁钓区域（保护区/禁渔期）。请遵守《渔业法》及当地规定，选择其他钓点。
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
              <InfoCell label="水深参考" value={selected.depthRef} />
              <InfoCell label="渔获动态" value={`${selected.catchesCount} 条`} />
              <InfoCell label="经度" value={Number(selected.lng).toFixed(5)} />
              <InfoCell label="纬度" value={Number(selected.lat).toFixed(5)} />
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 9.5, color: 'var(--ink-3)', marginBottom: 6, letterSpacing: '.06em' }}>鱼种标签</div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {(selected.fishSpecies || []).map((f) => <span key={f} className="p-pill p-pill-line">{f}</span>)}
              </div>
            </div>

            <div style={{ fontSize: 9.5, color: 'var(--ink-3)', marginBottom: 16 }}>
              数据更新于 {new Date(selected.updatedAt).toLocaleString('zh-CN')} · UGC 上报 + 人工审核 + 交叉验证
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="p-btn p-btn-dark" style={{ flex: 1 }} onClick={() => openNav(selected)}>
                <Icon name="locate" size={14} /> 导航前往
              </button>
              {!selected.banned && (
                <button className="p-btn p-btn-ghost" style={{ flex: 1 }}
                  onClick={() => { setSelected(null); onNavigateToCommunity({ spotId: selected.id, spotName: selected.name }); }}>
                  <Icon name="fish" size={14} /> 看渔获
                </button>
              )}
            </div>

            <button style={{ width: '100%', marginTop: 10, fontSize: 10.5, color: 'var(--ink-3)', padding: '8px 0' }}
              onClick={() => reportSpot(selected)}>举报该钓点信息有误</button>

            {detail?.recentCatches?.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 9.5, color: 'var(--ink-3)', marginBottom: 8, letterSpacing: '.06em' }}>最近渔获</div>
                <div style={{ display: 'flex', gap: 9, overflowX: 'auto', paddingBottom: 4 }}>
                  {detail.recentCatches.map((c) => (
                    <div key={c.id} style={{ width: 116, flexShrink: 0 }}>
                      <div style={{ width: 116, height: 82, borderRadius: 12, overflow: 'hidden', background: 'var(--surface-2)', marginBottom: 6 }}>
                        {c.imageUrls?.[0]
                          ? <img src={c.imageUrls[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-3)' }}><Icon name="fish" size={22} /></div>}
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 700 }}>{c.fishSpecies || '渔获'}</div>
                      <div style={{ fontSize: 9, color: 'var(--ink-3)' }}>{c.nickname}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Sheet>

      {/* 导航选择：高德 / 百度 / 腾讯 */}
      <Sheet open={!!navSpot} onClose={() => setNavSpot(null)}>
        {navSpot && (
          <div>
            <h2 style={{ margin: '0 0 2px', fontFamily: 'var(--font-serif)', fontSize: 18, fontWeight: 900, letterSpacing: '.04em' }}>导航前往</h2>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 14 }}>
              {navSpot.name} · {navSpot.distance != null ? (navSpot.distance / 1000).toFixed(1) + 'km' : '附近'}
              {locStatus === 'ok' ? ' · 已用当前定位' : ' · 默认起点'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {NAV_ITEMS.map((it) => (
                <button key={it.key} onClick={() => goNav(it.key)}
                  style={{ display: 'flex', alignItems: 'center', gap: 13, width: '100%', padding: '14px 15px', borderRadius: 16, background: 'var(--surface-2)', border: '1px solid var(--hair)', textAlign: 'left' }}>
                  <span style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, background: it.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 800, boxShadow: `0 6px 16px ${it.color}55` }}>{it.name[0]}</span>
                  <span style={{ flex: 1 }}>
                    <b style={{ fontSize: 13.5, fontWeight: 800, display: 'block' }}>{it.name}</b>
                    <span style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{it.desc}</span>
                  </span>
                  <Icon name="right" size={16} strokeWidth={2} style={{ color: 'var(--ink-3)' }} />
                </button>
              ))}
            </div>
            <div style={{ marginTop: 14, fontSize: 10, color: 'var(--ink-3)', textAlign: 'center', lineHeight: 1.6 }}>
              将以您的当前定位为起点，唤起对应地图 App 导航<br />（未授权定位时将使用默认起点）
            </div>
          </div>
        )}
      </Sheet>

      {/* 图层 */}
      <Sheet open={layerOpen} title="地图图层" onClose={() => setLayerOpen(false)}>
        {[
          ['标准地图', !satellite && !history, () => { setSatellite(false); setHistory(false); }],
          ['卫星影像', satellite, () => { setSatellite(true); setHistory(false); }],
          ['历史影像', history, () => { setHistory(true); setSatellite(false); }],
          ['合规视图（禁钓区）', compliance, () => setCompliance((v) => !v)],
        ].map(([label, active, fn]) => (
          <button key={label} onClick={() => { fn(); setLayerOpen(false); }}
            style={{
              width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10,
              padding: '14px 15px', marginBottom: 8, borderRadius: 14,
              background: active ? 'var(--lime-soft)' : 'var(--surface-2)',
              border: `1px solid ${active ? '#dcecab' : 'transparent'}`,
            }}>
            <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700 }}>{label}</span>
            {active && <Icon name="check" size={15} color="#4d7c3a" strokeWidth={2.4} />}
          </button>
        ))}
      </Sheet>
    </div>
  );
}

function InfoCell({ label, value }) {
  return (
    <div style={{ background: 'var(--surface-2)', borderRadius: 13, padding: '9px 11px' }}>
      <div style={{ fontSize: 9, color: 'var(--ink-3)' }}>{label}</div>
      <div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 3, fontFamily: 'var(--font-num)', letterSpacing: '-.02em' }}>{value}</div>
    </div>
  );
}

/** 水域底图（竖屏 430×930，深墨绿 + 青绿水域） */
function LakeShapes({ satellite }) {
  const water = satellite ? '#15492f' : '#12453a';
  const deep = satellite ? '#0f3a26' : '#0d3830';
  const edge = 'rgba(216,248,79,.2)';
  return (
    <g>
      <rect x="0" y="0" width={W} height={H} fill={satellite ? '#08170f' : '#0b1512'} />

      {/* 主湖面 */}
      <path
        d="M245 196c58-10 104 26 108 96 4 78-26 148-92 168-62 19-108-14-116-88-8-72 22-164 100-176z"
        fill={water} stroke={edge} strokeWidth="1.8"
      />
      {/* 湖心深水 */}
      <path
        d="M252 262c40-6 68 20 68 62 0 46-24 86-64 92-38 6-62-18-62-60 0-44 20-88 58-94z"
        fill={deep} opacity=".75"
      />
      {/* 东南湖湾 */}
      <path
        d="M322 630c30-10 56 8 58 40 2 34-20 60-50 62-30 1-48-20-44-48 3-24 12-46 36-54z"
        fill={water} stroke={edge} strokeWidth="1.4"
      />
      {/* 新安江 */}
      <path d="M28 96c34 46 42 92 78 132 20 22 34 40 42 62" fill="none"
        stroke={water} strokeWidth="13" strokeLinecap="round" opacity=".92" />
      <path d="M28 96c34 46 42 92 78 132 20 22 34 40 42 62" fill="none"
        stroke="rgba(150,220,200,.26)" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="5 10" />
      {/* 汾口河湾 */}
      <path d="M168 748c34 32 66 42 104 62" fill="none" stroke={water} strokeWidth="10" strokeLinecap="round" opacity=".9" />
      {/* 黑坑池 */}
      <rect x="316" y="322" width="40" height="30" rx="7" fill="#17564a" stroke={edge} strokeWidth="1.2" />
      <rect x="140" y="560" width="44" height="32" rx="7" fill="#17564a" stroke={edge} strokeWidth="1.2" />

      {/* 网格 / 等高线 */}
      {Array.from({ length: 8 }, (_, i) => (
        <line key={'v' + i} x1={i * 62} y1="0" x2={i * 62} y2={H} stroke="rgba(255,255,255,.035)" strokeWidth="1" />
      ))}
      {Array.from({ length: 16 }, (_, i) => (
        <line key={'h' + i} x1="0" y1={i * 60} x2={W} y2={i * 60} stroke="rgba(255,255,255,.035)" strokeWidth="1" />
      ))}
      <path d="M0 690c60-26 96-14 140 6s84 14 130-6" fill="none" stroke="rgba(216,248,79,.1)" strokeWidth="1.3" />
      <path d="M0 812c54-20 92-8 134 12s86 12 126-8" fill="none" stroke="rgba(216,248,79,.08)" strokeWidth="1.3" />

      <text x="22" y="34" fill="rgba(255,255,255,.26)" fontSize="10" fontWeight="700" letterSpacing="2.5">千岛湖 · 示意水域</text>
    </g>
  );
}
