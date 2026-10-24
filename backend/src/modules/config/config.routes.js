const express = require('express');
const ah = require('../../utils/async-handler');
const pool = require('../../db/pool');

const router = express.Router();

/** GET /api/v1/config/species —— 鱼种配置列表（加鱼种不改代码） */
router.get('/species', ah(async (_req, res) => {
  const [rows] = await pool.query('SELECT species, category, water_temp_min, water_temp_max, notes FROM fish_species_config ORDER BY id');
  res.json({
    items: rows.map((r) => ({
      species: r.species,
      category: r.category,
      waterTempMin: Number(r.water_temp_min),
      waterTempMax: Number(r.water_temp_max),
      notes: r.notes,
    })),
  });
}));

/** GET /api/v1/config/water-types —— 水域类型 */
router.get('/water-types', ah(async (_req, res) => {
  res.json({ items: ['水库', '河流', '黑坑', '湖泊', '近海'] });
}));

module.exports = router;
