import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';
import { useAuth, useToast } from '../store.jsx';
import { Empty, Spinner, Sheet } from '../components/ui.jsx';

const FILTERS = ['最新', '热门', '好贴', '晒单', '杭州市'];

const QUICK_ACTIONS = [
  { key: 'tank', icon: '🐠', label: '玩赛博鱼缸', target: 'profile' },
  { key: 'wiki', icon: '📖', label: '钓鱼百科' },
  { key: 'tide', icon: '🌊', label: '潮汐查询' },
  { key: 'spots', icon: '📍', label: '附近钓点', target: 'map' },
  { key: 'gear', icon: '🎣', label: '附近渔具' },
  { key: 'log', icon: '✏️', label: '记录渔获', target: 'publish' },
];

function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))}分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
  return `${Math.floor(diff / 86400)}天前`;
}

export default function CommunityPage({ filter, onClearFilter, onPublish, onNavigateToMap, onNavigateToProfile }) {
  const showToast = useToast();
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('最新');
  const [commenting, setCommenting] = useState(null);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [panel, setPanel] = useState(null); // wiki | gear | tide

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.catches({ spotId: filter?.spotId, page: 1, pageSize: 30 });
      setTotal(data.total);
      setItems(data.items);
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [filter?.spotId, showToast]);

  useEffect(() => { load(); }, [load]);

  const shown = React.useMemo(() => {
    let list = [...items];
    if (tab === '热门') list.sort((a, b) => b.likesCount - a.likesCount);
    if (tab === '好贴') list = list.filter((c) => (c.content || '').length >= 20);
    if (tab === '晒单') list = list.filter((c) => (c.imageUrls || []).length > 0);
    if (tab === '杭州市') list = list.filter((c) => !c.spotName || true); // MVP 数据均属杭州水域
    return list;
  }, [items, tab]);

  async function toggleLike(c) {
    if (!user) return;
    try {
      if (c.liked) {
        const r = await api.unlike(c.id);
        c.liked = false; c.likesCount = r.likesCount;
      } else {
        const r = await api.like(c.id);
        c.liked = true; c.likesCount = r.likesCount;
      }
      setItems((prev) => [...prev]);
    } catch (e) { showToast(e.message, 'error'); }
  }

  async function openComments(c) {
    setCommenting(c);
    setCommentText('');
    try {
      const data = await api.comments(c.id);
      setComments(data.items);
    } catch (e) { showToast(e.message, 'error'); }
  }

  async function submitComment() {
    if (!commentText.trim()) return;
    try {
      await api.addComment({ catchId: commenting.id, content: commentText.trim() });
      const data = await api.comments(commenting.id);
      setComments(data.items);
      setCommentText('');
      commenting.commentsCount += 1;
      setItems((prev) => [...prev]);
      showToast('评论成功', 'success');
    } catch (e) { showToast(e.message, 'error'); }
  }

  async function report(c) {
    try {
      await api.report({ targetType: 'catch', targetId: c.id, reason: '用户举报' });
      showToast('已收到举报，管理员将尽快处理', 'success');
    } catch (e) { showToast(e.message, 'error'); }
  }

  function quickAction(a) {
    if (a.target === 'map') onNavigateToMap();
    else if (a.target === 'profile') onNavigateToProfile();
    else if (a.target === 'publish') onPublish();
    else setPanel(a.key);
  }

  return (
    <div className="page">
      <div className="topbar">
        <div style={{ flex: 1, display: 'flex', gap: 14, fontSize: 14 }}>
          {FILTERS.map((f) => (
            <button key={f} onClick={() => setTab(f)}
              style={{ fontWeight: tab === f ? 800 : 400, color: tab === f ? 'var(--text)' : 'var(--text-3)', position: 'relative' }}>
              {f}
              {tab === f && <i style={{ position: 'absolute', left: '50%', bottom: -5, width: 14, height: 2.5, borderRadius: 2, background: 'var(--green)', transform: 'translateX(-50%)' }} />}
            </button>
          ))}
        </div>
        {filter?.spotId && <button className="chip" onClick={onClearFilter}>清除筛选 ✕</button>}
      </div>

      {filter?.spotName && (
        <p className="muted" style={{ margin: '0 2px 10px', fontSize: 11.5 }}>📍 「{filter.spotName}」附近渔获</p>
      )}

      {/* 顶部 banner：鱼种图鉴 + 渔业法 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
        <button className="promo-banner" onClick={onNavigateToProfile}>
          <span style={{ fontSize: 20 }}>🐟</span>
          <span style={{ flex: 1, textAlign: 'left' }}>
            <b style={{ fontSize: 12.5 }}>点亮你的鱼种图鉴</b>
            <span style={{ display: 'block', fontSize: 10.5, color: 'var(--text-2)', marginTop: 2 }}>自动识鱼，3 秒记录，兑换钓具</span>
          </span>
          <span style={{ fontSize: 11, color: 'var(--green)' }}>&gt;</span>
        </button>
        <button className="promo-banner" onClick={() => onNavigateToMap()}>
          <span style={{ fontSize: 20 }}>⚖️</span>
          <span style={{ flex: 1, textAlign: 'left' }}>
            <b style={{ fontSize: 12.5 }}>2026 新《渔业法》已施行</b>
            <span style={{ display: 'block', fontSize: 10.5, color: 'var(--text-2)', marginTop: 2 }}>禁钓区/禁渔期一键查询，合规出钓</span>
          </span>
          <span style={{ fontSize: 11, color: 'var(--green)' }}>立即查询 &gt;</span>
        </button>
      </div>

      {/* 快捷入口 */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6, marginBottom: 14,
        background: 'var(--bg-card)', border: '1px solid var(--line)', borderRadius: 14, padding: '12px 6px',
      }}>
        {QUICK_ACTIONS.map((a) => (
          <button key={a.key} onClick={() => quickAction(a)}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
            <span style={{ fontSize: 21 }}>{a.icon}</span>
            <span style={{ fontSize: 9.5, color: 'var(--text-2)' }}>{a.label}</span>
          </button>
        ))}
      </div>

      {loading && <Spinner />}
      {!loading && shown.length === 0 && <Empty text="这个分类下还没有动态" icon="🐟" />}

      {/* 双列瀑布流 */}
      {!loading && shown.length > 0 && (
        <div style={{ columnCount: 2, columnGap: 10 }}>
          {shown.map((c) => (
            <article key={c.id} className="feed-card">
              <div style={{
                height: c.imageUrls?.[0] ? 118 : 56, borderRadius: '10px 10px 0 0', overflow: 'hidden',
                background: 'linear-gradient(135deg, #0e4d6e, #0a3547)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {c.imageUrls?.[0]
                  ? <img src={c.imageUrls[0]} alt={c.fishSpecies} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span style={{ fontSize: 26 }}>🐟</span>}
              </div>
              <div style={{ padding: '8px 10px 10px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {c.content || `${c.fishSpecies || '渔获'}动态`}
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', margin: '6px 0' }}>
                  {c.fishSpecies && <span className="tag tag-green" style={{ fontSize: 9.5 }}>{c.fishSpecies}</span>}
                  {c.weightKg != null && <span className="tag tag-amber" style={{ fontSize: 9.5 }}>{c.weightKg}kg</span>}
                </div>
                <div className="muted" style={{ fontSize: 9.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>📍 {c.spotName || '千岛湖水域'} · {timeAgo(c.createdAt)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                  <span style={{ fontSize: 10.5, color: 'var(--text-2)' }}>{c.nickname}</span>
                  <span style={{ display: 'flex', gap: 8, fontSize: 10.5, color: 'var(--text-3)' }}>
                    <button onClick={() => toggleLike(c)} style={{ color: c.liked ? 'var(--red)' : 'inherit' }}>
                      {c.liked ? '❤️' : '🤍'} {c.likesCount}
                    </button>
                    <button onClick={() => openComments(c)}>💬 {c.commentsCount}</button>
                    <button onClick={() => report(c)}>⚑</button>
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* 评论 */}
      <Sheet open={!!commenting} title={`评论 · ${commenting?.nickname || ''}`} onClose={() => setCommenting(null)}>
        {comments.map((cm) => (
          <div key={cm.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>{cm.nickname}</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 2 }}>{cm.content}</div>
          </div>
        ))}
        {comments.length === 0 && <p className="muted" style={{ fontSize: 12 }}>还没有评论，来抢沙发</p>}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <input className="input" placeholder="友善评论，理性交流" value={commentText}
            onChange={(e) => setCommentText(e.target.value)} />
          <button className="btn btn-primary" onClick={submitComment}>发送</button>
        </div>
      </Sheet>

      {/* 百科 / 渔具 / 潮汐 */}
      <Sheet open={panel === 'wiki'} title="📖 钓鱼百科" onClose={() => setPanel(null)}>
        <WikiPanel />
      </Sheet>
      <Sheet open={panel === 'gear'} title="🎣 附近渔具" onClose={() => setPanel(null)}>
        <GearPanel />
      </Sheet>
      <Sheet open={panel === 'tide'} title="🌊 潮汐查询" onClose={() => setPanel(null)}>
        <TidePanel />
      </Sheet>
    </div>
  );
}

function WikiPanel() {
  const [articles, setArticles] = useState(null);
  useEffect(() => { api.articles().then((d) => setArticles(d.items)).catch(() => setArticles([])); }, []);
  if (!articles) return <Spinner />;
  return (
    <div>
      {articles.map((a) => (
        <div key={a.id} className="card" style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 12 }}>
          <div style={{
            width: 46, height: 46, borderRadius: 10, background: 'var(--bg-elevated)', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
          }}>{a.cover}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{a.title}</div>
            <div className="muted" style={{ fontSize: 10.5, marginTop: 3 }}>{a.digest}</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              <span className="tag tag-blue" style={{ fontSize: 9.5 }}>{a.category}</span>
              <span className="muted" style={{ fontSize: 9.5 }}>{a.reads} 阅读</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function GearPanel() {
  const [shops, setShops] = useState(null);
  useEffect(() => { api.gearShops().then((d) => setShops(d.items)).catch(() => setShops([])); }, []);
  if (!shops) return <Spinner />;
  return (
    <div>
      {shops.map((s) => (
        <div key={s.id} className="card" style={{ padding: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13.5, fontWeight: 700 }}>{s.name}</span>
            <span className="amber-text" style={{ fontSize: 12, fontWeight: 700 }}>★ {s.rating}</span>
          </div>
          <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>{s.type} · {s.distance}km · {s.address}</div>
          <div style={{ marginTop: 6 }}>
            {s.tags.map((t) => <span key={t} className="tag" style={{ fontSize: 9.5 }}>{t}</span>)}
          </div>
        </div>
      ))}
    </div>
  );
}

function TidePanel() {
  const [tide, setTide] = useState(null);
  useEffect(() => {
    const d = new Date();
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    api.tide(date).then(setTide).catch(() => setTide(null));
  }, []);
  if (!tide) return <Spinner />;
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <span className="badge tag-blue">{tide.type}</span>
        <span className="badge tag-amber">{tide.name}</span>
        <span className="badge">潮差 {tide.tideRange}m</span>
      </div>
      {tide.tides.map((t, i) => (
        <div key={i} style={{
          display: 'flex', justifyContent: 'space-between', padding: '10px 12px', marginBottom: 8,
          background: t.type === '高潮' ? 'var(--green-dim)' : 'rgba(4,24,33,0.45)', borderRadius: 10,
        }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>{t.type} {t.time}</span>
          <span className="muted" style={{ fontSize: 12 }}>潮高 {t.height}m</span>
        </div>
      ))}
      <p className="muted" style={{ fontSize: 11, lineHeight: 1.7 }}>💡 {tide.advice}。内河航道以水文站实时数据为准。</p>
    </div>
  );
}
