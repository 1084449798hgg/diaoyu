import React, { useState } from 'react';
import { useAuth } from './store.jsx';
import HomePage from './pages/HomePage.jsx';
import FishingIndexPage from './pages/FishingIndexPage.jsx';
import CommunityPage from './pages/CommunityPage.jsx';
import MapPage from './pages/MapPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import PublishPage from './pages/PublishPage.jsx';

/** 5 Tab 结构（对齐参考竞品 v3）：首页 / 天气 / 钓友圈 / 地图 / 我的 */
const TABS = [
  { key: 'home', label: '首页', icon: 'M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10' },
  { key: 'weather', label: '天气', icon: 'M6 14a4 4 0 014-4 5 5 0 019.6 1.3A3.5 3.5 0 0118.5 19H7a3.5 3.5 0 01-1-5z' },
  { key: 'community', label: '钓友圈', icon: 'M4 5h16v11H8l-4 4z' },
  { key: 'map', label: '地图', icon: 'M12 21s-7-5.5-7-11a7 7 0 0114 0c0 5.5-7 11-7 11z' },
  { key: 'profile', label: '我的', icon: 'M12 12a4 4 0 100-8 4 4 0 000 8zm-8 8c0-3.3 3.6-6 8-6s8 2.7 8 6' },
];

function TabIcon({ d, active }) {
  return (
    <svg viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

export default function App() {
  const [tab, setTab] = useState('home');
  const [publishing, setPublishing] = useState(false);
  const [communityFilter, setCommunityFilter] = useState(null); // { spotId, spotName } 从地图/预报跳转
  const { user } = useAuth();

  if (!user) {
    return (
      <div className="phone-frame">
        <LoginScreen />
      </div>
    );
  }

  if (publishing) {
    return (
      <div className="phone-frame">
        <PublishPage
          onClose={() => setPublishing(false)}
          onPublished={() => {
            setPublishing(false);
            setTab('community');
          }}
        />
      </div>
    );
  }

  const goMap = (spot) => {
    setCommunityFilter(null);
    setTab('map');
    if (spot) window.__pendingSpotFocus = spot;
  };

  return (
    <div className="phone-frame">
      {tab === 'home' && (
        <HomePage
          onNavigateToMap={goMap}
          onNavigateToCommunity={() => { setCommunityFilter(null); setTab('community'); }}
          onNavigateToProfile={() => setTab('profile')}
          onPublish={() => setPublishing(true)}
        />
      )}
      {tab === 'weather' && <FishingIndexPage onNavigateToMap={() => goMap()} />}
      {tab === 'community' && (
        <CommunityPage
          filter={communityFilter}
          onClearFilter={() => setCommunityFilter(null)}
          onPublish={() => setPublishing(true)}
          onNavigateToMap={() => goMap()}
          onNavigateToProfile={() => setTab('profile')}
        />
      )}
      {tab === 'map' && (
        <MapPage
          onNavigateToCommunity={(spot) => {
            setCommunityFilter(spot);
            setTab('community');
          }}
        />
      )}
      {tab === 'profile' && <ProfilePage onPublish={() => setPublishing(true)} />}

      {/* 悬浮发布按钮（钓友圈） */}
      {tab === 'community' && (
        <button className="fab" onClick={() => setPublishing(true)} aria-label="晒鱼获">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      )}

      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.key} className={`tabbar-item ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            <TabIcon d={t.icon} active={tab === t.key} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
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
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 28px' }}>
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div style={{ fontSize: 52, lineHeight: 1 }}>🎣</div>
        <h1 style={{ fontSize: 26, margin: '14px 0 6px', letterSpacing: 1 }}>鱼情预报</h1>
        <p className="muted">逐小时开口概率 · 气压趋势 · 最佳窗口</p>
      </div>
      <div className="field">
        <label className="field-label">手机号</label>
        <input className="input" value={phone} maxLength={11} inputMode="numeric" placeholder="请输入手机号"
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} />
      </div>
      <div className="field">
        <label className="field-label">验证码（演示环境固定 123456）</label>
        <input className="input" value={code} maxLength={6} inputMode="numeric" placeholder="6 位验证码"
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
      </div>
      {err && <p className="red-text" style={{ fontSize: 13, marginTop: 0 }}>{err}</p>}
      <button className="btn btn-primary btn-block" style={{ marginTop: 10, padding: '13px' }} disabled={loading} onClick={submit}>
        {loading ? '登录中…' : '登录 / 注册'}
      </button>
      <p className="muted" style={{ textAlign: 'center', marginTop: 22, lineHeight: 1.7 }}>
        登录即代表同意《用户协议》和《隐私政策》<br />定位、相机、相册权限将在首次使用时说明用途
      </p>
    </div>
  );
}
