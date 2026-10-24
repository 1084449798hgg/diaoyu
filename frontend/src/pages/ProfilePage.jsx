import React, { useEffect, useState, useCallback } from 'react';
import { api, todayStr } from '../api.js';
import { useAuth, useToast } from '../store.jsx';
import { Empty, Spinner, Sheet, Segmented } from '../components/ui.jsx';

const USER_LNG = 119.05;
const USER_LAT = 29.6;

/** 赛博鱼缸里游动的鱼（按重量决定体型） */
function TankFish({ fish }) {
  const size = fish.weightKg ? Math.min(34, 14 + fish.weightKg * 5) : 18;
  const dur = 6 + (fish.id % 5);
  return (
    <div key={fish.id} style={{
      position: 'absolute', bottom: `${8 + (fish.id * 13) % 46}%`,
      animation: `swim ${dur}s linear ${fish.id * 0.7}s infinite`,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
    }}>
      <span style={{ fontSize: size, filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.4))' }}>
        {fish.weightKg && fish.weightKg >= 2 ? '🐟' : '🐠'}
      </span>
      <span style={{ fontSize: 9, color: 'var(--text-2)', marginTop: 1 }}>
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
  const [tab, setTab] = useState('logs'); // logs | public
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
      const [meData, encData] = await Promise.all([
        api.me(),
        api.encyclopedia().catch(() => null),
      ]);
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
      showToast('日志已保存（已自动附带天气快照）', 'success');
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

  return (
    <div className="page">
      {/* 头部 */}
      <div className="topbar">
        <div style={{ flex: 1 }}>
          <div className="topbar-title">个人中心</div>
          <div className="topbar-sub">记录每一次出钓，收获更多精彩</div>
        </div>
        <button className="icon-btn" onClick={() => showToast('暂无新通知', 'info')} style={{ position: 'relative' }}>
          🔔<i style={{ position: 'absolute', top: -2, right: -2, width: 7, height: 7, borderRadius: 4, background: 'var(--red)' }} />
        </button>
        <button className="icon-btn" onClick={() => showToast('设置（演示）', 'info')}>⚙️</button>
      </div>

      {/* 资料卡 */}
      <div className="card" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <div style={{
          width: 58, height: 58, borderRadius: '50%', flexShrink: 0,
          background: 'linear-gradient(135deg, var(--green), #1d7a58)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26,
        }}>🎣</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 17, fontWeight: 800 }}>{me.nickname}</span>
            {me.isVip && <span className="badge" style={{ background: 'linear-gradient(135deg,#f0b44c,#e8890c)', color: '#3a2403' }}>👑 会员</span>}
            <span className="badge" style={{ background: 'var(--blue-dim)', color: 'var(--blue)' }}>小白白</span>
          </div>
          <div className="muted" style={{ marginTop: 4, fontSize: 11.5 }}>
            已解锁图鉴 <b className="green-text">{s.encyclopediaUnlocked}</b>/{s.encyclopediaTotal} 种 · {me.phone}
          </div>
        </div>
      </div>

      {/* 社交/积分统计 */}
      <div className="card" style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center', padding: '13px 10px' }}>
        {[
          ['关注', s.followingCount, ''],
          ['粉丝', s.fansCount, ''],
          ['鱼石', me.points, '🪨'],
          ['日志', s.logCount, '📖'],
        ].map(([label, v, icon]) => (
          <div key={label}>
            <div style={{ fontSize: 19, fontWeight: 800, color: label === '鱼石' ? 'var(--amber)' : 'var(--text)' }}>
              {icon}{v}
            </div>
            <div className="muted" style={{ fontSize: 10.5, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* AI 黄金窗口预测（会员专享） */}
      <div className="vip-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 18 }}>✨</span>
          <b style={{ fontSize: 14 }}>AI 黄金窗口预测</b>
          <span className="badge" style={{ background: 'rgba(240,180,76,0.2)', color: 'var(--amber)' }}>会员专享</span>
        </div>
        <p style={{ margin: '0 0 10px', fontSize: 11.5, color: 'var(--text-2)', lineHeight: 1.7 }}>
          未来 15 天鱼口趋势，提前锁定适合出竿的时间。逐小时鱼口 + 目标鱼建议，精准到每小时。
        </p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {['15天趋势', '鱼情早知道', '逐小时鱼口', '不同鱼种推荐'].map((t) => (
            <span key={t} className="tag" style={{ fontSize: 10 }}>{t}</span>
          ))}
        </div>
        {me.isVip
          ? <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => setVipOpen(true)}>查看 15 天趋势</button>
          : <button className="btn btn-primary" style={{ width: '100%' }} onClick={activateVip}>👑 开通会员 · 解锁 15 天预测</button>}
      </div>

      {/* 我的战绩 */}
      <div className="card-title"><span>🏆 我的战绩</span></div>
      <div className="card" style={{ padding: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[
            ['累计渔获', `${s.catchCount} 尾`, '🐟'],
            ['图鉴进度', `${s.encyclopediaUnlocked}/${s.encyclopediaTotal}`, '📖'],
            ['最大单尾', s.maxCatch ? `${s.maxCatch.species} ${s.maxCatch.weightKg}kg` : '暂无记录', '⚖️'],
            ['本月出钓', `${s.monthFishDays} 天`, '📅'],
          ].map(([k, v, icon]) => (
            <div key={k} style={{ background: 'rgba(4,24,33,0.45)', borderRadius: 12, padding: '10px 12px' }}>
              <div className="muted" style={{ fontSize: 10.5 }}>{icon} {k}</div>
              <div style={{ fontSize: 16, fontWeight: 800, marginTop: 3 }}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={onPublish}>📝 记渔获</button>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setEncOpen(true)}>📖 我的图鉴</button>
        </div>
      </div>

      {/* 首条渔获 CTA */}
      {s.catchCount === 0 && (
        <button className="promo-banner" onClick={onPublish} style={{ marginBottom: 14 }}>
          <span style={{ fontSize: 20 }}>🎉</span>
          <span style={{ flex: 1, textAlign: 'left' }}>
            <b style={{ fontSize: 12.5 }}>纪录第一尾渔获</b>
            <span style={{ display: 'block', fontSize: 10.5, color: 'var(--text-2)', marginTop: 2 }}>完成记录可解锁鱼种、钓点、时间统计</span>
          </span>
          <span style={{ fontSize: 11, color: 'var(--green)' }}>去记录 &gt;</span>
        </button>
      )}

      {/* 赛博鱼缸 */}
      <div className="card-title"><span>🐠 赛博鱼缸</span><span className="extra">{me.fishTank.length} 条在游</span></div>
      <div className="card" style={{
        padding: 0, height: 130, position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(180deg, rgba(20,80,106,0.5), rgba(10,50,66,0.8))',
      }}>
        {me.fishTank.length === 0 && (
          <div className="empty" style={{ padding: '40px 0' }}>鱼缸空空的，去记录第一尾渔获吧</div>
        )}
        {me.fishTank.map((f) => <TankFish key={f.id} fish={f} />)}
        <span style={{ position: 'absolute', left: 12, bottom: 4, fontSize: 20, opacity: 0.7 }}>🌿</span>
        <span style={{ position: 'absolute', right: 18, bottom: 4, fontSize: 24, opacity: 0.7 }}>🌿</span>
      </div>

      {/* 我的日志（FR-05 合并至此） */}
      <div className="card-title" style={{ marginTop: 16 }}>
        <span>📖 出钓日志</span>
        <span className="extra" onClick={() => setEditing(true)} style={{ cursor: 'pointer' }}>＋ 记一笔</span>
      </div>
      <div style={{ marginBottom: 12 }}>
        <Segmented
          options={[{ value: 'logs', label: '我的日志' }, { value: 'public', label: '钓友公开日志' }]}
          value={tab} onChange={setTab}
        />
      </div>

      {tab === 'logs' && logStats && (
        <div className="card" style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center', padding: '12px 10px' }}>
          {[['出钓次数', logStats.trips], ['总渔获', `${logStats.totalFish} 尾`], ['足迹钓点', logStats.spots]].map(([k, v]) => (
            <div key={k}>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--green)' }}>{v}</div>
              <div className="muted" style={{ fontSize: 10.5, marginTop: 1 }}>{k}</div>
            </div>
          ))}
        </div>
      )}

      {logs.length === 0 && <Empty text="还没有日志，记下第一条吧" icon="📖" />}
      {logs.map((l) => (
        <div className="card" key={l.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>
              {l.fishSpecies ? `🐟 ${l.fishSpecies}` : '🎣 出钓记录'}
              {l.fishCount > 0 && <span className="green-text" style={{ fontSize: 12, marginLeft: 6 }}>× {l.fishCount}</span>}
            </div>
            <span className={`badge ${l.visibility === 'public' ? 'tag-green' : ''}`}>
              {l.visibility === 'public' ? '公开' : '私密'}
            </span>
          </div>
          <div className="muted" style={{ fontSize: 12, lineHeight: 1.7 }}>
            📅 {l.fishDate} · 📍 {l.spotName || '未关联钓点'} · 🪝 {l.bait || '未记录'}
          </div>
          {l.weatherSnapshot && Object.keys(l.weatherSnapshot).length > 0 && (
            <div style={{
              marginTop: 8, background: 'rgba(4,24,33,0.45)', borderRadius: 10, padding: '8px 10px',
              display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11.5, color: 'var(--text-2)',
            }}>
              <span>🌡️ {l.weatherSnapshot.temp}℃</span>
              <span>📊 {l.weatherSnapshot.pressure}hPa</span>
              <span>💨 {l.weatherSnapshot.windDir}风 {l.weatherSnapshot.windSpeed}m/s</span>
              <span>💧 {l.weatherSnapshot.precip}mm/h</span>
            </div>
          )}
          {l.content && <p style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.7, color: 'var(--text-2)' }}>{l.content}</p>}
        </div>
      ))}

      {/* 安全与合规 */}
      <div className="card">
        <h3 className="card-title">安全与合规</h3>
        {[
          ['📄', '隐私政策', '明确第三方 SDK（地图/天气/推送/OSS）收集信息类型'],
          ['🛡️', '内容安全', 'UGC 图片机审：高风险拦截、中风险人工队列、低风险先发后审'],
          ['⚠️', '预测免责', '鱼情预测仅供参考，不构成出钓决策保证'],
          ['🚫', '禁钓提醒', '钓点禁钓状态前置展示，请遵守当地渔业法规'],
        ].map(([icon, title, desc]) => (
          <div key={title} style={{ display: 'flex', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--line)' }}>
            <span style={{ fontSize: 16 }}>{icon}</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{title}</div>
              <div className="muted" style={{ fontSize: 11, marginTop: 2, lineHeight: 1.5 }}>{desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* 桌面小组件 + 退出 */}
      <button className="promo-banner" style={{ marginTop: 4 }} onClick={() => showToast('已添加到桌面：钓鱼指数小组件（演示）', 'success')}>
        <span style={{ fontSize: 20 }}>📱</span>
        <span style={{ flex: 1, textAlign: 'left' }}>
          <b style={{ fontSize: 12.5 }}>把钓鱼指数放到桌面</b>
          <span style={{ display: 'block', fontSize: 10.5, color: 'var(--text-2)', marginTop: 2 }}>小组件实时显示今日鱼口与黄金鱼段</span>
        </span>
        <span style={{ fontSize: 11, color: 'var(--green)' }}>添加 &gt;</span>
      </button>

      <button className="btn btn-ghost btn-block" style={{ margin: '14px 0 8px', color: 'var(--text-3)' }}
        onClick={() => { logout(); showToast('已退出登录', 'info'); }}>
        退出登录
      </button>

      <p className="muted" style={{ textAlign: 'center', fontSize: 10.5, margin: '4px 0 8px', lineHeight: 1.6 }}>
        鱼情预报 v1.0 · MVP 验证版<br />鱼情预报 + 钓点地图 + 渔获社区 + 鱼种图鉴
      </p>

      {/* 记日志弹层 */}
      <Sheet open={editing} title="记一笔出钓日志" onClose={() => setEditing(false)}>
        <div className="field">
          <label className="field-label">出钓日期</label>
          <input className="input" type="date" value={form.fishDate}
            onChange={(e) => setForm({ ...form, fishDate: e.target.value })} />
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
            <input className="input" placeholder="如：鲫鱼" value={form.fishSpecies}
              onChange={(e) => setForm({ ...form, fishSpecies: e.target.value })} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label className="field-label">渔获数量</label>
            <input className="input" type="number" min="0" placeholder="0" value={form.fishCount}
              onChange={(e) => setForm({ ...form, fishCount: e.target.value })} />
          </div>
        </div>
        <div className="field">
          <label className="field-label">饵料</label>
          <input className="input" placeholder="如：蚯蚓 + 酒米" value={form.bait}
            onChange={(e) => setForm({ ...form, bait: e.target.value })} />
        </div>
        <div className="field">
          <label className="field-label">备注</label>
          <textarea className="input" placeholder="天气感受、鱼口情况、钓位心得…" value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })} />
        </div>
        <div className="field">
          <label className="field-label">可见范围</label>
          <Segmented
            options={[{ value: 'private', label: '仅自己可见' }, { value: 'public', label: '公开给钓友' }]}
            value={form.visibility}
            onChange={(v) => setForm({ ...form, visibility: v })}
          />
        </div>
        <p className="muted" style={{ fontSize: 11, lineHeight: 1.6 }}>
          保存时将自动附带当日天气快照（气温/气压/风/降水），为后续模型校准积累「出钓时间 + 环境参数 + 是否上鱼」数据。
        </p>
        <button className="btn btn-primary btn-block" style={{ marginTop: 8 }} onClick={submitLog}>保存日志</button>
      </Sheet>

      {/* 鱼种图鉴 */}
      <Sheet open={encOpen} title={`📖 鱼种图鉴 ${s.encyclopediaUnlocked}/${s.encyclopediaTotal}`} onClose={() => setEncOpen(false)}>
        <div style={{ height: 8, borderRadius: 4, background: 'rgba(4,24,33,0.6)', marginBottom: 12 }}>
          <div style={{ width: `${encPct}%`, height: '100%', borderRadius: 4, background: 'var(--green)' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {(enc?.items || []).map((it) => (
            <div key={it.id} style={{
              background: it.unlocked ? 'var(--green-dim)' : 'rgba(4,24,33,0.45)',
              border: `1px solid ${it.unlocked ? 'var(--green)' : 'var(--line)'}`,
              borderRadius: 10, padding: '8px 2px', textAlign: 'center',
            }}>
              <div style={{ fontSize: it.unlocked ? 20 : 15, filter: it.unlocked ? 'none' : 'grayscale(1) opacity(0.4)' }}>
                {it.unlocked ? it.emoji : '❓'}
              </div>
              <div style={{ fontSize: 10, marginTop: 3, color: it.unlocked ? 'var(--green)' : 'var(--text-3)' }}>
                {it.unlocked ? it.species : '未解锁'}
              </div>
              {it.unlocked && it.catchCount > 1 && <div style={{ fontSize: 9, color: 'var(--text-3)' }}>×{it.catchCount}</div>}
            </div>
          ))}
        </div>
        {!enc && <Spinner />}
      </Sheet>

      {/* VIP 15 天趋势 */}
      <Sheet open={vipOpen} title="👑 15 天鱼口趋势" onClose={() => setVipOpen(false)}>
        <VipTrendList />
      </Sheet>
    </div>
  );
}

/** 15 天趋势（会员） */
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
            <span style={{ fontSize: 9, color: t.score >= 82 ? 'var(--green)' : 'var(--text-3)' }}>{t.score}</span>
            <div style={{
              width: '100%', borderRadius: 3, height: `${(t.score / max) * 84}px`,
              background: t.score >= 82 ? 'var(--green)' : t.score >= 68 ? 'var(--blue)' : 'var(--amber)',
            }} />
            <span style={{ fontSize: 8.5, color: 'var(--text-3)' }}>{t.date.slice(8)}</span>
          </div>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 11, lineHeight: 1.7, marginTop: 10 }}>
        会员专享：未来 15 天逐日鱼口趋势，提前锁定适合出竿的时间。
      </p>
    </div>
  );
}
