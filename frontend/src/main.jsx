import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { AuthProvider } from './store.jsx';
import { initTheme } from './motion/hooks.js';
import './theme.css';
import './premium.css';

// 首屏即应用主题（登录页也生效），避免深色偏好在登录页失效
initTheme();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
);
