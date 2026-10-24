const express = require('express');
const ah = require('../../utils/async-handler');
const { badRequest, notFound } = require('../../middleware/errors');
const { authRequired, authOptional } = require('../../middleware/auth');
const pool = require('../../db/pool');
const weatherService = require('../weather/weather.service');
const { haversine } = require('../../utils/geo');

const router = express.Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseJson(v, fb = []) {
  if (Array.isArray(v)) return v;
  try { return JSON.parse(v || '[]'); } catch { return fb; }
}

function fmtDate(d) {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function logDto(l) {
  return {
    id: l.id,
    spotId: l.spot_id,
    spotName: l.spot_name || null,
    fishDate: fmtDate(l.fish_date),
    bait: l.bait,
    fishSpecies: l.fish_species,
    fishCount: l.fish_count,
    content: l.content,
    imageUrls: parseJson(l.image_urls),
    visibility: l.visibility,
    weatherSnapshot: typeof l.weather_snapshot_json === 'string' ? JSON.parse(l.weather_snapshot_json || '{}') : (l.weather_snapshot_json || {}),
    nickname: l.nickname,
    createdAt: l.created_at,
  };
}

/** POST /api/v1/logs —— 记录出钓日志（自动附带天气快照，为模型校准积累数据） */
router.post('/', authRequired, ah(async (req, res) => {
  const { spotId, fishDate, bait, fishSpecies, fishCount, content, imageUrls, visibility } = req.body || {};
  if (!DATE_RE.test(fishDate || '')) throw badRequest('fishDate 需为 YYYY-MM-DD 格式');

  let weatherSnapshot = {};
  if (spotId) {
    const [s] = await pool.query('SELECT * FROM fishing_spots WHERE id = ?', [Number(spotId)]);
    if (s.length) {
      try {
        const w = await weatherService.getWeather(s[0], fishDate);
        const hour = fishDate === new Date().toISOString().slice(0, 10)
          ? new Date().getHours()
          : 12;
        const cur = w.hourly.find((h) => h.hour === hour && h.time.slice(0, 10) === fishDate) || w.hourly[24];
        if (cur) {
          weatherSnapshot = {
            temp: cur.temp, pressure: cur.pressure, windSpeed: cur.windSpeed,
            windDir: cur.windDir, precip: cur.precip, humidity: cur.humidity,
          };
        }
      } catch { /* 天气失败不阻塞日志记录 */ }
    }
  }

  const [r] = await pool.query(
    `INSERT INTO fishing_logs (user_id, spot_id, fish_date, weather_snapshot_json, bait, fish_species, fish_count, content, image_urls, visibility)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [req.user.id, spotId ? Number(spotId) : null, fishDate, JSON.stringify(weatherSnapshot),
     bait || null, fishSpecies || null, Number(fishCount) || 0, content || null,
     JSON.stringify(imageUrls || []), visibility === 'public' ? 'public' : 'private']
  );
  res.status(201).json({ id: r.insertId, message: '日志已保存', weatherSnapshot });
}));

/** GET /api/v1/logs?scope=me|public —— 日志列表 */
router.get('/', authOptional, ah(async (req, res) => {
  const scope = req.query.scope === 'public' ? 'public' : 'me';
  let rows;
  if (scope === 'me') {
    if (!req.user) return res.json({ total: 0, items: [] });
    [rows] = await pool.query(
      `SELECT l.*, u.nickname, s.name AS spot_name FROM fishing_logs l
       JOIN users u ON u.id = l.user_id
       LEFT JOIN fishing_spots s ON s.id = l.spot_id
       WHERE l.user_id = ? ORDER BY l.fish_date DESC, l.id DESC LIMIT 50`,
      [req.user.id]
    );
  } else {
    [rows] = await pool.query(
      `SELECT l.*, u.nickname, s.name AS spot_name FROM fishing_logs l
       JOIN users u ON u.id = l.user_id
       LEFT JOIN fishing_spots s ON s.id = l.spot_id
       WHERE l.visibility = 'public' ORDER BY l.fish_date DESC, l.id DESC LIMIT 30`
    );
  }
  res.json({ total: rows.length, items: rows.map(logDto) });
}));

/** GET /api/v1/logs/stats —— 我的出钓统计 */
router.get('/stats', authRequired, ah(async (req, res) => {
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS trips, COALESCE(SUM(fish_count), 0) AS totalFish,
            COUNT(DISTINCT spot_id) AS spots
     FROM fishing_logs WHERE user_id = ?`,
    [req.user.id]
  );
  res.json(row);
}));

module.exports = router;
