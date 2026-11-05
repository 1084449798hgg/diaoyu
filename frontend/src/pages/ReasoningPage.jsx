import React, { useEffect, useMemo, useState } from 'react';
import { api, todayStr } from '../api.js';
import { useToast } from '../store.jsx';
import { Sheet, Spinner } from '../components/ui.jsx';
import Icon from '../components/icons.jsx';

/**
 * 鱼情推理页 v5 —— 高级感「编辑式静奢 × 精密仪表」
 * 数据来自 /api/v1/forecast/reasoning（开源混合引擎 hybrid-v2）：
 *   气象层(7 因子) → 地理环境/水域层(8 项) → 合成计算链(6 步) → 结论
 * 三层推理链全部真实、可解释，非概念图。零 emoji，全线性图标。
 */

/* 后端语义图标名 → 本项目图标表 */
const ICON_MAP = {
  droplet: 'drop', thermometer: 'thermo', sparkles: 'sparkle', waves: 'water',
  gauge: 'gauge', trend: 'trend', wind: 'wind', cloud: 'cloud', clock: 'clock',
  moon: 'moon', layers: 'layers', sun: 'sun', pin: 'pin', target: 'target',
  locate: 'locate', sparkle: 'sparkle',
};
const ico = (n) => ICON_MAP[n] || n || 'info';

const pad2 = (n) => String(n).padStart(2, '0');
const hhmm = (h) => `${pad2(h)}:00`;

/* ---------------- 视觉原子 ---------------- */

/** 章节标题：超大淡编号 + 中文衬线 + 英文 eyebrow */
function SectionHead({ no, label, en, note, rise = 1 }) {
  return (
    <div className={`rs-sechead rs-rise rs-rise-${rise}`}>
      <span className="rs-sec-no">{no}</span>
      <div className="rs-sec-txt">
        <div className="rs-sec-en">{en}</div>
        <div className="rs-sec-label">{label}</div>
      </div>
      {note && <div className="rs-sec-note">{note}</div>}
    </div>
  );
}

/** 因子权重条：黄绿重点睛，墨黑主值 */
function FactorBar({ score, max = 100, tone = 'ink' }) {
  return (
    <div className="rs-bar">
      <div className={`rs-bar-fill ${tone === 'lime' ? 'lime' : ''}`} style={{ width: `${Math.max(0, Math.min(100, score))}%` }} />
    </div>
  );
}

/** 气象层因子条目 */
function FactorRow({ step, idx }) {
  return (
    <div className={`rs-factor rs-rise rs-rise-${Math.min(idx + 2, 6)}`}>
      <div className="rs-factor-top">
        <span className="rs-factor-ico"><Icon name={ico(step.icon)} size={15} strokeWidth={1.7} /></span>
        <span className="rs-factor-name">{step.label}</span>
        <span className="rs-factor-en">{step.en}</span>
        <span className="rs-factor-w">w{step.weight}</span>
        <span className="rs-factor-score">{step.score}</span>
      </div>
      <FactorBar score={step.score} tone={step.score >= 80 ? 'lime' : 'ink'} />
      <div className="rs-factor-reason">{step.reason}</div>
    </div>
  );
}

/** 推理链步骤（垂直时间线） */
function ChainStep({ step, idx, last }) {
  return (
    <div className={`rs-chain-step rs-rise rs-rise-${Math.min(idx + 1, 6)}`}>
      <div className="rs-chain-rail">
        <span className="rs-chain-dot"><Icon name={ico(step.icon)} size={13} strokeWidth={1.8} /></span>
        {!last && <span className="rs-chain-line" />}
      </div>
      <div className="rs-chain-body">
        <div className="rs-chain-top">
          <span className="rs-chain-en">{step.en}</span>
          {step.value && <span className="rs-chain-val">{step.value}</span>}
        </div>
        <div className="rs-chain-label">{step.label}</div>
        <div className="rs-chain-reason">{step.reason}</div>
      </div>
    </div>
  );
}

/** 逐小时曲线（SVG 折线 + 面积，标注黄金窗口） */
function HourCurve({ hourly, windows }) {
  if (!hourly?.length) return null;
  const W = 320, H = 92, padX = 6, padY = 10;
  const pts = hourly.map((h, i) => ({
    x: padX + (i / (hourly.length - 1)) * (W - padX * 2),
    y: H - padY - (h.Hs / 100) * (H - padY * 2),
    hour: h.hour, score: h.Hs,
  }));
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = `${line} L${pts[pts.length - 1].x.toFixed(1)},${H - padY} L${pts[0].x.toFixed(1)},${H - padY} Z`;
  const winHours = new Set();
  (windows || []).forEach((w) => { for (let h = w.start; h <= w.end; h++) winHours.add(h); });
  const peak = pts.reduce((a, b) => (b.score > a.score ? b : a), pts[0]);
  return (
    <div className="rs-curve">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H}>
        <defs>
          <linearGradient id="rsArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0d1a15" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#0d1a15" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 4, 8, 12, 16, 20, 23].map((h) => {
          const x = padX + (h / 23) * (W - padX * 2);
          return <line key={h} x1={x} y1={padY} x2={x} y2={H - padY} stroke="var(--hair)" strokeWidth="1" />;
        })}
        {(windows || []).map((w, i) => {
          const x1 = padX + (w.start / 23) * (W - padX * 2);
          const x2 = padX + (w.end / 23) * (W - padX * 2);
          return <rect key={i} x={x1} y={padY} width={Math.max(2, x2 - x1)} height={H - padY * 2} fill="#d8f84f" opacity="0.28" rx="2" />;
        })}
        <path d={area} fill="url(#rsArea)" />
        <path d={line} fill="none" stroke="#0d1a15" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={peak.x} cy={peak.y} r="3.6" fill="#c4ea25" stroke="#0d1a15" strokeWidth="1.4" />
      </svg>
      <div className="rs-curve-axis">
        <span>00</span><span>04</span><span>08</span><span>12</span><span>16</span><span>20</span><span>23</span>
      </div>
    </div>
  );
}

/* ---------------- 主页面 ---------------- */
export default function ReasoningPage({ onClose }) {
  const { showToast } = useToast();
  const [speciesList, setSpeciesList] = useState([]);
  const [spotsList, setSpotsList] = useState([]);
  const [species, setSpecies] = useState('鲫鱼');
  const [spotId, setSpotId] = useState(1);
  const [date, setDate] = useState(todayStr(0));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [picker, setPicker] = useState(null); // 'species' | 'spot' | 'source'

  useEffect(() => {
    api.species().then((d) => setSpeciesList(d.items || [])).catch(() => {});
    api.spots({ lng: 119.05, lat: 29.6, radius: 40000 }).then((d) => setSpotsList(d.spots || [])).catch(() => {});
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.forecastReasoning({ spotId, date, species })
      .then((d) => { if (alive) { setData(d); setLoading(false); } })
      .catch((e) => { if (alive) { setLoading(false); showToast(e.message || '推理计算失败', 'error'); } });
    return () => { alive = false; };
  }, [spotId, date, species, showToast]);

  const c = data?.conclusion;
  const place = data?.place;
  const layers = data?.layers || [];
  const spot = spotsList.find((s) => s.id === spotId);

  return (
    <div className="page rs-page">
      {/* 顶栏 */}
      <div className="rs-topbar rs-rise">
        <button className="rs-back" onClick={onClose} aria-label="返回"><Icon name="left" size={19} /></button>
        <div className="rs-brand">
          <span className="rs-brand-cn">鱼情推理</span>
          <span className="rs-brand-en">FISH ACTIVITY INTELLIGENCE</span>
        </div>
        <button className="rs-src" onClick={() => setPicker('source')} aria-label="算法来源"><Icon name="info" size={17} /></button>
      </div>

      {loading && !data && <div className="rs-loading"><Spinner /><div className="rs-loading-txt">正在推演气象 · 地理 · 水域…</div></div>}

      {data && c && (
        <>
          {/* ============ 墨绿 Hero ============ */}
          <section className="rs-hero rs-rise rs-rise-1">
            <div className="rs-hero-grid" />
            <div className="rs-hero-top">
              <span className="rs-hero-eyebrow"><Icon name="target" size={12} /> HYBRID REASONER · v2</span>
              <span className="rs-hero-date">{data.date}</span>
            </div>
            <div className="rs-hero-place">
              <Icon name="pin" size={12} /> {place?.city || '钓点'} · {place?.name}
            </div>
            <div className="rs-hero-main">
              <div className="rs-hero-score">{c.score}<span className="rs-hero-slash">/100</span></div>
              <div className="rs-hero-level">
                <b>{c.level}</b>
                <em>{c.levelEn}</em>
              </div>
            </div>
            <div className="rs-hero-desc">{c.levelText}</div>
            <div className="rs-hero-rule" />
            <div className="rs-hero-meta">
              <div><span>水温</span><b>{data.advice?.waterTemp}°</b></div>
              <div><span>季节</span><b>{data.advice?.season}</b></div>
              <div><span>水域</span><b>{place?.waterType}</b></div>
              <div><span>水深</span><b>{place?.depth}</b></div>
            </div>
            <div className="rs-hero-watermark">{place?.waterTypeEn || 'WATER'}</div>
          </section>

          {/* 顶部筛选条 */}
          <div className="rs-filter rs-rise rs-rise-2">
            <button onClick={() => setPicker('spot')}><Icon name="pin" size={12} />{spot?.name || place?.name || '选择钓点'}<Icon name="chevronDown" size={11} /></button>
            <button onClick={() => setPicker('species')}><Icon name="fish" size={12} />{species}<Icon name="chevronDown" size={11} /></button>
            <button onClick={() => showToast('推理基于所选日期的逐小时气象数据', 'info')}><Icon name="calendar" size={12} />{date.slice(5)}</button>
          </div>

          {/* ============ 黄金窗口 ============ */}
          <SectionHead no="G" label="黄金窗口" en="PRIME WINDOWS" note={`${c.bestWindows?.length || 0} 段`} rise={3} />
          <div className="rs-windows rs-rise rs-rise-3">
            {(c.bestWindows || []).map((w, i) => (
              <div className="rs-win" key={i}>
                <div className="rs-win-idx">0{i + 1}</div>
                <div className="rs-win-time"><b>{pad2(w.start)}:00</b><em>—</em><b>{pad2(w.end)}:00</b></div>
                <div className="rs-win-foot">
                  <b>{w.score} 分</b>
                  {w.tag && <em className="rs-win-tag">{w.tag}</em>}
                </div>
                {i === 0 && <div className="rs-win-best">BEST</div>}
              </div>
            ))}
            {(!c.bestWindows || c.bestWindows.length === 0) && <div className="rs-empty">全天鱼口偏弱，建议改天</div>}
          </div>

          {/* 逐小时曲线 */}
          <div className="rs-curve-card rs-rise rs-rise-4">
            <div className="rs-curve-head">
              <div><b>逐小时鱼口</b><span>HOURLY ACTIVITY</span></div>
              <div className="rs-legend"><i className="lime" />黄金窗口 <i className="ink" />平滑分</div>
            </div>
            <HourCurve hourly={data.hourly} windows={c.bestWindows} />
          </div>

          {/* 安全提示 */}
          {c.safety?.length > 0 && (
            <div className="rs-safety rs-rise rs-rise-4">
              <Icon name="alertTriangle" size={15} />
              <div>{c.safety.join('；')}</div>
            </div>
          )}

          {/* ============ 三层推理链 ============ */}
          {layers.map((layer, li) => (
            <React.Fragment key={layer.key}>
              <SectionHead no={layer.no} label={layer.label} en={layer.en} note={layer.summary} rise={1 + li} />
              <div className="rs-layer rs-rise rs-rise-2">
                {layer.key === 'meteorology' && (
                  <div className="rs-factors">
                    {layer.steps.map((s, i) => <FactorRow key={s.key} step={s} idx={i} />)}
                    <div className="rs-layer-foot">七项气象因子按 25/20/15/10/10/10/5 加权，逐项打分后合成</div>
                  </div>
                )}
                {(layer.key === 'geography' || layer.key === 'synthesis') && (
                  <div className="rs-chain">
                    {layer.steps.map((s, i) => (
                      <ChainStep key={s.key} step={s} idx={i} last={i === layer.steps.length - 1} />
                    ))}
                  </div>
                )}
              </div>
            </React.Fragment>
          ))}

          {/* ============ 出钓建议 ============ */}
          <SectionHead no="→" label="出钓建议" en="FIELD NOTES" note="规则生成 · 不编造" rise={1} />
          <div className="rs-advice rs-rise rs-rise-2">
            {[
              { k: '水层', en: 'DEPTH / LAYER', v: data.advice?.layer, icon: 'layers' },
              { k: '钓位', en: 'POSITION', v: data.advice?.position, icon: 'locate' },
              { k: '饵型', en: 'BAIT', v: data.advice?.bait, icon: 'drop' },
              { k: '地形', en: 'TERRAIN', v: data.advice?.terrain, icon: 'water' },
            ].map((a) => (
              <div className="rs-advice-row" key={a.k}>
                <span className="rs-advice-ico"><Icon name={ico(a.icon)} size={15} /></span>
                <div className="rs-advice-txt">
                  <div className="rs-advice-en">{a.en}</div>
                  <div className="rs-advice-k">{a.k}</div>
                  <div className="rs-advice-v">{a.v}</div>
                </div>
              </div>
            ))}
          </div>

          {/* 来源署名 */}
          <button className="rs-attr rs-rise rs-rise-3" onClick={() => setPicker('source')}>
            <span>基于 3 个开源算法 · 查看来源与许可</span>
            <Icon name="right" size={13} />
          </button>
          <div className="rs-disclaimer">{data.disclaimer}</div>
        </>
      )}

      {/* ============ 选择器 Sheet ============ */}
      <Sheet open={picker === 'species'} title="选择目标鱼种" onClose={() => setPicker(null)}>
        <div className="rs-pick">
          {(speciesList.length ? speciesList.map((s) => (typeof s === 'string' ? s : s.species || s.name)) : ['鲫鱼', '鲤鱼', '草鱼', '翘嘴', '鲢鳙']).map((n) => (
            <button key={n} className={species === n ? 'on' : ''} onClick={() => { setSpecies(n); setPicker(null); }}>
              <Icon name="fish" size={15} />{n}{species === n && <Icon name="check" size={14} />}
            </button>
          ))}
        </div>
      </Sheet>
      <Sheet open={picker === 'spot'} title="选择钓点" onClose={() => setPicker(null)}>
        <div className="rs-pick">
          {(spotsList.length ? spotsList : [{ id: 1, name: '千岛湖中心湖区钓场' }]).map((s) => (
            <button key={s.id} className={spotId === s.id ? 'on' : ''} onClick={() => { setSpotId(s.id); setPicker(null); }}>
              <Icon name="pin" size={15} />{s.name}{spotId === s.id && <Icon name="check" size={14} />}
            </button>
          ))}
        </div>
      </Sheet>
      <Sheet open={picker === 'source'} title="算法来源与许可" onClose={() => setPicker(null)}>
        <div className="rs-sources">
          <p className="rs-sources-lead">本页鱼情结论由开源混合推理引擎 <b>hybrid-v2</b> 计算：气象 → 地理环境/水域 → 鱼情结论，每一步都给出可解释的中文理由。</p>
          {(data?.attribution || []).map((a) => (
            <div className="rs-source" key={a.name}>
              <div className="rs-source-top"><b>{a.name}</b><em>{a.license}</em></div>
              <div className="rs-source-use">{a.use}</div>
              <div className="rs-source-url">{a.url}</div>
            </div>
          ))}
          <div className="rs-sources-foot">天文计算（日出日落 / 月相 / 月中天 / 月出月落）按钓点经纬度本地推算，无需外部 API。</div>
        </div>
      </Sheet>
    </div>
  );
}
