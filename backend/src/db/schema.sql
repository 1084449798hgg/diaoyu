-- ============================================================
-- 钓鱼鱼情预报 App - MySQL 8 Schema
-- 对应需求文档 v1.0 第六节「核心数据模型」
-- ============================================================
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS users (
  id          BIGINT PRIMARY KEY AUTO_INCREMENT,
  phone       VARCHAR(20)  UNIQUE NOT NULL COMMENT '手机号',
  nickname    VARCHAR(50)  DEFAULT NULL,
  avatar_url  VARCHAR(500) DEFAULT NULL,
  points      INT NOT NULL DEFAULT 0 COMMENT '鱼石（社区积分）',
  is_vip      TINYINT NOT NULL DEFAULT 0 COMMENT '0普通/1会员',
  jpush_rid   VARCHAR(100) DEFAULT NULL COMMENT '极光推送注册ID',
  created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB COMMENT='用户';

CREATE TABLE IF NOT EXISTS fishing_spots (
  id               BIGINT PRIMARY KEY AUTO_INCREMENT,
  name             VARCHAR(100) NOT NULL COMMENT '钓点名称',
  lng              DECIMAL(10,7) NOT NULL COMMENT '经度',
  lat              DECIMAL(10,7) NOT NULL COMMENT '纬度',
  water_type       VARCHAR(20)  NOT NULL COMMENT '水库/河流/黑坑/湖泊/近海',
  reliability      TINYINT      NOT NULL DEFAULT 3 COMMENT '数据可靠性 1高/2中/3参考',
  banned           BOOLEAN      NOT NULL DEFAULT FALSE COMMENT '禁钓状态',
  fish_species_json JSON        DEFAULT NULL COMMENT '鱼种标签',
  fee              VARCHAR(100) DEFAULT NULL COMMENT '费用说明',
  depth_ref        VARCHAR(50)  DEFAULT NULL COMMENT '水深参考',
  city             VARCHAR(50)  DEFAULT NULL COMMENT '所属城市/水域',
  updated_at       DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_water_type (water_type),
  INDEX idx_banned (banned)
) ENGINE=InnoDB COMMENT='钓点';

-- 鱼种引擎配置：加鱼种不改代码（需求文档第八节）
CREATE TABLE IF NOT EXISTS fish_species_config (
  id             BIGINT PRIMARY KEY AUTO_INCREMENT,
  species        VARCHAR(50) UNIQUE NOT NULL COMMENT '鱼种名',
  category       VARCHAR(20) DEFAULT 'freshwater' COMMENT 'freshwater 淡水 / sea 海钓',
  water_temp_min DECIMAL(4,1) DEFAULT NULL COMMENT '适宜水温下限',
  water_temp_max DECIMAL(4,1) DEFAULT NULL COMMENT '适宜水温上限',
  weights_json   JSON NOT NULL COMMENT '各因子权重',
  notes          VARCHAR(255) DEFAULT NULL,
  updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB COMMENT='鱼种因子权重配置';

-- 鱼种图鉴（追加需求：点亮鱼种图鉴，解锁进度 X/100）
CREATE TABLE IF NOT EXISTS fish_encyclopedia (
  id         BIGINT PRIMARY KEY AUTO_INCREMENT,
  species    VARCHAR(50) UNIQUE NOT NULL COMMENT '鱼种名',
  category   VARCHAR(20) DEFAULT 'freshwater' COMMENT 'freshwater 淡水 / sea 海水 / other 其他',
  emoji      VARCHAR(8)  DEFAULT '🐟',
  intro      VARCHAR(255) DEFAULT NULL COMMENT '一句话介绍',
  INDEX idx_category (category)
) ENGINE=InnoDB COMMENT='鱼种图鉴';

CREATE TABLE IF NOT EXISTS forecast_snapshots (
  id             BIGINT PRIMARY KEY AUTO_INCREMENT,
  spot_id        BIGINT NOT NULL,
  target_date    DATE   NOT NULL,
  species        VARCHAR(50) NOT NULL,
  hourly_json    JSON DEFAULT NULL COMMENT '0-23时逐小时因子与评分',
  best_window_json JSON DEFAULT NULL COMMENT '最佳时间窗',
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at     DATETIME DEFAULT NULL COMMENT '快照过期时间(当天23:59)',
  -- 文档基线为 (spot_id, target_date)；此处扩展 species 以支撑多鱼种对比
  UNIQUE KEY uk_spot_date_species (spot_id, target_date, species),
  INDEX idx_spot (spot_id)
) ENGINE=InnoDB COMMENT='鱼情预报快照';

CREATE TABLE IF NOT EXISTS catches (
  id             BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id        BIGINT NOT NULL,
  spot_id        BIGINT DEFAULT NULL,
  fish_species   VARCHAR(50) DEFAULT NULL,
  bait           VARCHAR(100) DEFAULT NULL,
  content        TEXT,
  image_urls     JSON DEFAULT NULL,
  visibility     VARCHAR(20) DEFAULT 'public' COMMENT 'public/private',
  audit_status   TINYINT DEFAULT 0 COMMENT '0待审/1通过/2拦截',
  audit_detail   VARCHAR(255) DEFAULT NULL COMMENT '审核说明',
  likes_count    INT DEFAULT 0,
  comments_count INT DEFAULT 0,
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_spot (spot_id),
  INDEX idx_user (user_id),
  INDEX idx_audit_created (audit_status, created_at)
) ENGINE=InnoDB COMMENT='渔获动态';

CREATE TABLE IF NOT EXISTS comments (
  id         BIGINT PRIMARY KEY AUTO_INCREMENT,
  catch_id   BIGINT NOT NULL,
  user_id    BIGINT NOT NULL,
  content    VARCHAR(500) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_catch (catch_id)
) ENGINE=InnoDB COMMENT='评论';

CREATE TABLE IF NOT EXISTS likes (
  id         BIGINT PRIMARY KEY AUTO_INCREMENT,
  catch_id   BIGINT NOT NULL,
  user_id    BIGINT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_catch_user (catch_id, user_id)
) ENGINE=InnoDB COMMENT='点赞';

CREATE TABLE IF NOT EXISTS fishing_logs (
  id                  BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id             BIGINT NOT NULL,
  spot_id             BIGINT DEFAULT NULL,
  fish_date           DATE NOT NULL COMMENT '出钓日期',
  weather_snapshot_json JSON DEFAULT NULL COMMENT '天气快照(校准模型数据)',
  bait                VARCHAR(100) DEFAULT NULL,
  fish_species        VARCHAR(50) DEFAULT NULL,
  fish_count          INT DEFAULT 0,
  content             TEXT,
  image_urls          JSON DEFAULT NULL,
  visibility          VARCHAR(20) DEFAULT 'private' COMMENT 'public/private',
  created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (user_id)
) ENGINE=InnoDB COMMENT='个人出钓日志';

CREATE TABLE IF NOT EXISTS reports (
  id          BIGINT PRIMARY KEY AUTO_INCREMENT,
  target_type VARCHAR(20) NOT NULL COMMENT 'catch/comment/spot',
  target_id   BIGINT NOT NULL,
  user_id     BIGINT NOT NULL,
  reason      VARCHAR(100) DEFAULT NULL,
  status      TINYINT DEFAULT 0 COMMENT '0待处理/1已处理',
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_target (target_type, target_id)
) ENGINE=InnoDB COMMENT='UGC举报';
