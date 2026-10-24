# 鱼情预报 App · API 契约 v1

Base URL：`http://localhost:3000/api/v1`
鉴权：`Authorization: Bearer <JWT>`
错误格式：RFC 7807 `application/problem+json`（`{ type, title, status, detail, instance }`）

---

## 认证

### POST /auth/code
发送登录验证码（开发模式固定 123456）。
```json
// 请求
{ "phone": "13800138000" }
// 响应 200
{ "message": "验证码已发送", "devCode": "123456" }
```

### POST /auth/login
手机号 + 验证码登录，返回 JWT（首次登录自动注册）。
```json
// 请求
{ "phone": "13800138000", "code": "123456" }
// 响应 200
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": { "id": 1, "phone": "13800138000", "nickname": "千岛湖老鲫", "avatarUrl": null }
}
```

---

## 钓点

### GET /spots?lng=&lat=&radius=&waterType=
钓点列表，支持视口/半径查询（bounding box 粗筛 + haversine 精确距离）与水域类型筛选。
```json
// 响应 200
{
  "total": 10,
  "spots": [{
    "id": 1, "name": "千岛湖中心湖区钓场",
    "lng": 119.052, "lat": 29.608,
    "waterType": "水库",          // 水库/河流/黑坑/湖泊/近海
    "reliability": 1,             // 1高/2中/3参考
    "banned": false,              // 禁钓状态（前置展示）
    "fishSpecies": ["鲫鱼","鲤鱼"],
    "fee": "免费开放", "depthRef": "10-30m",
    "city": "杭州·千岛湖",
    "catchesCount": 3, "distance": 910,
    "updatedAt": "2026-10-22T03:55:00.000Z"
  }]
}
```

### GET /spots/{id}
钓点详情（含最近 6 条审核通过的渔获）。

---

## 鱼情预报（核心）

### GET /forecast?spotId=&date=&species=
输入：钓点 ID、日期（YYYY-MM-DD，今天起）、目标鱼种。
```json
// 响应 200
{
  "spotId": 1,
  "spotName": "千岛湖中心湖区钓场",
  "date": "2026-10-22",
  "species": "鲫鱼",
  "hourly": [
    {
      "hour": 6, "score": 72, "level": "窗口期",
      "temp": 12.7, "pressure": 1001, "pressureTrend3h": -6.1,
      "windSpeed": 3.3, "windDir": "东南", "precip": 2.7, "humidity": 92,
      "waterTemp": 10.3,
      "factors": [
        { "key": "pressure_absolute", "value": 1001, "label": "气压 1001hPa，处于鱼类舒适区", "score": 100 },
        { "key": "pressure_trend", "value": -6.1, "label": "3小时气压下降 6.1hPa 后趋稳，开口窗口信号", "score": 95 },
        { "key": "wind", "value": 3.3, "label": "东南风二级（3.3m/s）", "score": 100 },
        { "key": "water_temp", "value": 10.3, "label": "水温约 10.3℃，偏低鲫鱼适宜区间 15.0-25.0℃", "score": 25 },
        { "key": "precipitation", "value": 2.7, "label": "微雨 2.7mm/h，刺激鱼口", "score": 92 },
        { "key": "moon_tide", "value": 0.39, "label": "盈凸月，对淡水鱼影响较小", "score": 72 }
      ]
    }
  ],
  "bestWindow": { "start": 17, "end": 23, "species": "鲫鱼", "avgScore": 86, "level": "窗口期" },
  "topFactors": [
    { "key": "water_temp", "label": "水温约 15.4℃，处于鲫鱼适宜区间 15.0-25.0℃", "score": 100, "direction": "positive", "weight": 0.3 }
  ],
  "pressureTrend": [
    { "time": "2026-10-21T18:00:00+08:00", "hour": 18, "pressure": 1009.4, "isToday": false }
  ],
  "weatherMeta": { "sunrise": "06:05", "sunset": "17:25", "moonPhase": 0.39, "moonPhaseName": "盈凸月", "source": "simulator", "degraded": false },
  "disclaimer": "预测仅供参考，不构成出钓决策保证",
  "meta": { "source": "computed" }
}
```
`meta.source`：`computed`（实时计算）/ `snapshot`（当日 DB 快照）/ `cache`（Redis 缓存）。

---

## 渔获社区

### POST /catches 🔒
发布渔获。**主链路先过内容安全审核**：高风险 422 拦截，中风险入库待人工复核（不进动态流），低风险先发后审。
```json
// 请求
{ "spotId": 1, "fishSpecies": "鲫鱼", "bait": "蚯蚓+酒米", "content": "傍晚窗口连杆中", "imageUrls": ["/uploads/xxx.jpg"], "visibility": "public" }
// 响应 201
{ "id": 11, "auditStatus": 1, "audit": { "level": "low", "reason": "机审通过" }, "message": "发布成功" }
// 响应 422（高风险拦截）
{ "type": "about:blank", "title": "内容审核未通过", "status": 422, "detail": "内容包含敏感词「违规测试」，已被拦截", "audit": { "level": "high", "reason": "..." } }
```
限频：同一用户 1 分钟内最多 2 条。

### GET /catches?spotId=&page=&pageSize=
动态流，默认只展示 `audit_status=1` 且公开的动态，按时间倒序。带 `liked`（当前用户是否点赞）。

### GET /catches/{id}
动态详情。

---

## 互动

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/comments` 🔒 | 发表评论 `{ catchId, content }` |
| GET | `/comments?catchId=` | 评论列表 |
| POST | `/likes/{catchId}` 🔒 | 点赞（幂等），返回 `{ liked, likesCount }` |
| DELETE | `/likes/{catchId}` 🔒 | 取消点赞 |
| POST | `/reports` 🔒 | 举报 `{ targetType: catch/comment/spot, targetId, reason }` |

---

## 出钓日志

### POST /logs 🔒
```json
// 请求
{ "spotId": 1, "fishDate": "2026-10-20", "bait": "酒米", "fishSpecies": "鲫鱼", "fishCount": 5, "content": "降温前一天，鱼口不错", "visibility": "public" }
// 响应 201（自动附带当日天气快照）
{ "id": 3, "message": "日志已保存", "weatherSnapshot": { "temp": 24.2, "pressure": 1001.4, "windSpeed": 2.9, "windDir": "西南", "precip": 0, "humidity": 77 } }
```

### GET /logs?scope=me|public
日志列表（me 需登录）。`GET /logs/stats` 🔒 返回 `{ trips, totalFish, spots }`。

---

## 上传与配置

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/upload` 🔒 | 表单上传图片（≤5MB，JPG/PNG/WebP），返回 `{ url }`（OSS 直传结构） |
| GET | `/config/species` | 鱼种配置列表（适宜水温、备注） |
| GET | `/config/water-types` | 水域类型枚举 |
| GET | `/health` | 健康检查 |

🔒 = 需要 JWT 鉴权。
