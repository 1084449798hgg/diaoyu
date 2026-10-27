import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { api } from '../api.js';
import { useAuth, useToast } from '../store.jsx';
import { Empty, Spinner, Sheet } from '../components/ui.jsx';
import Icon from '../components/icons.jsx';
import FishArt from '../components/fishArt.jsx';

const FILTERS = [
  { key: '推荐', en: 'FOR YOU' },
  { key: '最新', en: 'LATEST' },
  { key: '热门', en: 'HOT' },
  { key: '晒单', en: 'PHOTO' },
];

const QUICK_ACTIONS = [
  { key: 'tank', icon: 'tank', label: '鱼缸', target: 'profile' },
  { key: 'wiki', icon: 'book', label: '百科' },
  { key: 'tide', icon: 'water', label: '潮汐' },
  { key: 'spots', icon: 'pin', label: '钓点', target: 'map' },
  { key: 'gear', icon: 'gem', label: '渔具' },
  { key: 'log', icon: 'camera', label: '记录', target: 'publish' },
];

function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))}分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
  return `${Math.floor(diff / 86400)}天前`;
}

function CardMedia({ c, h, seed }) {
  return <FishArt species={c.fishSpecies} height={h} seed={seed} />;
}

export default function CommunityPage({ filter, onClearFilter, onPublish, onNavigateToMap, onNavigateToProfile }) {
  const showToast = useToast();
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('推荐');
  const [commenting, setCommenting] = useState(null);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [panel, setPanel] = useState(null);

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

  const shown = useMemo(() => {
    let list = [...items];
    if (tab === '最新') list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (tab === '热门') list.sort((a, b) => b.likesCount - a.likesCount);
    if (tab === '晒单') list = list.filter((c) => (c.imageUrls || []).length > 0);
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

  /** 热度指数：点赞 + 评论 + 重量，真实数据派生 */
  const hotIndex = (c) => Math.min(99, 52 + (c.likesCount || 0) * 2 + (c.commentsCount || 0) * 3 + Math.round((c.weightKg || 0) * 3));

  return (
    <div className="page">
      {/* 标题 */}
      <div className="cm-head">
        <div className="cm-title">钓友圈</div>
        <div className="cm-sub">
          看渔获<i style={{ width: 3, height: 3, borderRadius: 3, background: 'var(--ink-3)', display: 'inline-block' }} />
          找钓友<i style={{ width: 3, height: 3, borderRadius: 3, background: 'var(--ink-3)', display: 'inline-block' }} />
          {filter?.spotName || '杭州市'}
          {filter?.spotId && <button className="p-pill p-pill-line" style={{ height: 22, marginLeft: 6, fontSize: 9 }} onClick={onClearFilter}>清除筛选 ✕</button>}
        </div>
      </div>

      {/* 快捷入口：细图标条 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', margin: '16px 2px 4px' }}>
        {QUICK_ACTIONS.map((a) => (
          <button key={a.key} onClick={() => quickAction(a)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 38, height: 38, borderRadius: 999, background: 'var(--surface)', border: '1px solid var(--hair)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-2)', boxShadow: '0 2px 8px rgba(13,26,21,.04)' }}>
              <Icon name={a.icon} size={16} />
            </span>
            <span style={{ fontSize: 8.5, color: 'var(--ink-3)', fontWeight: 600 }}>{a.label}</span>
          </button>
        ))}
      </div>

      {/* 四段筛选 */}
      <div className="cm-seg">
        {FILTERS.map((f) => (
          <button key={f.key} className={`cm-seg-btn ${tab === f.key ? 'active' : ''}`} onClick={() => setTab(f.key)}>
            {f.key}
            <em>{f.en}</em>
          </button>
        ))}
      </div>

      {loading && <Spinner />}
      {!loading && shown.length === 0 && <Empty text="这个分类下还没有动态" icon="🐟" />}

      {/* 双列瀑布流 */}
      {!loading && shown.length > 0 && (
        <div style={{ columnCount: 2, columnGap: 10 }}>
          {shown.map((c, idx) => {
            const h = c.imageUrls?.[0] ? 140 : idx % 3 === 1 ? 116 : 150;
            return (
              <article key={c.id} className="cm-card">
                <div className="cm-media">
                  <CardMedia c={c} h={h} seed={idx} />
                  <div className="cm-badges-l">
                    <span className="cm-mini-fish">{fishEmoji(c.fishSpecies)}</span>
                    <span className="cm-count-l">×{c.fishCount || 1}</span>
                  </div>
                  <div className="cm-count-r"><Icon name="comment" size={9} strokeWidth={2} />{c.commentsCount ?? 0}</div>
                  <div className="cm-media-foot">
                    <div>
                      <div className="cm-species">{c.fishSpecies || '渔获'}<em>{c.fishCount ? `×${c.fishCount}` : ''}</em></div>
                      <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                        <span className="cm-meta-chip">{methodLabel(c)}</span>
                        {c.weightKg != null && <span className="cm-meta-chip">{c.weightKg}kg</span>}
                      </div>
                    </div>
                    <div className="cm-index">
                      <b>{hotIndex(c)}</b>
                      <span>热度</span>
                    </div>
                  </div>
                </div>
                <div className="cm-body">
                  <div className="cm-text">{c.content || `${c.spotName || '千岛湖'} · ${c.fishSpecies || '渔获'}上鱼记录`}</div>
                  <div className="cm-foot">
                    <span className="cm-ava">{(c.nickname || '钓')[0]}</span>
                    <span className="cm-nick">{c.nickname || '钓友'}</span>
                    <span className="cm-lv">LV.{Math.min(9, 2 + (c.likesCount || 0) % 6)}</span>
                    <span className="cm-acts">
                      <button className={`cm-act ${c.liked ? 'liked' : ''}`} onClick={() => toggleLike(c)}>
                        <Icon name="heart" size={11} strokeWidth={2} fill={c.liked ? 'currentColor' : 'none'} />{c.likesCount}
                      </button>
                      <button className="cm-act" onClick={() => openComments(c)}>
                        <Icon name="comment" size={11} strokeWidth={2} />{c.commentsCount}
                      </button>
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 6, fontSize: 8.5, color: 'var(--ink-3)' }}>
                    <Icon name="pin" size={9} strokeWidth={1.9} />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.spotName || '杭州市'} · {timeAgo(c.createdAt)}</span>
                    <button onClick={() => report(c)} style={{ color: 'var(--ink-3)', opacity: .6 }}>举报</button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <p style={{ fontSize: 9.5, color: 'var(--ink-3)', textAlign: 'center', margin: '16px 0 4px' }}>
        共 {total} 条渔获 · 友善交流，理性晒图
      </p>

      {/* 评论 */}
      <Sheet open={!!commenting} title={`评论 · ${commenting?.nickname || ''}`} onClose={() => setCommenting(null)}>
        {comments.map((cm) => (
          <div key={cm.id} style={{ padding: '11px 0', borderBottom: '1px solid var(--hair)', display: 'flex', gap: 9 }}>
            <span className="cm-ava" style={{ marginTop: 1 }}>{(cm.nickname || '钓')[0]}</span>
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 700 }}>{cm.nickname}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-2)', marginTop: 2, lineHeight: 1.6 }}>{cm.content}</div>
            </div>
          </div>
        ))}
        {comments.length === 0 && <p style={{ fontSize: 11, color: 'var(--ink-3)' }}>还没有评论，来抢沙发</p>}
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <input className="input" placeholder="友善评论，理性交流" value={commentText}
            onChange={(e) => setCommentText(e.target.value)} />
          <button className="p-btn p-btn-dark p-btn-sm" style={{ height: 44, borderRadius: 13, padding: '0 16px' }} onClick={submitComment}>发送</button>
        </div>
      </Sheet>

      <Sheet open={panel === 'wiki'} title="钓鱼百科" onClose={() => setPanel(null)}>
        <WikiPanel />
      </Sheet>
      <Sheet open={panel === 'gear'} title="附近渔具" onClose={() => setPanel(null)}>
        <GearPanel />
      </Sheet>
      <Sheet open={panel === 'tide'} title="潮汐查询" onClose={() => setPanel(null)}>
        <TidePanel />
      </Sheet>
    </div>
  );
}

function fishEmoji(s = '') {
  if (/鲤|鲫/.test(s)) return '🐟';
  if (/翘嘴|白条/.test(s)) return '🐠';
  if (/鲈|鳜|黑鱼/.test(s)) return '🐡';
  return '🐟';
}
function methodLabel(c) {
  if (c.weightKg && c.weightKg > 2) return '海钓';
  if (c.baitType === '假饵') return '路亚';
  return '台钓';
}

function WikiPanel() {
  const [articles, setArticles] = useState(null);
  useEffect(() => { api.articles().then((d) => setArticles(d.items)).catch(() => setArticles([])); }, []);
  if (!articles) return <Spinner />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {articles.map((a) => (
        <div key={a.id} style={{ display: 'flex', gap: 11, alignItems: 'center', background: 'var(--surface-2)', borderRadius: 14, padding: 12 }}>
          <div style={{ width: 42, height: 42, borderRadius: 11, background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19, flexShrink: 0 }}>{a.cover}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700 }}>{a.title}</div>
            <div style={{ fontSize: 9.5, color: 'var(--ink-3)', marginTop: 3 }}>{a.digest}</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 5, alignItems: 'center' }}>
              <span className="p-pill p-pill-line" style={{ height: 19, fontSize: 8.5 }}>{a.category}</span>
              <span style={{ fontSize: 8.5, color: 'var(--ink-3)' }}>{a.reads} 阅读</span>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {shops.map((s) => (
        <div key={s.id} style={{ background: 'var(--surface-2)', borderRadius: 14, padding: 13 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12.5, fontWeight: 700 }}>{s.name}</span>
            <span style={{ fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
              <Icon name="star" size={10} fill="var(--lime-deep)" color="var(--lime-deep)" />{s.rating}
            </span>
          </div>
          <div style={{ fontSize: 9.5, color: 'var(--ink-3)', marginTop: 4 }}>{s.type} · {s.distance}km · {s.address}</div>
          <div style={{ display: 'flex', gap: 5, marginTop: 7, flexWrap: 'wrap' }}>
            {s.tags.map((t) => <span key={t} className="p-pill p-pill-line" style={{ height: 20, fontSize: 8.5 }}>{t}</span>)}
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
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        <span className="p-pill p-pill-line">{tide.type}</span>
        <span className="p-pill p-pill-lime">{tide.name}</span>
        <span className="p-pill p-pill-line">潮差 {tide.tideRange}m</span>
      </div>
      {tide.tides.map((t, i) => (
        <div key={i} style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 14px', marginBottom: 8, borderRadius: 14,
          background: t.type === '高潮' ? 'var(--lime-soft)' : 'var(--surface-2)',
        }}>
          <span style={{ fontSize: 12.5, fontWeight: 700 }}>{t.type} {t.time}</span>
          <span style={{ fontSize: 10.5, color: 'var(--ink-2)' }}>潮高 {t.height}m</span>
        </div>
      ))}
      <p style={{ fontSize: 10, color: 'var(--ink-3)', lineHeight: 1.8, marginTop: 6 }}>{tide.advice}。内河航道以水文站实时数据为准。</p>
    </div>
  );
}
