import React, { useEffect, useRef, useState, useCallback } from 'react';
import { api } from '../api.js';
import { useAuth, useToast } from '../store.jsx';
import { ReliabilityBadge, Sheet, Spinner, Empty } from '../components/ui.jsx';

/* 演示水域边界：杭州 · 千岛湖 */
const BOUNDS = { lngMin: 118.95, lngMax: 119.25, latMin: 29.43, latMax: 29.67 };
const W = 1000;
const H = 760;
const USER = { lng: 119.05, lat: 29.6 };

function project(lng, lat) {
  return [
    ((lng - BOUNDS.lngMin) / (BOUNDS.lngMax - BOUNDS.lngMin)) * W,
    ((BOUNDS.latMax - lat) / (BOUNDS.latMax - BOUNDS.latMin)) * H,
  ];
}

const WATER_TYPES = ['全部', '水库', '河流', '湖泊', '黑坑'];
const SPOT_ICON = { 水库: '🌊', 河流: '🏞️', 湖泊: '💧', 黑坑: '🎯', 近海: '⚓' };

function markerColor(s) {
  if (s.banned) return '#e5534b';
  return s.reliability === 1 ? '#35c48d' : s.reliability === 2 ? '#f0b44c' : '#8aa5b0';
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

  const openDetail = useCallback(async (spot) => {
    setSelected(spot);
    setDetail(null);
    try {
      setDetail(await api.spot(spot.id));
    } catch { /* 详情失败不影响基础信息 */ }
  }, []);

  const filtered = spots.filter((s) => (filter === '全部' || s.waterType === filter) && (!compliance || s.banned));

  /* ---- 拖拽平移（超阈值才捕获指针，避免 pointer capture 吞掉 marker 点击） ---- */
  function onPointerDown(e) {
    suppressClickRef.current = false;
    dragRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y, captured: false };
    longPressRef.current = setTimeout(() => {
      suppressClickRef.current = true;
      showToast('已收藏该位置标记，可在「我的-收藏」查看', 'success');
    }, 650);
  }
  function onPointerMove(e) {
    if (!dragRef.current) return;
    clearTimeout(longPressRef.current);
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    // 移动超过 6px 判定为拖拽：此时才设置指针捕获，保证拖出画布仍顺畅
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
  /** marker 点击：刚拖拽过或刚长按过则忽略（避免误触详情） */
  function onMarkerClick(spot) {
    if (suppressClickRef.current) return;
    openDetail(spot);
  }

  /* ---- 聚合：缩放 >=2 时按网格聚合 ---- */
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

  function navigate(spot) {
    const url = `https://uri.amap.com/navigation?to=${spot.lng},${spot.lat},${encodeURIComponent(spot.name)}&mode=car&policy=1&src=mypage&coordinate=gaode&callnative=1`;
    window.open(url, '_blank');
    showToast('正在调起高德地图导航…');
  }

  async function reportSpot(spot) {
    if (!user) return;
    try {
      await api.report({ targetType: 'spot', targetId: spot.id, reason: '钓点信息有误' });
      showToast('已收到举报，管理员将尽快核实', 'success');
    } catch (e) { showToast(e.message, 'error'); }
  }

  const [ux, uy] = project(USER.lng, USER.lat);

  return (
    <div style={{ position: 'relative', flex: 1, overflow: 'hidden', background: satellite ? '#071a12' : '#0a2f3e' }}>
      {/* 顶部搜索栏 */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30, display: 'flex', gap: 8, alignItems: 'center',
        padding: '12px 12px 0',
      }}>
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(6,32,42,0.92)',
          borderRadius: 10, padding: '9px 12px', fontSize: 12, color: 'var(--text-3)', border: '1px solid var(--line)',
        }}>
          🔍 搜索钓点 / 水域
        </div>
        <button className="map-ctrl" onClick={() => showToast('已切换至当前位置', 'info')}>☰</button>
        <button className="map-ctrl" onClick={() => setLayerOpen(true)}>🛰️ 图层</button>
      </div>

      {/* 水域类型筛选 */}
      <div className="chip-row" style={{ position: 'absolute', top: 52, left: 0, right: 0, zIndex: 25, padding: '0 12px' }}>
        {WATER_TYPES.map((t) => (
          <button key={t} className={`chip ${filter === t ? 'active' : ''}`} onClick={() => setFilter(t)}
            style={{ background: 'rgba(6,32,42,0.9)' }}>{t}</button>
        ))}
      </div>

      {loading && <Spinner />}

      {/* 地图主体 */}
      {!loading && (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{
            width: '100%', height: '100%', display: 'block', touchAction: 'none', cursor: dragRef.current ? 'grabbing' : 'grab',
            filter: satellite ? 'saturate(1.4) hue-rotate(8deg)' : history ? 'grayscale(0.85)' : 'none',
            background: satellite ? '#08251a' : '#0a2f3e',
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <g transform={`translate(${W / 2 + offset.x} ${H / 2 + offset.y}) scale(${scale}) translate(${-W / 2} ${-H / 2})`}>
            <LakeShapes satellite={satellite} />

            {/* 用户定位 */}
            <g transform={`translate(${ux} ${uy})`}>
              <circle r="26" fill="rgba(76,184,232,0.15)" />
              <circle r="9" fill="#4cb8e8" stroke="#04202b" strokeWidth="2.5" />
            </g>

            {/* 钓点 markers */}
            {clusters.map((c, i) =>
              c.type === 'single' ? (
                <g key={c.spot.id} transform={`translate(${project(c.spot.lng, c.spot.lat)[0]} ${project(c.spot.lng, c.spot.lat)[1]})`}
                  style={{ cursor: 'pointer' }} onClick={() => onMarkerClick(c.spot)}>
                  <circle r="17" fill={markerColor(c.spot)} stroke="#04202b" strokeWidth="2.5" opacity={0.95} />
                  <text textAnchor="middle" y="5" fontSize="13">{c.spot.banned ? '🚫' : SPOT_ICON[c.spot.waterType] || '📍'}</text>
                  <text textAnchor="middle" y="30" fontSize="13" fill="#eaf6fa" fontWeight="600" style={{ paintOrder: 'stroke', stroke: '#04202b', strokeWidth: 3 }}>
                    {c.spot.name.length > 8 ? c.spot.name.slice(0, 8) + '…' : c.spot.name}
                  </text>
                </g>
              ) : (
                <g key={i} transform={`translate(${c.x} ${c.y})`} style={{ cursor: 'pointer' }}
                  onClick={() => { if (!suppressClickRef.current) setScale((s) => Math.min(4, s * 1.8)); }}>
                  <circle r="22" fill="rgba(53,196,141,0.25)" stroke="#35c48d" strokeWidth="2" />
                  <text textAnchor="middle" y="5.5" fontSize="16" fill="#eaf6fa" fontWeight="800">{c.spots.length}</text>
                </g>
              )
            )}
          </g>
        </svg>
      )}

      {/* 右侧浮动控件（对齐参考竞品） */}
      <div style={{ position: 'absolute', right: 10, top: 96, zIndex: 30, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <MapBtn icon="✨" label="AI找钓点" onClick={() => showToast('AI 正在分析气压/水温/鱼道…（演示）', 'info')} />
        <MapBtn icon="🧭" label="合规" active={compliance} onClick={() => { setCompliance((v) => !v); showToast(compliance ? '已显示全部钓点' : '仅显示禁钓合规信息', 'info'); }} />
        <MapBtn icon="🛰️" label="卫星" active={satellite} onClick={() => setSatellite((v) => !v)} />
        <MapBtn icon="🕰️" label="历史影像" active={history} onClick={() => setHistory((v) => !v)} />
        <div style={{ display: 'flex', flexDirection: 'column', background: 'rgba(6,32,42,0.92)', borderRadius: 10, border: '1px solid var(--line)' }}>
          <button style={{ padding: '7px 0', fontSize: 15, fontWeight: 700 }} onClick={() => setScale((s) => Math.min(4, s * 1.5))}>＋</button>
          <div style={{ height: 1, background: 'var(--line)' }} />
          <button style={{ padding: '7px 0', fontSize: 15, fontWeight: 700 }} onClick={() => setScale((s) => Math.max(1, s / 1.5))}>－</button>
        </div>
        <MapBtn icon="📍" label="定位" onClick={() => { setScale(1); setOffset({ x: 0, y: 0 }); }} />
      </div>

      {/* 长按提示 */}
      <div style={{
        position: 'absolute', left: '50%', bottom: 96, transform: 'translateX(-50%)', zIndex: 25,
        background: 'rgba(6,32,42,0.9)', borderRadius: 999, padding: '6px 14px', fontSize: 10.5, color: 'var(--text-2)',
        border: '1px solid var(--line)', whiteSpace: 'nowrap',
      }}>
        长按地图收藏标记
      </div>

      {/* 底部统计条（对齐参考竞品：水域/钓点/渔获） */}
      <div style={{
        position: 'absolute', left: 12, right: 12, bottom: 14, zIndex: 30,
        background: 'rgba(6,32,42,0.94)', borderRadius: 14, border: '1px solid var(--line)',
        display: 'flex', padding: '10px 0', backdropFilter: 'blur(10px)',
      }}>
        {[
          ['水域', stats?.waterAreas ?? spots.length, '🌊'],
          ['钓点', stats?.spots ?? spots.length, '📍'],
          ['渔获', stats?.catches ?? 0, '🐟'],
          ['禁钓', stats?.bannedSpots ?? 0, '🚫'],
        ].map(([label, v, icon]) => (
          <div key={label} style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: label === '禁钓' ? 'var(--red)' : 'var(--green)' }}>{icon} {v}</div>
            <div className="muted" style={{ fontSize: 10, marginTop: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {!loading && filtered.length === 0 && <Empty text="当前筛选下暂无钓点" icon="🗺️" />}

      {/* 钓点详情 */}
      <Sheet open={!!selected} onClose={() => setSelected(null)}>
        {selected && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>{SPOT_ICON[selected.waterType]} {selected.name}</h2>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
              {selected.banned
                ? <span className="badge tag-red">🚫 禁钓区域，请勿前往</span>
                : <ReliabilityBadge level={selected.reliability} />}
              <span className="badge tag-blue">{selected.waterType}</span>
              <span className="badge">{selected.fee}</span>
              {selected.distance != null && <span className="badge">{(selected.distance / 1000).toFixed(1)}km</span>}
            </div>

            {selected.banned && (
              <div style={{ background: 'var(--red-dim)', borderRadius: 10, padding: '10px 12px', marginBottom: 12, fontSize: 12, color: '#ffb9b5', lineHeight: 1.6 }}>
                ⚠️ 该水域为禁钓区域（保护区/禁渔期）。请遵守《渔业法》及当地规定，选择其他钓点。
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
              <InfoCell label="水深参考" value={selected.depthRef} />
              <InfoCell label="渔获动态" value={`${selected.catchesCount} 条`} />
              <InfoCell label="经度" value={Number(selected.lng).toFixed(5)} />
              <InfoCell label="纬度" value={Number(selected.lat).toFixed(5)} />
            </div>

            <div style={{ marginBottom: 12 }}>
              <div className="field-label">鱼种标签</div>
              <div>{(selected.fishSpecies || []).map((f) => <span key={f} className="tag tag-green">{f}</span>)}</div>
            </div>

            <div className="muted" style={{ fontSize: 11, marginBottom: 14 }}>
              数据更新于 {new Date(selected.updatedAt).toLocaleString('zh-CN')} · UGC 上报 + 人工审核 + 交叉验证
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => navigate(selected)}>🧭 一键导航</button>
              {!selected.banned && (
                <button className="btn btn-ghost" style={{ flex: 1 }}
                  onClick={() => { setSelected(null); onNavigateToCommunity({ spotId: selected.id, spotName: selected.name }); }}>
                  🐟 这里钓到了什么
                </button>
              )}
            </div>

            <button className="btn btn-ghost btn-block" style={{ marginTop: 8, fontSize: 12, color: 'var(--text-3)' }}
              onClick={() => reportSpot(selected)}>举报该钓点信息有误</button>

            {detail?.recentCatches?.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div className="field-label">最近渔获</div>
                <div className="hscroll" style={{ margin: 0, padding: 0 }}>
                  {detail.recentCatches.map((c) => (
                    <div key={c.id} style={{ width: 120, flexShrink: 0 }}>
                      <div style={{ width: 120, height: 84, borderRadius: 10, overflow: 'hidden', background: 'var(--bg-elevated)', marginBottom: 4 }}>
                        {c.imageUrls?.[0]
                          ? <img src={c.imageUrls[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : <div className="empty" style={{ padding: '24px 0', fontSize: 20 }}>🐟</div>}
                      </div>
                      <div style={{ fontSize: 12 }}>{c.fishSpecies || '渔获'}</div>
                      <div className="muted" style={{ fontSize: 10.5 }}>{c.nickname}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Sheet>

      {/* 图层选择 */}
      <Sheet open={layerOpen} title="🛰️ 地图图层" onClose={() => setLayerOpen(false)}>
        {[
          ['标准地图', !satellite && !history, () => { setSatellite(false); setHistory(false); }],
          ['卫星影像', satellite, () => { setSatellite(true); setHistory(false); }],
          ['历史影像', history, () => { setHistory(true); setSatellite(false); }],
          ['合规视图（禁钓区）', compliance, () => setCompliance((v) => !v)],
        ].map(([label, active, fn]) => (
          <button key={label} className="card" style={{ width: '100%', textAlign: 'left', display: 'block', padding: 12 }}
            onClick={() => { fn(); setLayerOpen(false); }}>
            <span style={{ fontSize: 13.5, fontWeight: 700 }}>{active ? '✅ ' : '⚪ '}{label}</span>
          </button>
        ))}
      </Sheet>
    </div>
  );
}

function MapBtn({ icon, label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      width: 44, background: active ? 'var(--green-dim)' : 'rgba(6,32,42,0.92)', borderRadius: 10,
      border: `1px solid ${active ? 'var(--green)' : 'var(--line)'}`, padding: '7px 0 5px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
    }}>
      <span style={{ fontSize: 15 }}>{icon}</span>
      <span style={{ fontSize: 8.5, color: active ? 'var(--green)' : 'var(--text-2)' }}>{label}</span>
    </button>
  );
}

function InfoCell({ label, value }) {
  return (
    <div style={{ background: 'rgba(4,24,33,0.45)', borderRadius: 10, padding: '8px 10px' }}>
      <div className="muted" style={{ fontSize: 10.5 }}>{label}</div>
      <div style={{ fontSize: 13.5, fontWeight: 700, marginTop: 2 }}>{value}</div>
    </div>
  );
}

/** 水域底图（示意） */
function LakeShapes({ satellite }) {
  const water = satellite ? '#0d4a2f' : '#0e4d6e';
  return (
    <g>
      {/* 千岛湖主湖面 */}
      <path
        d="M400 110 C520 80, 680 100, 745 175 C805 245, 780 370, 715 445 C650 520, 510 545, 430 500 C350 455, 310 340, 335 250 C352 185, 370 138, 400 110 Z"
        fill={water} stroke="rgba(120,200,220,0.35)" strokeWidth="2.5"
      />
      {/* 东南湖区 */}
      <path
        d="M760 320 C820 300, 880 330, 890 390 C900 450, 850 490, 790 480 C735 470, 715 410, 730 365 C740 340, 748 328, 760 320 Z"
        fill={water} stroke="rgba(120,200,220,0.3)" strokeWidth="2"
      />
      {/* 新安江河流 */}
      <path d="M150 60 C200 130, 190 200, 240 250 C285 295, 300 350, 350 400" fill="none"
        stroke={water} strokeWidth="16" strokeLinecap="round" opacity="0.85" />
      {/* 汾口河湾 */}
      <path d="M430 560 C470 590, 520 600, 570 640" fill="none"
        stroke={water} strokeWidth="12" strokeLinecap="round" opacity="0.85" />
      {/* 黑坑池 */}
      <rect x="405" y="555" width="46" height="34" rx="6" fill="#125a7d" stroke="rgba(120,200,220,0.3)" strokeWidth="1.5" />
      <rect x="272" y="358" width="52" height="38" rx="6" fill="#125a7d" stroke="rgba(120,200,220,0.3)" strokeWidth="1.5" />
      {/* 网格纹理 */}
      {Array.from({ length: 9 }, (_, i) => (
        <line key={'v' + i} x1={i * 125} y1="0" x2={i * 125} y2={H} stroke="rgba(120,200,220,0.05)" strokeWidth="1" />
      ))}
      {Array.from({ length: 7 }, (_, i) => (
        <line key={'h' + i} x1="0" y1={i * 127} x2={W} y2={i * 127} stroke="rgba(120,200,220,0.05)" strokeWidth="1" />
      ))}
      <text x="30" y="45" fill="rgba(169,200,212,0.5)" fontSize="22" fontWeight="700">千岛湖 · 示意水域图</text>
    </g>
  );
}
