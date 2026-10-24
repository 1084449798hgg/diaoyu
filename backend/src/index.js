require('dotenv').config();
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const rateLimit = require('express-rate-limit');

const config = require('./config');
const { errorHandler, notFound } = require('./middleware/errors');

const authRoutes = require('./modules/auth/auth.routes');
const spotsRoutes = require('./modules/spots/spots.routes');
const forecastRoutes = require('./modules/forecast/forecast.routes');
const catchesRoutes = require('./modules/catches/catches.routes');
const commentsRoutes = require('./modules/comments/comments.routes');
const likesRoutes = require('./modules/likes/likes.routes');
const logsRoutes = require('./modules/logs/logs.routes');
const reportsRoutes = require('./modules/reports/reports.routes');
const uploadRoutes = require('./modules/upload/upload.routes');
const configRoutes = require('./modules/config/config.routes');
const usersRoutes = require('./modules/users/users.routes');
const wikiRoutes = require('./modules/wiki/wiki.routes');

const app = express();

app.use(cors());
app.use(compression()); // gzip/br 压缩：1.25MB 构建产物 → ~415KB 传输，内网穿透场景加载快 3 倍
app.use(express.json({ limit: '2mb' }));

// 限频：全局 + 登录防刷（NFR-03 新用户发帖限频在 catches 模块内实现）
app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, max: 600, standardHeaders: true }));
app.use('/api/v1/auth', rateLimit({ windowMs: 60 * 1000, max: 10, standardHeaders: true }));

// API 路由（Package by Feature）
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/spots', spotsRoutes);
app.use('/api/v1/forecast', forecastRoutes);
app.use('/api/v1/catches', catchesRoutes);
app.use('/api/v1/comments', commentsRoutes);
app.use('/api/v1/likes', likesRoutes);
app.use('/api/v1/logs', logsRoutes);
app.use('/api/v1/reports', reportsRoutes);
app.use('/api/v1/upload', uploadRoutes);
app.use('/api/v1/config', configRoutes);
app.use('/api/v1/users', usersRoutes);
app.use('/api/v1/wiki', wikiRoutes);

app.get('/api/v1/health', (_req, res) => res.json({ status: 'up', time: new Date().toISOString() }));

// 上传文件静态目录
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// 前端构建产物托管（单端口部署）
const distDir = path.join(__dirname, '../../frontend/dist');
app.use(express.static(distDir));
app.get('*', (req, res, next) => {
  if (req.url.startsWith('/api/') || req.url.startsWith('/uploads/')) return next(notFound('接口不存在'));
  res.sendFile(path.join(distDir, 'index.html'), (err) => {
    if (err) res.status(404).type('application/problem+json').json({ type: 'about:blank', title: '资源不存在', status: 404, detail: '前端尚未构建，请先执行 npm run build' });
  });
});

app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`[fishing-app] API listening on http://127.0.0.1:${config.port}`);
  console.log(`[fishing-app] weather source: ${config.hefengApiKey ? 'hefeng(live)' : 'simulator'}`);
});
