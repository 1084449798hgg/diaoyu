/**
 * UGC 内容安全审核（模拟阿里云内容安全 Java SDK 的机审决策）
 * 风险分级：high 高风险直接拦截 / medium 中风险人工队列 / low 低风险先发后审
 */
const { hashStr } = require('../../utils/hash');

const SENSITIVE_WORDS = ['违规测试', '赌博', '色情', '毒品'];

function moderate({ imageUrls = [], content = '' }) {
  const text = String(content || '');
  for (const w of SENSITIVE_WORDS) {
    if (text.includes(w)) {
      return { level: 'high', reason: `内容包含敏感词「${w}」，已被拦截`, hit: w };
    }
  }
  for (const url of imageUrls) {
    if (String(url).includes('risky')) {
      return { level: 'high', reason: '图片未通过内容安全审核，已被拦截', hit: 'image' };
    }
  }
  // 确定性抽检：约 1/23 的图文进入人工复核队列
  const h = hashStr([...imageUrls].join('|') + text);
  if (h % 23 === 0) {
    return { level: 'medium', reason: '图片进入人工复核队列，通过后公开展示' };
  }
  return { level: 'low', reason: '机审通过' };
}

module.exports = { moderate };
