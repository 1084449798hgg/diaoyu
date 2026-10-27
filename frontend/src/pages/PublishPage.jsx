import React, { useEffect, useState, useRef } from 'react';
import { api } from '../api.js';
import { useToast } from '../store.jsx';
import { Segmented } from '../components/ui.jsx';
import Icon from '../components/icons.jsx';

const USER_LNG = 119.05;
const USER_LAT = 29.6;

const SPECIES_POOL = ['鲫鱼', '鲤鱼', '草鱼', '翘嘴', '鲢鳙', '罗非鱼'];
const BAIT_TAGS = ['蚯蚓', '红虫', '玉米', '酒米', '商品饵', '亮片', '泥鳅', '蚂蚱'];

/**
 * 拍照发布流程（≤3 步）：
 * Step1 拍照/选图 → 自动识别鱼种（失败可手动）
 * Step2 关联钓点
 * Step3 饵料标签 + 正文 → 发布
 */
export default function PublishPage({ onClose, onPublished }) {
  const showToast = useToast();
  const [step, setStep] = useState(1);
  const [spots, setSpots] = useState([]);
  const [imageUrl, setImageUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [recognizing, setRecognizing] = useState(false);
  const [recognized, setRecognized] = useState(null); // { species } | { failed: true }
  const [form, setForm] = useState({ spotId: '', fishSpecies: '', weightKg: '', bait: [], content: '' });
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    api.spots({ lng: USER_LNG, lat: USER_LAT, radius: 40000 })
      .then((d) => setSpots(d.spots.filter((s) => !s.banned)))
      .catch(() => {});
  }, []);

  async function pickFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return showToast('图片不能超过 5MB', 'error');
    setUploading(true);
    try {
      const res = await api.upload(file);
      setImageUrl(res.url);
      runRecognize();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setUploading(false);
    }
  }

  /** 模拟鱼种识别（v1.1 上模型，当前规则版） */
  function runRecognize() {
    setRecognizing(true);
    setRecognized(null);
    setTimeout(() => {
      const failed = Math.random() < 0.15; // 15% 概率识别失败 → 手动选择
      const guess = SPECIES_POOL[Math.floor(Math.random() * SPECIES_POOL.length)];
      setRecognized(failed ? { failed: true } : { species: guess });
      setForm((f) => ({ ...f, fishSpecies: failed ? '' : guess }));
      setRecognizing(false);
      if (failed) showToast('识别失败，请手动选择鱼种', 'error');
    }, 1200);
  }

  function toggleBait(b) {
    setForm((f) => ({
      ...f,
      bait: f.bait.includes(b) ? f.bait.filter((x) => x !== b) : [...f.bait, b],
    }));
  }

  async function submit() {
    if (!form.fishSpecies) return showToast('请选择鱼种', 'error');
    setSubmitting(true);
    try {
      await api.publishCatch({
        spotId: form.spotId ? Number(form.spotId) : null,
        fishSpecies: form.fishSpecies,
        weightKg: form.weightKg ? Number(form.weightKg) : null,
        bait: form.bait.join('+') || null,
        content: form.content || null,
        imageUrls: imageUrl ? [imageUrl] : [],
        visibility: 'public',
      });
      showToast('发布成功！+5 鱼石', 'success');
      onPublished();
    } catch (e) {
      showToast(e.message, 'error');
      if (e.status === 422) {
        // 审核拦截：保留在第 3 步让用户修改
      }
    } finally {
      setSubmitting(false);
    }
  }

  const canNext1 = !!imageUrl || true; // 允许纯文字动态，但引导上传

  return (
    <div className="page">
      <div className="topbar">
        <button className="muted" style={{ fontSize: 13 }} onClick={step === 1 ? onClose : () => setStep(step - 1)}>
          {step === 1 ? '✕ 取消' : '‹ 上一步'}
        </button>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div className="topbar-title" style={{ fontSize: 16 }}>发布渔获</div>
        </div>
        <span className="muted" style={{ fontSize: 12 }}>{step} / 3</span>
      </div>

      {/* 步骤条 */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {['拍照', '钓点/鱼种', '饵料/正文'].map((t, i) => (
          <div key={t} style={{ flex: 1 }}>
            <div style={{
              height: 4, borderRadius: 2,
              background: i < step ? 'var(--lime-deep)' : 'var(--hair)',
            }} />
            <div style={{ fontSize: 10.5, marginTop: 5, color: i < step ? 'var(--ink)' : 'var(--ink-3)' }}>{t}</div>
          </div>
        ))}
      </div>

      {/* Step 1：拍照上传 + 识别 */}
      {step === 1 && (
        <div className="card">
          <h3 className="card-title">第 1 步 · 拍照上传</h3>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={pickFile} />
          <button
            onClick={() => fileRef.current?.click()}
            style={{
              width: '100%', aspectRatio: '4 / 3', borderRadius: 18, border: '1.5px dashed #d5dccd',
              background: 'var(--surface-2)', display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--ink-3)',
            }}
          >
            {uploading ? (
              <><div className="spinner" style={{ margin: 0 }} />上传中…</>
            ) : imageUrl ? (
              <img src={imageUrl} alt="渔获" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 12 }} />
            ) : (
              <>
                <span style={{ width: 54, height: 54, borderRadius: 999, background: '#fff', border: '1px solid var(--hair)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-2)' }}>
                  <Icon name="camera" size={22} />
                </span>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)' }}>点击拍照 / 从相册选择</span>
                <span style={{ fontSize: 10 }}>自动压缩至 1MB 内（JPEG 80%）</span>
              </>
            )}
          </button>

          {recognizing && (
            <div style={{ marginTop: 14, textAlign: 'center', fontSize: 13, color: 'var(--text-2)' }}>
              <div className="spinner" style={{ margin: '0 auto 8px' }} />
              正在识别鱼种…
            </div>
          )}

          {recognized && !recognized.failed && (
            <div style={{
              marginTop: 14, background: 'var(--lime-soft)', border: '1px solid #dcecab',
              borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontSize: 18 }}>🎯</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: '#4d6318' }}>识别结果：{recognized.species}</div>
                <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>下一步可修改</div>
              </div>
              <button className="chip" onClick={runRecognize}>重新识别</button>
            </div>
          )}

          {recognized?.failed && (
            <div style={{
              marginTop: 14, background: 'var(--orange-soft)', border: '1px solid #ffe0c7',
              borderRadius: 12, padding: '10px 14px', fontSize: 11.5, color: '#a34a00',
            }}>
              ⚠️ 识别失败，不影响发布 —— 下一步手动选择鱼种即可
            </div>
          )}

          <button className="btn btn-primary btn-block" style={{ marginTop: 16 }}
            disabled={!imageUrl || recognizing} onClick={() => setStep(2)}>
            下一步：关联钓点
          </button>
          <button className="btn btn-ghost btn-block" style={{ marginTop: 8, fontSize: 12.5 }}
            onClick={() => { setImageUrl(''); setRecognized(null); setStep(2); }}>
            跳过图片，发布纯文字动态
          </button>
        </div>
      )}

      {/* Step 2：钓点 + 鱼种 */}
      {step === 2 && (
        <div className="card">
          <h3 className="card-title">第 2 步 · 关联钓点与鱼种</h3>
          <div className="field">
            <label className="field-label">钓点（可选）</label>
            <select className="input" value={form.spotId} onChange={(e) => setForm({ ...form, spotId: e.target.value })}>
              <option value="">不关联钓点</option>
              {spots.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="field-label">鱼种 {recognized?.species && <span style={{ color: 'var(--green)', fontSize: 11 }}>（已自动识别，可修改）</span>}</label>
            <div className="chip-row" style={{ flexWrap: 'wrap' }}>
              {SPECIES_POOL.map((sp) => (
                <button key={sp} className={`chip ${form.fishSpecies === sp ? 'active' : ''}`}
                  onClick={() => setForm({ ...form, fishSpecies: sp })}>{sp}</button>
              ))}
            </div>
          </div>
          <div className="field">
            <label className="field-label">单尾重量（kg，选填，用于「最大单尾」战绩）</label>
            <input className="input" type="number" min="0" step="0.01" placeholder="如：1.25"
              value={form.weightKg} onChange={(e) => setForm({ ...form, weightKg: e.target.value })} />
          </div>
          <button className="btn btn-primary btn-block" style={{ marginTop: 8 }}
            disabled={!form.fishSpecies} onClick={() => setStep(3)}>
            下一步：饵料与正文
          </button>
        </div>
      )}

      {/* Step 3：饵料 + 正文 + 发布 */}
      {step === 3 && (
        <div className="card">
          <h3 className="card-title">第 3 步 · 饵料标签与正文</h3>
          <div className="field">
            <label className="field-label">饵料标签（可多选）</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {BAIT_TAGS.map((b) => (
                <button key={b} className={`chip ${form.bait.includes(b) ? 'active' : ''}`} onClick={() => toggleBait(b)}>{b}</button>
              ))}
            </div>
          </div>
          <div className="field">
            <label className="field-label">正文（选填）</label>
            <textarea className="input" placeholder="分享今天的鱼口、天气感受…" value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })} />
          </div>

          {imageUrl && (
            <div style={{ borderRadius: 12, overflow: 'hidden', marginBottom: 12 }}>
              <img src={imageUrl} alt="" style={{ width: '100%', maxHeight: 220, objectFit: 'cover', display: 'block' }} />
            </div>
          )}

          <div className="muted" style={{ fontSize: 11.5, lineHeight: 1.7, marginBottom: 12 }}>
            发布前将通过内容安全审核：高风险内容直接拦截；图片异常进入人工复核队列。请遵守社区公约，禁止发布违规内容。
          </div>

          <button className="btn btn-primary btn-block" disabled={submitting} onClick={submit}>
            {submitting ? '发布中…' : '🚀 发布渔获'}
          </button>
        </div>
      )}
    </div>
  );
}
