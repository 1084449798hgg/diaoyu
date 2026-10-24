-- ============================================================
-- 迁移 003：渔获增加重量（斤→kg），支撑「最大单尾」战绩统计
-- 幂等：已存在则跳过
-- ============================================================
SET NAMES utf8mb4;

SET @s := (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'catches' AND COLUMN_NAME = 'weight_kg') > 0,
  'SELECT ''skip weight_kg''',
  'ALTER TABLE catches ADD COLUMN weight_kg DECIMAL(5,2) DEFAULT NULL COMMENT ''单尾重量(kg)'''));
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
