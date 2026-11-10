import React, { useState } from 'react';
import { Sheet } from '../components/ui.jsx';
import Icon from '../components/icons.jsx';
import { FISH_ATLAS, FISH_GROUPS } from '../fishAtlas.js';

/**
 * 鱼种图鉴 v6 —— 写实标本图 + 编辑式静奢排版
 * 图片由用户提供（透明底 WebP），文字为通识整理，零 emoji、全线性图标。
 */

const pad2 = (n) => String(n).padStart(2, '0');

function SpecimenCard({ fish, idx, onOpen }) {
  return (
    <button className="fa-card fa-rise" onClick={onOpen} aria-label={`查看 ${fish.name} 详情`}>
      <div className="fa-card-stage">
        <div className="fa-card-grid" />
        <div className="fa-card-no">SPECIMEN <b>{pad2(idx + 1)}</b> / {pad2(FISH_ATLAS.length)}</div>
        <div className="fa-card-en">{fish.en}</div>
        <img src={fish.img} alt={fish.name} loading="lazy" decoding="async" />
        <div className="fa-card-group">{fish.group === 'freshwater' ? 'FRESHWATER' : 'MIGRATORY / SEA'}</div>
      </div>
      <div className="fa-card-body">
        <div className="fa-card-name">
          <b>{fish.name}</b>
          <Icon name="right" size={15} className="fa-card-arrow" />
        </div>
        <div className="fa-card-latin">{fish.latin}</div>
        <div className="fa-card-alias">{fish.alias}</div>
        <div className="fa-card-tags">
          {fish.tags.map((t) => <span key={t}>{t}</span>)}
        </div>
        <div className="fa-card-stats">
          <div><span>适温</span><b>{fish.temp}</b></div>
          <div><span>水层</span><b>{fish.layer}</b></div>
          <div><span>食性</span><b>{fish.diet.split(' · ')[0]}</b></div>
        </div>
      </div>
    </button>
  );
}

export default function FishAtlasPage({ onClose }) {
  const [group, setGroup] = useState('all');
  const [detail, setDetail] = useState(null);
  const [source, setSource] = useState(false);

  const list = group === 'all' ? FISH_ATLAS : FISH_ATLAS.filter((f) => f.group === group);
  const fwCount = FISH_ATLAS.filter((f) => f.group === 'freshwater').length;

  return (
    <div className="page fa-page">
      {/* 顶栏 */}
      <div className="fa-topbar fa-rise">
        <button className="fa-back" onClick={onClose} aria-label="返回"><Icon name="left" size={19} /></button>
        <div className="fa-brand">
          <span className="fa-brand-cn">鱼种图鉴</span>
          <span className="fa-brand-en">FISH ATLAS · ILLUSTRATED</span>
        </div>
        <button className="fa-info" onClick={() => setSource(true)} aria-label="素材与说明"><Icon name="info" size={17} /></button>
      </div>

      {/* 墨绿 Hero */}
      <section className="fa-hero fa-rise">
        <div className="fa-hero-grid" />
        <div className="fa-hero-eyebrow"><Icon name="book" size={12} /> FIELD GUIDE · VOL. 01</div>
        <h1 className="fa-hero-title">见鱼，<br />知其性。</h1>
        <div className="fa-hero-sub">淡水与洄游鱼类的形态标本<br />从适温、水层到钓法，一眼看懂</div>
        <div className="fa-hero-count"><b>{pad2(FISH_ATLAS.length)}</b><span>SPECIES<br />ILLUSTRATED</span></div>
        <img className="fa-hero-fish" src="/fish/sturgeon.webp" alt="鲟鱼标本" />
        <div className="fa-hero-watermark">ICHTHYOLOGY</div>
      </section>

      {/* 分类筛选 */}
      <div className="fa-seg fa-rise" role="tablist" aria-label="鱼种分类">
        {FISH_GROUPS.map((g) => (
          <button
            key={g.key}
            role="tab"
            aria-selected={group === g.key}
            className={group === g.key ? 'on' : ''}
            onClick={() => setGroup(g.key)}
          >
            {g.label}
            <em>{g.key === 'all' ? FISH_ATLAS.length : g.key === 'freshwater' ? fwCount : FISH_ATLAS.length - fwCount}</em>
          </button>
        ))}
      </div>

      <div className="fa-list-head fa-rise">
        <div><b>标本陈列</b><span>SPECIMEN INDEX</span></div>
        <em>共 {list.length} 种</em>
      </div>

      {/* 标本卡列表 */}
      <div className="fa-list">
        {list.map((f, i) => (
          <SpecimenCard key={f.id} fish={f} idx={FISH_ATLAS.indexOf(f)} onOpen={() => setDetail(f)} />
        ))}
      </div>

      <div className="fa-foot fa-rise">
        <Icon name="leaf" size={14} />
        <span>理性垂钓 · 遵守当地禁渔期与保护物种规定 · 留大放小</span>
      </div>
      <button className="fa-attr fa-rise" onClick={() => setSource(true)}>
        <span>图片素材由用户提供 · 查看说明</span>
        <Icon name="right" size={13} />
      </button>

      {/* 详情 Sheet */}
      <Sheet open={!!detail} title={detail ? `${detail.name} · ${detail.en}` : ''} onClose={() => setDetail(null)}>
        {detail && (
          <div className="fa-detail">
            <div className="fa-detail-stage">
              <div className="fa-detail-grid" />
              <img src={detail.img} alt={detail.name} />
              <div className="fa-detail-no">NO. {pad2(FISH_ATLAS.indexOf(detail) + 1)}</div>
            </div>
            <div className="fa-detail-head">
              <b>{detail.name}</b>
              <span>{detail.latin}</span>
            </div>
            <div className="fa-detail-alias">又名 {detail.alias}</div>
            <div className="fa-detail-grid2">
              {[
                ['适温', 'TEMPERATURE', detail.temp, 'thermo'],
                ['栖息水层', 'DEPTH / LAYER', detail.layer, 'layers'],
                ['食性', 'DIET', detail.diet, 'drop'],
                ['常见水域', 'HABITAT', detail.habitat, 'water'],
                ['推荐钓法', 'METHOD', detail.method, 'target'],
                ['类别', 'GROUP', detail.group === 'freshwater' ? '淡水鱼' : '洄游 / 海水鱼', 'compass'],
              ].map(([k, en, v, ico]) => (
                <div className="fa-detail-cell" key={k}>
                  <span className="fa-detail-ico"><Icon name={ico} size={14} /></span>
                  <div><em>{en}</em><b>{k}</b><strong>{v}</strong></div>
                </div>
              ))}
            </div>
            <div className="fa-detail-note">
              <div className="fa-detail-note-head"><Icon name="book" size={13} /> 形态与习性</div>
              <p>{detail.note.replace(/\*\*/g, '')}</p>
            </div>
            {detail.id === 'sturgeon' && (
              <div className="fa-warn"><Icon name="alertTriangle" size={14} /> 野生鲟类多属国家重点保护动物，禁止垂钓，误捕须立即放流。</div>
            )}
            <div className="fa-detail-tags">{detail.tags.map((t) => <span key={t}>{t}</span>)}</div>
          </div>
        )}
      </Sheet>

      {/* 素材说明 Sheet */}
      <Sheet open={source} title="素材与说明" onClose={() => setSource(false)}>
        <div className="fa-sources">
          <p>本图鉴的 <b>{FISH_ATLAS.length} 张写实鱼图</b>由用户提供，经去除棋盘格背景、裁边后压为透明底 WebP，单张约 60–170 KB，尽量不拖慢移动端加载。</p>
          <p>文字部分（适温、水层、食性、钓法等）为常见鱼类知识整理，用于识别与垂钓参考，<b>不构成物种鉴定、食用或保护等级依据</b>；具体规定请以当地渔业主管部门公告为准。</p>
          <div className="fa-sources-rule">
            <div><Icon name="leaf" size={14} /> <b>理性垂钓</b><span>遵守禁渔期、禁渔区与最小可捕规格，留大放小。</span></div>
            <div><Icon name="shield" size={14} /> <b>保护物种</b><span>中华鲟等国家重点保护动物禁止垂钓，误捕立即放流。</span></div>
            <div><Icon name="image" size={14} /> <b>图片版权</b><span>素材由用户本人提供，仅用于本项目展示。</span></div>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
