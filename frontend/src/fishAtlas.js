/**
 * 鱼种图鉴数据 —— 写实图片由用户提供，文字为通识整理，仅作识别与垂钓参考。
 * group: freshwater 淡水 / migratory 洄游·海水
 * match: 用于把渔获卡、鱼种卡里的中文鱼种名匹配到对应写实图
 */

export const FISH_ATLAS = [
  {
    id: 'crucian_carp', name: '鲫鱼', en: 'CRUCIAN CARP', latin: 'Carassius auratus',
    alias: '土鲫 · 河鲫 · 喜头鱼', group: 'freshwater',
    temp: '15–25℃', layer: '底层', diet: '杂食 · 底栖动物 / 藻类',
    habitat: '静水池塘 · 湖泊浅湾 · 缓流河汊', method: '底钓 · 长子线细钩',
    tags: ['广温', '底层', '四季可钓'],
    note: '适应性最强的淡水鱼之一，喜在水草与软泥底觅食。气温骤变时口轻，宜用小钩细线、轻漂抓顿口；春秋水温 15–25℃ 时摄食最稳。',
    img: '/fish/crucian_carp.webp',
    match: ['鲫鱼', '土鲫', '河鲫', '喜头', '鲫'],
  },
  {
    id: 'common_carp', name: '鲤鱼', en: 'COMMON CARP', latin: 'Cyprinus carpio',
    alias: '鲤拐子 · 河鲤 · 黄河鲤', group: 'freshwater',
    temp: '15–28℃', layer: '底层', diet: '杂食 · 底栖动物 / 水草 / 谷物',
    habitat: '池塘 · 湖泊缓流 · 江河回水湾', method: '底钓 · 玉米 · 薯饵 · 商品窝料',
    tags: ['底层', '拱食', '广温'],
    note: '口部有两对须、体侧鳞片大而齐，底层拱泥觅食，警觉性高。春秋水温 15–28℃ 摄食最旺，用发酵玉米或薯味饵重窝守钓，漂相多为稳送漂与黑漂。',
    img: '/fish/common_carp.webp',
    match: ['鲤鱼', '鲤拐子', '河鲤', '黄河鲤', '鲤'],
  },
  {
    id: 'grass_carp', name: '草鱼', en: 'GRASS CARP', latin: 'Ctenopharyngodon idella',
    alias: '鲩鱼 · 草鲩 · 白鲩', group: 'freshwater',
    temp: '20–30℃', layer: '中下层', diet: '草食 · 水草 / 陆草',
    habitat: '水草丰茂的湖泊 · 水库 · 江河', method: '浮钓 / 底钓 · 草把 · 玉米 · 颗粒',
    tags: ['草食', '中下层', '夏季'],
    note: '体型修长、鳞片呈网纹，典型的草食性鱼类。高温季节食欲最旺，微雨、涨水时靠岸啃食水草；用嫩草、玉米或发酵麦麸打窝效果较好。',
    img: '/fish/grass_carp.webp',
    match: ['草鱼', '鲩鱼', '草鲩', '白鲩'],
  },
  {
    id: 'bighead_carp', name: '鳙鱼', en: 'BIGHEAD CARP', latin: 'Aristichthys nobilis',
    alias: '花鲢 · 胖头鱼 · 大头鱼 · 鲢鳙', group: 'freshwater',
    temp: '20–30℃', layer: '中上层', diet: '滤食 · 浮游动物',
    habitat: '大水面湖泊 · 水库 · 缓流河道', method: '浮钓 · 雾化鲢鳙饵',
    tags: ['滤食', '中上层', '夏季'],
    note: '头部极大、体侧有不规则黑斑，靠细密鳃耙滤食浮游生物。夏秋高温时成群在表层巡游，酸酵味型、雾化充分的饵料能把鱼层稳住。',
    img: '/fish/bighead_carp.webp',
    match: ['鳙鱼', '花鲢', '胖头', '大头鱼', '鲢鳙', '鲢鱼', '白鲢'],
  },
  {
    id: 'culter', name: '翘嘴鲌', en: 'TOPMOUTH CULTER', latin: 'Culter alburnus',
    alias: '翘嘴 · 白鱼 · 大白鱼', group: 'freshwater',
    temp: '18–28℃', layer: '中上层', diet: '掠食 · 小鱼小虾',
    habitat: '开阔亮水区 · 库湾 · 江河回水', method: '路亚 / 浮钓 · 亮片 · 米诺 · 活虾',
    tags: ['掠食', '中上层', '早晚窗口'],
    note: '体侧扁细长、口裂上翘，是典型的追击型掠食鱼。清晨与黄昏追小鱼群到水面炸水，此时用亮片、米诺沿炸水区快速搜索命中率最高。',
    img: '/fish/culter.webp',
    match: ['翘嘴', '翘嘴鲌', '白鱼', '鲌鱼', '大白鱼'],
  },
  {
    id: 'bream', name: '鳊鱼', en: 'FRESHWATER BREAM', latin: 'Megalobrama amblycephala',
    alias: '武昌鱼 · 团头鲂 · 鲂鱼', group: 'freshwater',
    temp: '18–28℃', layer: '中下层', diet: '草食偏杂 · 水草 / 碎屑',
    habitat: '湖泊 · 水库 · 缓流水域', method: '底钓 / 半水 · 玉米 · 麦麸 · 商品饵',
    tags: ['体高侧扁', '中下层', '群游'],
    note: '体高背隆、鳞片排列整齐，喜成群在水草外缘活动。吃口轻且成群，适合用雾化适中的饵料持续补窝，抓连续的小顿口。',
    img: '/fish/bream.webp',
    match: ['鳊鱼', '武昌鱼', '团头鲂', '鲂鱼'],
  },
  {
    id: 'snakehead', name: '乌鳢', en: 'SNAKEHEAD', latin: 'Channa argus',
    alias: '黑鱼 · 生鱼 · 乌鱼 · 财鱼', group: 'freshwater',
    temp: '20–30℃', layer: '底层 / 伏击', diet: '掠食 · 鱼虾蛙',
    habitat: '水草区 · 浅滩 · 沟渠与池塘', method: '路亚雷蛙 · 活饵 · 守钓',
    tags: ['掠食', '伏击', '护幼'],
    note: '体呈长筒形、具迷彩斑纹，耐低氧，常伏在水草阴影里突袭。繁殖期有护幼行为，雷蛙打草洞、慢拖停顿容易触发攻击。',
    img: '/fish/snakehead.webp',
    match: ['乌鳢', '黑鱼', '生鱼', '乌鱼', '财鱼', '斑鳢'],
  },
  {
    id: 'yellow_catfish', name: '黄颡鱼', en: 'YELLOW CATFISH', latin: 'Pelteobagrus fulvidraco',
    alias: '黄辣丁 · 黄骨鱼 · 昂刺鱼', group: 'freshwater',
    temp: '20–28℃', layer: '底层', diet: '底栖杂食 · 小鱼 / 水生昆虫',
    habitat: '静水软泥底 · 缓流回水 · 石缝', method: '沉底 · 蚯蚓 · 红虫 · 鸡肝',
    tags: ['夜行', '底层', '有须'],
    note: '头扁、口周有长须，背鳍与胸鳍有硬刺。怕强光，黄昏到夜间靠底觅食最活跃；用蚯蚓或腥味动物饵沉底，摘钩时注意硬刺。',
    img: '/fish/yellow_catfish.webp',
    match: ['黄颡', '黄辣丁', '黄骨', '昂刺', '嘎鱼', '黄丁'],
  },
  {
    id: 'catfish', name: '鲶鱼', en: 'CATFISH', latin: 'Silurus asotus',
    alias: '大口鲶 · 土鲶 · 鲇鱼', group: 'freshwater',
    temp: '20–28℃', layer: '底层', diet: '掠食 · 鱼虾 / 动物饵',
    habitat: '深潭 · 回水湾 · 乱石与沉木', method: '沉底重铅 · 活饵 · 鸡肝 · 蚯蚓',
    tags: ['夜行', '底层', '大口'],
    note: '头宽扁、口裂大、须长，靠触须与嗅觉在浑水底层寻食。夜钓、涨水后水色偏浑时最易开口，宜用大饵守钓并配失手绳。',
    img: '/fish/catfish.webp',
    match: ['鲶鱼', '鲇鱼', '大口鲶', '土鲶', '鲶'],
  },
  {
    id: 'salmon', name: '鲑鱼', en: 'ATLANTIC SALMON', latin: 'Salmo salar',
    alias: '三文鱼 · 大西洋鲑', group: 'migratory',
    temp: '8–16℃', layer: '中上层 / 洄游', diet: '掠食 · 小鱼 / 甲壳类',
    habitat: '冷水溪流 · 河口 · 近海（洄游）', method: '飞蝇 / 路亚 · 亮片 · 勺型拟饵',
    tags: ['冷水', '洄游', '高氧'],
    note: '冷水性洄游鱼，体侧银蓝、背部具黑斑，需要高溶氧的清澈流水。溯河期对水温和流量极敏感，属路亚与飞蝇钓的经典对象鱼。',
    img: '/fish/salmon.webp',
    match: ['鲑鱼', '三文鱼', '大西洋鲑', '鳟鱼', '大马哈'],
  },
  {
    id: 'pompano', name: '鲳鱼', en: 'GOLDEN POMPANO', latin: 'Trachinotus ovatus',
    alias: '金鲳 · 卵形鲳鲹 · 黄腊鲳', group: 'migratory',
    temp: '22–30℃', layer: '中上层', diet: '杂食偏肉 · 甲壳类 / 小鱼',
    habitat: '近海 · 河口咸淡水 · 网箱周边', method: '路亚 / 沉底 · 小虾 · 亮片',
    tags: ['暖水', '海水', '体高侧扁'],
    note: '体高侧扁近菱形、臀鳍与背鳍延长呈镰状，暖水性近海鱼。喜集群沿潮流巡游，夏秋季在河口与网箱外围较常见。',
    img: '/fish/pompano.webp',
    match: ['鲳鱼', '金鲳', '鲳鲹', '黄腊鲳', '平鱼'],
  },
  {
    id: 'sturgeon', name: '鲟鱼', en: 'STURGEON', latin: 'Acipenser spp.',
    alias: '中华鲟 · 鲟鳇 · 鲟龙鱼', group: 'migratory',
    temp: '15–22℃', layer: '底层', diet: '底栖 · 水生昆虫 / 小鱼',
    habitat: '大江深水 · 河口 · 大型水库', method: '沉底重铅 · 动物饵（合规水域）',
    tags: ['底层', '冷温', '保护物种'],
    note: '吻部尖长、体侧有骨板、尾为歪形尾，是极古老的底栖鱼类。野生鲟类多属国家重点保护动物，**禁止垂钓，误捕须立即放流**；仅可在合法养殖/放流场合规体验。',
    img: '/fish/sturgeon.webp',
    match: ['鲟鱼', '中华鲟', '鲟鳇', '鲟龙'],
  },
];

/** 按中文鱼种名找到对应写实图；找不到返回 null（调用方回退到剪影） */
export function resolveFishImage(species = '') {
  const s = String(species).trim();
  if (!s) return null;
  // 先精确命中，避免「鲢鳙」被「鳙鱼」的短关键词抢走
  let hit = FISH_ATLAS.find((f) => f.name === s || f.alias.split(' · ').includes(s));
  if (!hit) {
    let best = 0;
    for (const f of FISH_ATLAS) {
      for (const k of f.match) {
        if (s.includes(k) && k.length > best) { hit = f; best = k.length; }
      }
    }
  }
  return hit ? hit.img : null;
}

/** 按中文鱼种名找到图鉴条目 */
export function resolveFish(species = '') {
  const img = resolveFishImage(species);
  return img ? FISH_ATLAS.find((f) => f.img === img) : null;
}

export const FISH_GROUPS = [
  { key: 'all', label: '全部' },
  { key: 'freshwater', label: '淡水' },
  { key: 'migratory', label: '洄游 · 海水' },
];
