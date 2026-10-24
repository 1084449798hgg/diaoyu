-- ============================================================
-- 迁移 002：追加需求（鱼石积分 / VIP / 鱼种图鉴）
-- 幂等：已存在的列/表自动跳过
-- ============================================================
SET NAMES utf8mb4;

SET @s := (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'points') > 0,
  'SELECT ''skip points''',
  'ALTER TABLE users ADD COLUMN points INT NOT NULL DEFAULT 0 COMMENT ''鱼石（社区积分）'''));
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s := (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'is_vip') > 0,
  'SELECT ''skip is_vip''',
  'ALTER TABLE users ADD COLUMN is_vip TINYINT NOT NULL DEFAULT 0 COMMENT ''0普通/1会员'''));
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS fish_encyclopedia (
  id         BIGINT PRIMARY KEY AUTO_INCREMENT,
  species    VARCHAR(50) UNIQUE NOT NULL COMMENT '鱼种名',
  category   VARCHAR(20) DEFAULT 'freshwater' COMMENT 'freshwater 淡水 / sea 海水 / other 其他',
  emoji      VARCHAR(8)  DEFAULT '🐟',
  intro      VARCHAR(255) DEFAULT NULL COMMENT '一句话介绍',
  INDEX idx_category (category)
) ENGINE=InnoDB COMMENT='鱼种图鉴';
