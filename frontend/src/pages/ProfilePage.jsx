import React, { useEffect, useState, useCallback } from 'react';
import { api, todayStr } from '../api.js';
import { useAuth, useToast } from '../store.jsx';
import { Empty, Spinner, Sheet, Segmented } from '../components/ui.jsx';
import Icon from '../components/icons.jsx';

const USER_LNG = 119.05;
const USER_LAT = 29.6;

/** 赛博鱼缸里游动的鱼 */
function TankFish({ fish }) {
  const size = fish.weightKg ? Math.min(34, 14 + fish.weightKg * 5) : 18;
  const dur = 6 + (fish.id % 5);
  return (
    <div key={fish.id} style={{
      position: 'absolute', bottom: `${8 + (fish.id * 13) % 46}%`,
      animation: `swim ${dur}s linear ${fish.id * 0.7}s infinite`,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
    }}>
      <span style={{ fontSize: size, filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.35))' }}>
        {fish.weightKg && fish.weightKg >= 2 ? '🐟' : '🐠'}
      </span>
      <span style={{
        fontSize: 8, color: '#17392a', marginTop: 1, fontWeight: 700, whiteSpace: 'nowrap',
        background: 'rgba(255,255,255,.7)', borderRadius: 4, padding: '1px 5px',
      }}>
        {fish.species}{fish.weightKg ? ` ${fish.weightKg}kg` : ''}
      </span>
    </div>
  );
}

export default function ProfilePage({ onPublish }) {
  const showToast = useToast();
  const { user: authUser, logout } = useAuth();
  const [me, setMe] = useState(null);
  const [enc, setEnc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('logs');
  const [logs, setLogs] = useState([]);
  const [logStats, setLogStats] = useState(null);
  const [spots, setSpots] = useState([]);
  const [editing, setEditing] = useState(false);
  const [encOpen, setEncOpen] = useState(false);
  const [vipOpen, setVipOpen] = useState(false);
  const [form, setForm] = useState({ fishDate: todayStr(0), spotId: '', bait: '', fishSpecies: '', fishCount: '', content: '', visibility: 'private' });

  const loadMe = useCallback(async () => {
    setLoading(true);
    try {
      const [meData, encData] = await Promise.all([api.me(), api.encyclopedia().catch(() => null)]);
      setMe(meData);
      setEnc(encData);
    } catch (e) { showToast(e.message, 'error'); }
    finally { setLoading(false); }
  }, [showToast]);

  const loadLogs = useCallback(async () => {
    try {
      const [data, st] = await Promise.all([
        api.logs({ scope: tab }),
        tab === 'logs' ? api.logStats().catch(() => null) : Promise.resolve(null),
      ]);
      setLogs(data.items);
      setLogStats(st);
    } catch (e) { showToast(e.message, 'error'); }
  }, [tab, showToast]);

  useEffect(() => { loadMe(); }, [loadMe]);
  useEffect(() => { loadLogs(); }, [loadLogs]);
  useEffect(() => {
    api.spots({ lng: USER_LNG, lat: USER_LAT, radius: 40000 })
      .then((d) => setSpots(d.spots.filter((s) => !s.banned)))
      .catch(() => {});
  }, []);

  async function submitLog() {
    if (!form.fishDate) return showToast('请选择出钓日期', 'error');
    try {
      await api.addLog({
        spotId: form.spotId ? Number(form.spotId) : null,
        fishDate: form.fishDate,
        bait: form.bait || null,
        fishSpecies: form.fishSpecies || null,
        fishCount: form.fishCount ? Number(form.fishCount) : 0,
        content: form.content || null,
        visibility: form.visibility,
      });
      showToast('日志已保存（已附带天气快照）', 'success');
      setEditing(false);
      setForm({ ...form, content: '', fishCount: '', fishSpecies: '', bait: '' });
      loadLogs();
      loadMe();
    } catch (e) { showToast(e.message, 'error'); }
  }

  async function activateVip() {
    try {
      await api.activateVip('yearly');
      showToast('会员开通成功，已解锁 15 天鱼口趋势', 'success');
      loadMe();
    } catch (e) { showToast(e.message, 'error'); }
  }

  if (loading && !me) return <div className="page"><Spinner /></div>;
  if (!me) return null;

  const s = me.stats;
  const encPct = s.encyclopediaTotal ? Math.round((s.encyclopediaUnlocked / s.encyclopediaTotal) * 100) : 0;
  const lv = Math.min(9, 1 + Math.floor(s.catchCount / 3));
  const dexCells = (enc?.items || []).filter((i) => i.unlocked).slice(0, 4);

  return (
    <div className="page hx-home" style={{ padding: '0 16px calc(var(--tabbar-h) + 26px)' }}>
      {/* ---------- 深色头图 ---------- */}
      <div className="me-hero">
        <div className="me-topbar">
          <button className="me-signin" onClick={() => showToast('今日已签到，+5 鱼石', 'success')}>
            <Icon name="calendar" size={13} /> 签到
          </button>
          <div style={{ flex: 1 }} />
          <button className="hx-icon-btn" onClick={() => showToast('暂无新通知', 'info')} style={{ position: 'relative' }}>
            <Icon name="message" size={16} />
            <i style={{ position: 'absolute', top: 7, right: 8, width: 6, height: 6, borderRadius: 3, background: 'var(--lime)' }} />
          </button>
          <button className="hx-icon-btn" onClick={() => showToast('设置（演示）', 'info')}>
            <Icon name="gear" size={16} />
          </button>
        </div>

        <div className="me-id">
          <div className="me-ava">
            <div className="me-ava-in">
              <Icon name="fish" size={34} color="rgba(216,248,79,.9)" strokeWidth={1.3} />
            </div>
            <div className="me-lv">LV.{lv}</div>
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="me-name">{me.nickname}</div>
            <div className="me-tagline"><Icon name="sparkle" size={9} />{me.isVip ? '临渊羡鱼 · 会员' : '临渊羡鱼'}</div>
          </div>
          <div className="me-nums">
            {[['关注', s.followingCount], ['粉丝', s.fansCount], ['鱼石', me.points]].map(([k, v]) => (
              <div key={k} className="me-num"><b>{v}</b><span>{k}</span></div>
            ))}
          </div>
        </div>
      </div>

      {/* ---------- 浅色面板 ---------- */}
      <div className="me-panel">
        <div className="me-panel-inner">
          {/* VIP */}
          <button className="vip-dark" style={{ width: '100%', textAlign: 'left' }} onClick={() => (me.isVip ? setVipOpen(true) : activateVip())}>
            <div className="vip-dark-head">
              <span className="vip-word">VIP</span>
              <b>会员中心</b>
            </div>
            <p>解锁 15 天鱼口指数 · 免广告 · AI 鱼情解读 · 逐小时出钓建议</p>
            <div className="vip-chips">
              {['15天趋势', '鱼情早知道', '逐小时鱼口', '鱼种推荐'].map((t) => <span key={t} className="vip-chip">{t}</span>)}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,.38)', letterSpacing: '.06em' }}>{me.isVip ? '已开通 · 有效期至次年' : '新用户首年 · 限时'}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 800, color: me.isVip ? 'rgba(216,248,79,.9)' : 'var(--forest)', background: me.isVip ? 'transparent' : 'var(--lime)', border: me.isVip ? '1px solid rgba(216,248,79,.35)' : 'none', borderRadius: 999, padding: '6px 13px' }}>
                {me.isVip ? '查看 15 天趋势' : '立即开通'} <Icon name="right" size={10} />
              </span>
            </div>
          </button>

          {/* 钓鱼档案 FISH DEX */}
          <div className="vip-dark" style={{ background: 'linear-gradient(130deg,#16261e 0%,#0d1a15 62%,#0b1410 100%)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
              <span style={{ fontFamily: 'var(--font-serif)', fontSize: 15, fontWeight: 900, letterSpacing: '.08em', color: '#fff' }}>钓鱼档案</span>
              <span className="p-eyebrow" style={{ color: 'rgba(255,255,255,.35)', letterSpacing: '.2em' }}>FISH DEX</span>
              <span style={{ background: 'var(--lime)', color: 'var(--forest)', fontSize: 8, fontWeight: 800, borderRadius: 4, padding: '2px 5px', letterSpacing: '.04em' }}>LV.{lv}</span>
              <div style={{ flex: 1 }} />
              <button onClick={() => setEncOpen(true)} style={{ fontSize: 9.5, color: 'rgba(255,255,255,.5)' }}>全部 <Icon name="right" size={9} /></button>
            </div>

            <div className="dex-wrap">
              <div className="dex-grid">
                <button className="dex-cell add" onClick={onPublish}>
                  <Icon name="plus" size={16} strokeWidth={2} />
                  <span className="dx-lab">拍一条点亮</span>
                </button>
                {Array.from({ length: 4 }).map((_, i) => {
                  const it = dexCells[i];
                  if (it) {
                    return (
                      <div key={i} className="dex-cell on">
                        <span className="dx-ico">{it.emoji}</span>
                        <span className="dx-lab" style={{ color: '#5b7024' }}>{it.species}</span>
                      </div>
                    );
                  }
                  return (
                    <div key={i} className="dex-cell">
                      <Icon name="fish" size={15} color="rgba(255,255,255,.32)" />
                      <span className="dx-lab" style={{ color: 'rgba(255,255,255,.42)' }}>未点亮</span>
                    </div>
                  );
                })}
                <button className="dex-cell" style={{ background: 'rgba(216,248,79,.1)', borderColor: 'rgba(216,248,79,.2)' }} onClick={() => setEncOpen(true)}>
                  <span style={{ fontFamily: 'var(--font-num)', fontSize: 15, fontWeight: 800, color: 'var(--lime)' }}>+{s.encyclopediaTotal}</span>
                  <span className="dx-lab" style={{ color: 'rgba(216,248,79,.65)' }}>图鉴</span>
                </button>
              </div>
              <div className="dex-tank" onClick={() => showToast(`${me.fishTank.length} 条鱼在缸里游动`, 'info')}>
                <span className="dex-tank-num">{me.fishTank.length}</span>
                <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
                  {me.fishTank.slice(0, 3).map((f, i) => (
                    <span key={f.id} style={{
                      position: 'absolute', left: `${16 + i * 27}%`, top: `${20 + i * 21}%`,
                      transform: `rotate(${-10 + i * 8}deg)`, display: 'block',
                    }}>
                      <Icon name="fish" size={12 + i * 3} color="rgba(18,46,32,.42)" strokeWidth={1.6} />
                    </span>
                  ))}
                  {me.fishTank.length === 0 && (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="tank" size={26} color="rgba(20,50,35,.45)" />
                    </div>
                  )}
                </div>
                <span className="dex-tank-lab">TANK</span>
              </div>
            </div>

            <div className="dex-stat-row">
              {[
                ['累计渔获', s.catchCount],
                ['本月出钓', `${s.monthFishDays}天`],
                ['最大记录', s.maxCatch ? `${s.maxCatch.weightKg}kg` : '—'],
              ].map(([k, v]) => (
                <div key={k} className="dex-stat">
                  <b style={{ color: '#fff' }}>{v}</b>
                  <span style={{ color: 'rgba(255,255,255,.35)' }}>{k}</span>
                </div>
              ))}
            </div>

            <button className="p-btn p-btn-lime p-btn-block" style={{ marginTop: 13 }} onClick={onPublish}>
              <Icon name="camera" size={15} /> 拍一条入缸 · 点亮第 {s.encyclopediaUnlocked + 1} 种
            </button>
          </div>

          {/* 我的战绩 */}
          <div className="p-sec-head" style={{ marginTop: 18 }}>
            <div className="p-sec-title">我的战绩 <em>RECORD</em></div>
            <button className="p-more" onClick={() => setEncOpen(true)}>图鉴 {encPct}% <Icon name="right" size={11} /></button>
          </div>
          <div className="me-grid4">
            {[
              ['累计渔获', s.catchCount, '尾'],
              ['图鉴进度', `${s.encyclopediaUnlocked}/${s.encyclopediaTotal}`, ''],
              ['最大单尾', s.maxCatch ? s.maxCatch.weightKg : '—', s.maxCatch ? 'kg' : ''],
              ['本月出钓', s.monthFishDays, '天'],
            ].map(([k, v, u]) => (
              <div key={k} className="me-cell">
                <div className="mc-k">{k}</div>
                <div className="mc-v">{v}<small>{u}</small></div>
              </div>
            ))}
          </div>

          {/* 赛博鱼缸 */}
          <div className="p-sec-head" style={{ marginTop: 18 }}>
            <div className="p-sec-title">赛博鱼缸 <em>TANK</em></div>
            <span style={{ fontSize: 9.5, color: 'var(--ink-3)' }}>{me.fishTank.length} 条在游</span>
          </div>
          <div style={{
            height: 132, borderRadius: 'var(--r-lg)', position: 'relative', overflow: 'hidden',
            background: 'linear-gradient(170deg, #d7ead0 0%, #a9cdb4 52%, #79ae92 100%)',
            border: '1px solid var(--hair)', boxShadow: 'var(--shadow-card)',
          }}>
            <div style={{ position: 'absolute', left: '-10%', right: '-10%', bottom: '-14%', height: '52%', borderRadius: '50% 50% 0 0', background: 'rgba(255,255,255,.24)' }} />
            {me.fishTank.map((f) => <TankFish key={f.id} fish={f} />)}
            {me.fishTank.length === 0 && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Icon name="tank" size={28} color="rgba(20,50,35,.4)" />
                <span style={{ fontSize: 10, color: 'rgba(20,50,35,.55)' }}>鱼缸空空的，记录第一尾渔获吧</span>
              </div>
            )}
            <span style={{ position: 'absolute', left: 12, bottom: 4, fontSize: 20, opacity: .65 }}>🌿</span>
            <span style={{ position: 'absolute', right: 18, bottom: 4, fontSize: 24, opacity: .6 }}>🌿</span>
          </div>

          {/* 出钓日志 */}
          <div className="p-sec-head" style={{ marginTop: 18 }}>
            <div className="p-sec-title">出钓日志 <em>LOG</em></div>
            <button className="p-more" onClick={() => setEditing(true)}><Icon name="plus" size={11} /> 记一笔</button>
          </div>
          <div style={{ marginBottom: 12 }}>
            <Segmented
              options={[{ value: 'logs', label: '我的日志' }, { value: 'public', label: '钓友公开' }]}
              value={tab} onChange={setTab}
            />
          </div>

          {tab === 'logs' && logStats && (
            <div className="me-grid4" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 10 }}>
              {[['出钓次数', logStats.trips], ['总渔获', `${logStats.totalFish}尾`], ['足迹钓点', logStats.spots]].map(([k, v]) => (
                <div key={k} className="me-cell" style={{ textAlign: 'center' }}>
                  <div className="mc-v" style={{ fontSize: 16 }}>{v}</div>
                  <div className="mc-k" style={{ marginTop: 2 }}>{k}</div>
                </div>
              ))}
            </div>
          )}

          {logs.length === 0 && <Empty text="还没有日志，记下第一条吧" icon="📖" />}
          {logs.map((l) => (
            <div key={l.id} className="p-card" style={{ padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700 }}>
                  {l.fishSpecies || '出钓记录'}
                  {l.fishCount > 0 && <span style={{ fontSize: 10.5, color: '#4d7c3a', marginLeft: 6, fontWeight: 700 }}>× {l.fishCount}</span>}
                </div>
                <span className="p-pill p-pill-line" style={{ height: 20, fontSize: 8.5 }}>{l.visibility === 'public' ? '公开' : '私密'}</span>
              </div>
              <div style={{ fontSize: 9.5, color: 'var(--ink-3)', lineHeight: 1.7 }}>
                {l.fishDate} · {l.spotName || '未关联钓点'} · {l.bait || '未记录饵料'}
              </div>
              {l.weatherSnapshot && Object.keys(l.weatherSnapshot).length > 0 && (
                <div style={{
                  marginTop: 8, background: 'var(--surface-2)', borderRadius: 10, padding: '8px 10px',
                  display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 9.5, color: 'var(--ink-2)',
                }}>
                  <span>{l.weatherSnapshot.temp}℃</span>
                  <span>{l.weatherSnapshot.pressure}hPa</span>
                  <span>{l.weatherSnapshot.windDir}风 {l.weatherSnapshot.windSpeed}m/s</span>
                  <span>{l.weatherSnapshot.precip}mm/h</span>
                </div>
              )}
              {l.content && <p style={{ margin: '8px 0 0', fontSize: 11.5, lineHeight: 1.7, color: 'var(--ink-2)' }}>{l.content}</p>}
            </div>
          ))}

          {/* 更多服务 */}
          <div className="p-sec-head" style={{ marginTop: 18 }}>
            <div className="p-sec-title">更多服务 <em>MORE</em></div>
          </div>
          <div className="more-list">
            {[
              ['shield', '安全与合规', '隐私政策 · UGC 机审 · 禁钓提醒'],
              ['doc', '预测免责说明', '鱼情预测仅供参考'],
              ['phone', '桌面小组件', '实时显示今日鱼口'],
              ['logout', '退出登录', ''],
            ].map(([ic, t, sub]) => (
              <button key={t} className="more-row" style={{ width: '100%', textAlign: 'left' }}
                onClick={() => {
                  if (t === '退出登录') { logout(); showToast('已退出登录', 'info'); }
                  else if (t === '桌面小组件') showToast('已添加到桌面（演示）', 'success');
                  else showToast(t, 'info');
                }}>
                <span className="more-ico"><Icon name={ic} size={15} /></span>
                <span className="more-lab">{t}</span>
                {sub && <span className="more-sub">{sub}</span>}
                <Icon name="right" size={13} color="var(--ink-3)" />
              </button>
            ))}
          </div>

          <p style={{ textAlign: 'center', fontSize: 9, color: 'var(--ink-3)', margin: '16px 0 6px', lineHeight: 1.7 }}>
            鱼情预报 v4.0 · 鱼情预报 + 钓点地图 + 渔获社区 + 鱼种图鉴
          </p>
        </div>
      </div>

      {/* ---------- Sheets ---------- */}
      <Sheet open={editing} title="记一笔出钓日志" onClose={() => setEditing(false)}>
        <div className="field">
          <label className="field-label">出钓日期</label>
          <input className="input" type="date" value={form.fishDate} onChange={(e) => setForm({ ...form, fishDate: e.target.value })} />
        </div>
        <div className="field">
          <label className="field-label">钓点</label>
          <select className="input" value={form.spotId} onChange={(e) => setForm({ ...form, spotId: e.target.value })}>
            <option value="">未关联钓点</option>
            {spots.map((sp) => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div className="field" style={{ flex: 1 }}>
            <label className="field-label">目标鱼种</label>
            <input className="input" placeholder="如：鲫鱼" value={form.fishSpecies} onChange={(e) => setForm({ ...form, fishSpecies: e.target.value })} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label className="field-label">渔获数量</label>
            <input className="input" type="number" min="0" placeholder="0" value={form.fishCount} onChange={(e) => setForm({ ...form, fishCount: e.target.value })} />
          </div>
        </div>
        <div className="field">
          <label className="field-label">饵料</label>
          <input className="input" placeholder="如：蚯蚓 + 酒米" value={form.bait} onChange={(e) => setForm({ ...form, bait: e.target.value })} />
        </div>
        <div className="field">
          <label className="field-label">备注</label>
          <textarea className="input" placeholder="天气感受、鱼口情况、钓位心得…" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
        </div>
        <div className="field">
          <label className="field-label">可见范围</label>
          <Segmented
            options={[{ value: 'private', label: '仅自己可见' }, { value: 'public', label: '公开给钓友' }]}
            value={form.visibility} onChange={(v) => setForm({ ...form, visibility: v })}
          />
        </div>
        <p style={{ fontSize: 10, color: 'var(--ink-3)', lineHeight: 1.7 }}>保存时自动附带当日天气快照，为模型校准积累「时间 + 环境 + 上鱼」数据。</p>
        <button className="p-btn p-btn-dark p-btn-block" style={{ marginTop: 8 }} onClick={submitLog}>保存日志</button>
      </Sheet>

      <Sheet open={encOpen} title={`鱼种图鉴 ${s.encyclopediaUnlocked}/${s.encyclopediaTotal}`} onClose={() => setEncOpen(false)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1, height: 7, borderRadius: 4, background: 'var(--surface-2)', overflow: 'hidden' }}>
            <div style={{ width: `${encPct}%`, height: '100%', borderRadius: 4, background: 'linear-gradient(90deg, var(--lime-deep), #7bc394)' }} />
          </div>
          <span style={{ fontFamily: 'var(--font-num)', fontSize: 12, fontWeight: 800 }}>{encPct}%</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {(enc?.items || []).map((it) => (
            <div key={it.id} style={{
              background: it.unlocked ? 'var(--lime-soft)' : 'var(--surface-2)',
              border: `1px solid ${it.unlocked ? '#dcecab' : 'var(--hair)'}`,
              borderRadius: 12, padding: '9px 2px', textAlign: 'center',
            }}>
              <div style={{ fontSize: it.unlocked ? 19 : 14, filter: it.unlocked ? 'none' : 'grayscale(1) opacity(.35)' }}>
                {it.unlocked ? it.emoji : '❓'}
              </div>
              <div style={{ fontSize: 9, marginTop: 3, color: it.unlocked ? '#4d6318' : 'var(--ink-3)', fontWeight: it.unlocked ? 700 : 400 }}>
                {it.unlocked ? it.species : '未解锁'}
              </div>
              {it.unlocked && it.catchCount > 1 && <div style={{ fontSize: 8, color: 'var(--ink-3)' }}>×{it.catchCount}</div>}
            </div>
          ))}
        </div>
        {!enc && <Spinner />}
      </Sheet>

      <Sheet open={vipOpen} title="15 天鱼口趋势" onClose={() => setVipOpen(false)}>
        <VipTrendList />
      </Sheet>
    </div>
  );
}

function VipTrendList() {
  const [trend, setTrend] = useState(null);
  useEffect(() => {
    api.forecast({ spotId: 1, date: todayStr(0), species: '鲫鱼', days: 15 })
      .then((d) => setTrend(d.dailyTrend))
      .catch(() => setTrend([]));
  }, []);
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
            }} />
            <span style={{ fontSize: 8, color: 'var(--ink-3)' }}>{t.date.slice(8)}</span>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 10.5, color: 'var(--ink-3)', lineHeight: 1.8, marginTop: 12 }}>
        会员专享：未来 15 天逐日鱼口趋势，提前锁定适合出竿的时间。
      </p>
    </div>
  );
}
