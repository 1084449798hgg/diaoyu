import React, { useState } from 'react';
import { useAuth } from './store.jsx';
import HomePage from './pages/HomePage.jsx';
import FishingIndexPage from './pages/FishingIndexPage.jsx';
import CommunityPage from './pages/CommunityPage.jsx';
import MapPage from './pages/MapPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import PublishPage from './pages/PublishPage.jsx';
import ReasoningPage from './pages/ReasoningPage.jsx';
import FishAtlasPage from './pages/FishAtlasPage.jsx';
import Icon from './components/icons.jsx';

/** 5 Tab 结构：首页 / 天气 / 钓友圈 / 地图 / 我的 */
const TABS = [
  { key: 'home', label: '首页', icon: 'home' },
  { key: 'weather', label: '天气', icon: 'cloud' },
  { key: 'community', label: '钓友圈', icon: 'message' },
  { key: 'map', label: '地图', icon: 'pin' },
  { key: 'profile', label: '我的', icon: 'user' },
];

export default function App() {
  const [tab, setTab] = useState('home');
  // 已访问过的 Tab 保持挂载（CSS 隐藏而非卸载），切回时状态与滚动位置不丢
  const [visited, setVisited] = useState(['home']);
  const [publishing, setPublishing] = useState(false);
  const [reasoning, setReasoning] = useState(false);
  const [atlas, setAtlas] = useState(false);
  const [communityFilter, setCommunityFilter] = useState(null);
  const { user } = useAuth();

  const goTab = (key) => {
    setTab(key);
    setVisited((v) => (v.includes(key) ? v : [...v, key]));
  };

  if (!user) {
    return (
      <div className="phone-frame">
        <LoginScreen />
      </div>
    );
  }

  const goMap = (spot) => {
    setCommunityFilter(null);
    goTab('map');
    if (spot) {
      // 兼容首次挂载；已挂载时通过事件触发聚焦
      window.__pendingSpotFocus = spot;
      window.dispatchEvent(new CustomEvent('app:focusSpot', { detail: spot }));
    }
  };

  const pane = (key) => {
    switch (key) {
      case 'home':
        return (
          <HomePage
            onNavigateToMap={goMap}
            onNavigateToCommunity={() => { setCommunityFilter(null); goTab('community'); }}
            onNavigateToProfile={() => goTab('profile')}
            onPublish={() => setPublishing(true)}
            onOpenReasoning={() => setReasoning(true)}
            onOpenAtlas={() => setAtlas(true)}
          />
        );
      case 'weather':
        return <FishingIndexPage onNavigateToMap={() => goMap()} onOpenReasoning={() => setReasoning(true)} />;
      case 'community':
        return (
          <CommunityPage
            filter={communityFilter}
            onClearFilter={() => setCommunityFilter(null)}
            onPublish={() => setPublishing(true)}
            onNavigateToMap={() => goMap()}
            onNavigateToProfile={() => goTab('profile')}
          />
        );
      case 'map':
        return (
          <MapPage
            onNavigateToCommunity={(spot) => {
              setCommunityFilter(spot);
              goTab('community');
            }}
          />
        );
      case 'profile':
        return <ProfilePage onPublish={() => setPublishing(true)} />;
      default:
        return null;
    }
  };

  const overlayOpen = publishing || reasoning || atlas;

  return (
    <div className="phone-frame">
      {/* 已访问的 Tab 常驻：display:contents 让页面直接参与 phone-frame 的 flex 布局，
          非激活项 display:none 但 DOM 保留，钓法/鱼种/筛选/滚动位置全部不丢 */}
      {TABS.filter((t) => visited.includes(t.key)).map((t) => (
        <div key={t.key} className={`app-pane ${tab === t.key ? '' : 'is-hidden'}`} aria-hidden={tab !== t.key}>
          {pane(t.key)}
        </div>
      ))}

      {/* 悬浮发布 */}
      {tab === 'community' && !overlayOpen && (
        <button className="fab" onClick={() => setPublishing(true)} aria-label="晒鱼获">
          <Icon name="plus" size={24} strokeWidth={2.4} />
        </button>
      )}

      <nav className="tabbar" aria-label="主导航">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`tabbar-item ${tab === t.key ? 'active' : ''}`}
            onClick={() => goTab(t.key)}
            aria-label={t.label}
            aria-current={tab === t.key ? 'page' : undefined}
          >
            <Icon name={t.icon} size={21} filled={tab === t.key} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

      {/* 全屏页用叠加层覆盖，底层 5 个 Tab 不卸载，返回后状态完整 */}
      {publishing && (
        <div className="app-layer">
          <PublishPage
            onClose={() => setPublishing(false)}
            onPublished={() => { setPublishing(false); goTab('community'); }}
          />
        </div>
      )}
      {reasoning && (
        <div className="app-layer">
          <ReasoningPage onClose={() => setReasoning(false)} />
        </div>
      )}
      {atlas && (
        <div className="app-layer">
          <FishAtlasPage onClose={() => setAtlas(false)} />
        </div>
      )}
    </div>
  );
}

function LoginScreen() {
  const { login } = useAuth();
  const [phone, setPhone] = useState('13800138000');
  const [code, setCode] = useState('123456');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  async function submit() {
    setErr('');
    setLoading(true);
    try {
      await login(phone, code);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden',
      background: 'radial-gradient(90% 60% at 80% 0%, rgba(216,248,79,.13), transparent 58%), linear-gradient(168deg, #16342a 0%, #0d1a15 55%, #08120e 100%)',
    }}>
      {/* 水波纹装饰 */}
      <svg viewBox="0 0 390 300" aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, bottom: -40, width: '100%', opacity: .5 }}>
        <path d="M0 180c60-24 110 12 170-8s120-36 220-6" fill="none" stroke="rgba(216,248,79,.18)" strokeWidth="1.4" />
        <path d="M0 210c70-26 120 14 180-10s130-38 210-4" fill="none" stroke="rgba(216,248,79,.12)" strokeWidth="1.4" />
        <path d="M0 240c80-28 130 16 196-12s126-40 194-2" fill="none" stroke="rgba(216,248,79,.08)" strokeWidth="1.4" />
      </svg>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 26px', position: 'relative', zIndex: 1 }}>
        <div style={{ textAlign: 'center', marginBottom: 30 }}>
          <div style={{ width: 62, height: 62, borderRadius: 20, margin: '0 auto 18px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(216,248,79,.1)', border: '1px solid rgba(216,248,79,.24)' }}>
            <Icon name="fish" size={30} color="var(--lime)" strokeWidth={1.4} />
          </div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 36, fontWeight: 900, letterSpacing: '.16em', color: '#fff', lineHeight: 1.1 }}>钓鱼佬</div>
          <div style={{ fontSize: 8, letterSpacing: '.3em', color: 'rgba(216,248,79,.8)', fontWeight: 700, marginTop: 9 }}>ANGLER · FISH FORECAST</div>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', marginTop: 12, lineHeight: 1.7 }}>
            逐小时开口概率 · 黄金窗口 · 水温与潮汐
          </p>
        </div>

        <div style={{ background: '#fff', borderRadius: 26, padding: '22px 20px 20px', boxShadow: '0 24px 60px rgba(0,0,0,.3)' }}>
          <div className="field" style={{ marginBottom: 12 }}>
            <label htmlFor="login-phone" style={{ fontSize: 9.5, color: 'var(--ink-3)', fontWeight: 700, letterSpacing: '.1em', display: 'block', marginBottom: 7 }}>手机号</label>
            <input id="login-phone" className="input" type="tel" autoComplete="tel" value={phone} maxLength={11} inputMode="numeric" placeholder="请输入手机号"
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} />
          </div>
          <div className="field" style={{ marginBottom: 14 }}>
            <label htmlFor="login-code" style={{ fontSize: 9.5, color: 'var(--ink-3)', fontWeight: 700, letterSpacing: '.1em', display: 'block', marginBottom: 7 }}>验证码 · 演示固定 123456</label>
            <input id="login-code" className="input" autoComplete="one-time-code" value={code} maxLength={6} inputMode="numeric" placeholder="6 位验证码"
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          </div>
          {err && <p style={{ fontSize: 11, color: '#b23b3b', margin: '0 0 10px' }}>{err}</p>}
          <button className="p-btn p-btn-lime p-btn-block" style={{ height: 50 }} disabled={loading} onClick={submit}>
            {loading ? '登录中…' : '登录 / 注册'}
          </button>
        </div>

        <p style={{ textAlign: 'center', fontSize: 9.5, color: 'rgba(255,255,255,.32)', marginTop: 22, lineHeight: 1.9 }}>
          登录即代表同意《用户协议》和《隐私政策》<br />定位、相机、相册权限将在首次使用时说明用途
        </p>
      </div>
    </div>
  );
}
