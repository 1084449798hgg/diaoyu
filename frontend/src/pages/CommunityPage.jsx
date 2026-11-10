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

// 双列瀑布流：错落的媒体高度（不依赖是否有实拍图），BODY_EST 为信息区估算高度
const MEDIA_H = [140, 116, 152, 128, 146, 120, 150, 132];
const BODY_EST = 112;

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

function fmtTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
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
  const [detail, setDetail] = useState(null);

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
    // 综合热度：点赞 + 评论 + 重量，用于「推荐」的个性化排序
    const hot = (c) => (c.likesCount || 0) * 2 + (c.commentsCount || 0) * 3 + (c.weightKg || 0) * 3;
    const byTime = (a, b) => new Date(b.createdAt) - new Date(a.createdAt);
    if (tab === '推荐') list.sort((a, b) => hot(b) - hot(a) || byTime(a, b));
    if (tab === '最新') list.sort(byTime);
    if (tab === '热门') list.sort((a, b) => (b.likesCount || 0) - (a.likesCount || 0) || byTime(a, b));
    if (tab === '晒单') {
      // 只显示带图的动态；演示数据里部分动态无实拍图，因此筛选真实生效
      list = list.filter((c) => (c.imageUrls || []).length > 0);
      list.sort((a, b) => (b.commentsCount || 0) - (a.commentsCount || 0) || byTime(a, b));
    }
    return list;
  }, [items, tab]);

  // 显式两列：按「媒体高度 + 信息区估算高度」贪心放入当前较矮的一列。
  // 不再用 CSS columnCount —— 部分移动端浏览器（iOS Safari）对「多列 + 懒加载
  // 图片 + break-inside:avoid」会算错分栏，把卡片信息区裁掉、右列留大片空白。
  const columns = useMemo(() => {
    const cols = [[], []];
    const heights = [0, 0];
    shown.forEach((c, idx) => {
      const h = MEDIA_H[idx % MEDIA_H.length];
      const k = heights[0] <= heights[1] ? 0 : 1;
      cols[k].push({ c, idx, h });
      heights[k] += h + BODY_EST + 10;
    });
    return cols;
  }, [shown]);

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
          {filter?.spotId && <button className="p-pill p-pill-line" style={{ height: 22, marginLeft: 6, fontSize: 9 }} onClick={onClearFilter}>清除筛选 <Icon name="x" size={9} strokeWidth={2.2} /></button>}
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
      {!loading && shown.length === 0 && <Empty text="这个分类下还没有动态" icon="fish" />}

      {/* 双列瀑布流：显式 flex 两列 + 贪心配平 */}
      {!loading && shown.length > 0 && (
        <div className="cm-columns">
          {columns.map((col, ci) => (
            <div className="cm-col" key={ci}>
              {col.map(({ c, idx, h }) => (
                <article
                  key={c.id}
                  className="cm-card cm-card-tap"
                  role="button"
                  tabIndex={0}
                  aria-label={`查看 ${c.fishSpecies || '渔获'} 的详细信息`}
                  onClick={() => setDetail(c)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDetail(c); } }}
                >
                  <div className="cm-media">
                    <CardMedia c={c} h={h} seed={idx} />
                    <div className="cm-badges-l">
                      <span className="cm-mini-fish"><Icon name="fish" size={12} strokeWidth={1.8} /></span>
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
                        <button className={`cm-act ${c.liked ? 'liked' : ''}`} onClick={(e) => { e.stopPropagation(); toggleLike(c); }}>
                          <Icon name="heart" size={11} strokeWidth={2} fill={c.liked ? 'currentColor' : 'none'} />{c.likesCount}
                        </button>
                        <button className="cm-act" onClick={(e) => { e.stopPropagation(); openComments(c); }}>
                          <Icon name="comment" size={11} strokeWidth={2} />{c.commentsCount}
                        </button>
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 6, fontSize: 8.5, color: 'var(--ink-3)' }}>
                      <Icon name="pin" size={9} strokeWidth={1.9} />
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.spotName || '杭州市'} · {timeAgo(c.createdAt)}</span>
                      <button onClick={(e) => { e.stopPropagation(); report(c); }} style={{ color: 'var(--ink-3)', opacity: .6 }}>举报</button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ))}
        </div>
      )}

      <p style={{ fontSize: 9.5, color: 'var(--ink-3)', textAlign: 'center', margin: '16px 0 4px' }}>
        共 {total} 条渔获 · 友善交流，理性晒图
      </p>

      {/* 渔获详情：补齐卡片上省略的完整信息 */}
      <Sheet open={!!detail} title={detail ? `${detail.fishSpecies} · 渔获详情` : ''} onClose={() => setDetail(null)}>
        {detail && (
          <div className="cm-detail">
            <div className="cm-detail-stage">
              <FishArt species={detail.fishSpecies} height={164} />
              <div className="cm-detail-no">NO. {String(detail.id).padStart(3, '0')}</div>
            </div>
            <div className="cm-detail-head">
              <b>{detail.fishSpecies}</b>
              <span>{detail.weightKg != null ? `${detail.weightKg} kg` : '重量未记录'}</span>
            </div>
            <div className="cm-detail-grid">
              {[
                ['钓法', 'METHOD', methodLabel(detail), 'target'],
                ['饵料', 'BAIT', detail.bait || '未记录', 'drop'],
                ['钓点', 'SPOT', detail.spotName || '—', 'pin'],
                ['时间', 'TIME', fmtTime(detail.createdAt), 'clock'],
                ['钓友', 'ANGLER', detail.nickname || '钓友', 'user'],
                ['钓获', 'CATCH', `${detail.fishCount || 1} 尾`, 'fish'],
              ].map(([k, en, v, ico]) => (
                <div className="cm-detail-cell" key={k}>
                  <span className="cm-detail-ico"><Icon name={ico} size={14} /></span>
                  <div><em>{en}</em><b>{k}</b><strong>{v}</strong></div>
                </div>
              ))}
            </div>
            <div className="cm-detail-note">
              <div className="cm-detail-note-h"><Icon name="book" size={13} /> 钓获手记</div>
              <p>{detail.content || '这条渔获还没有文字记录。'}</p>
            </div>
            <div className="cm-detail-stats">
              <span><Icon name="heart" size={13} /> {detail.likesCount ?? 0} 赞</span>
              <span><Icon name="comment" size={13} /> {detail.commentsCount ?? 0} 评论</span>
              <span><Icon name="flame" size={13} /> 热度 {hotIndex(detail)}</span>
            </div>
            <div className="cm-detail-acts">
              <button onClick={() => toggleLike(detail)}>
                <Icon name="heart" size={14} fill={detail.liked ? 'currentColor' : 'none'} /> {detail.liked ? '已点赞' : '点赞'}
              </button>
              <button onClick={() => { setDetail(null); openComments(detail); }}>
                <Icon name="comment" size={14} /> 查看评论
              </button>
            </div>
          </div>
        )}
      </Sheet>

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

/** 钓法按饵料 / 鱼种推断，不再按「重量 > 2kg」误判成海钓 */
function methodLabel(c) {
  const bait = c.bait || '';
  const sp = c.fishSpecies || '';
  if (c.baitType === '假饵' || /亮片|米诺|软虫|假饵|VIB|铁板|铅笔/.test(bait)) return '路亚';
  if (/海|鲳|鲑|石斑|鲷/.test(sp)) return '海钓';
  if (/翘嘴|鲌|鲈|鳜|黑鱼|鳡/.test(sp) && /泥鳅|活饵|虾|亮片/.test(bait)) return '路亚';
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
