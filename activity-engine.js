(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ActivityEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ACTIVITY_ALIASES = Object.freeze({
    '設計': '設計', '開發': '設計',
    '生產': '製造', '製造': '製造', '加工': '製造', '調配': '製造', '混合': '製造', '組裝': '製造',
    '表面處理': '製造', '表面加工': '製造', '塗裝': '製造', '噴塗': '製造', '塗佈': '製造', '烤漆': '製造',
    '電鍍': '製造', '陽極處理': '製造', '熱處理': '製造', '拋光': '製造', '研磨': '製造',
    '銷售': '銷售', '配銷': '銷售', '買賣': '銷售', '批發': '銷售', '零售': '銷售',
    '安裝': '安裝', '施工': '安裝', '營建作業': '安裝',
    '維修': '維修', '維護': '維修', '保養': '維修',
    '運輸': '運輸', '貨運': '運輸', '配送': '運輸', '承運': '運輸',
    '倉儲': '倉儲', '倉庫': '倉儲',
    '顧問': '顧問', '諮詢': '顧問',
    '分析': '試驗', '檢測': '試驗', '檢驗': '試驗', '試驗': '試驗', '測試': '試驗',
    '印刷': '印刷',
    '租賃': '租賃', '服務': '服務', '管理': '管理'
  });
  const TERMS = Object.keys(ACTIVITY_ALIASES).sort((a, b) => b.length - a.length);
  const MANUFACTURING = new Set(['設計', '製造']);
  const SUPPORTING = new Set(['設計', '安裝', '維修', '顧問', '試驗']);
  const CORE_DELIVERIES = new Set(['製造', '銷售', '運輸', '倉儲', '印刷', '租賃', '管理', '服務']);
  const ACTIVITY_TERMS = Object.freeze({
    '設計': ['設計', '開發'], '安裝': ['安裝', '施工', '營建作業'],
    '維修': ['維修', '維護', '保養'], '顧問': ['顧問', '諮詢'],
    '試驗': ['分析', '檢測', '檢驗', '試驗', '測試']
  });

  function uniq(values) { return [...new Set(values.filter(Boolean))]; }
  function normalizeActivities(values) {
    return uniq((values || []).filter(value => value !== undefined && value !== null && String(value).trim()).map(value => ACTIVITY_ALIASES[String(value).trim()] || String(value).trim()));
  }
  function inferActivities(text) {
    const value = String(text || '');
    return normalizeActivities(TERMS.filter(term => value.includes(term)));
  }
  function stripTrailingActivities(text) {
    let value = String(text || '').trim();
    const activityPattern = TERMS.map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const suffix = new RegExp('(?:之)?(?:' + activityPattern + ')(?:(?:與|及|、|/)(?:' + activityPattern + '))*$');
    return value.replace(suffix, '').trim() || value;
  }
  function parseScope(scope, fallbackActivities) {
    const fallback = normalizeActivities(fallbackActivities);
    return String(scope || '').replace(/相關活動$/, '').split(/[；;]/).map(raw => raw.trim()).filter(Boolean).map(segment => {
      const inferred = inferActivities(segment);
      return { product: stripTrailingActivities(segment), scope_segment: segment, activities: uniq([...inferred, ...fallback]) };
    });
  }
  function activityFamilyForNace(nace) {
    const code = String(nace || '');
    if (/^52\.10$/.test(code)) return ['倉儲'];
    if (/^(49|50|51|52|53)\./.test(code)) return ['運輸', '倉儲'];
    if (/^(45|46|47)\./.test(code)) return ['銷售'];
    if (/^33\.1/.test(code)) return ['維修'];
    if (/^33\.20$/.test(code)) return ['安裝'];
    if (/^(41|42|43)\./.test(code)) return ['安裝'];
    if (/^(71|72)\./.test(code)) return ['設計', '顧問', '試驗'];
    if (/^74\.(10|90)$/.test(code)) return ['設計', '顧問'];
    if (/^18\./.test(code)) return ['印刷', '製造'];
    if (/^(10|11|12|13|14|15|16|17|19|20|21|22|23|24|25|26|27|28|29|30|31|32)\./.test(code)) return ['製造'];
    return [];
  }
  function explicitlyIndependent(activity, detail) {
    const terms = ACTIVITY_TERMS[activity] || [activity];
    const text = String(detail && (detail.scope_segment || detail.product) || '');
    return terms.some(term => {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp('(?:獨立|專業|受託|委託|對外|另行|單獨|僅|提供|承攬)?(?:之)?' + escaped + '(?:服務|顧問|業務|活動|案件)').test(text)
        || new RegExp('(?:獨立|專業|受託|委託|對外|另行|單獨|僅|提供|承攬)(?:之)?' + escaped).test(text);
    });
  }
  function activityIsIndependent(activity, detail) {
    const normalized = ACTIVITY_ALIASES[String(activity || '').trim()] || String(activity || '').trim();
    if (!SUPPORTING.has(normalized)) return true;
    const activities = normalizeActivities(detail && detail.activities);
    if (!activities.some(item => CORE_DELIVERIES.has(item))) return true;
    return explicitlyIndependent(normalized, detail);
  }
  function candidateCompatible(candidate, detail) {
    const scoped = normalizeActivities(detail && detail.activities);
    if (!scoped.length) return true;
    const claimed = normalizeActivities([candidate && candidate.activity]);
    const family = activityFamilyForNace(candidate && candidate.nace);
    // The formal NACE activity family controls compatibility. GPT's activity label
    // remains useful only when the code has no known family.
    const expected = family.length ? family : claimed;
    if (!expected.length) return true;
    return expected.some(activity => scoped.includes(activity) && activityIsIndependent(activity, detail));
  }
  function validateCandidate(candidate, detail, formal) {
    if (!candidateCompatible(candidate, detail)) return { accepted: false, status: 'Manual Review', reason: '候選活動與該 scope 分段的實際活動不一致' };
    if (!formal) return { accepted: true, status: 'GPT Preferred', reason: '保留 GPT 語意建議；NACE Rev.2 正式目錄無完全適宜項目，需人工確認' };
    if (candidate.formal_match === 'partial') return { accepted: true, status: 'GPT Preferred', reason: 'NACE Rev.2 僅部分吻合，保留 GPT 建議' };
    if (candidate.formal_match === 'conflict' || Number(candidate.confidence || 0) < 55) return { accepted: true, status: 'Manual Review', reason: '存在正式邊界衝突、低信心或多個合理候選' };
    return { accepted: true, status: 'Confirmed', reason: 'GPT 活動判定與 NACE Rev.2 正式項目一致' };
  }
  function hasManufacturing(activities) { return normalizeActivities(activities).some(value => MANUFACTURING.has(value)); }

  return { ACTIVITY_ALIASES, normalizeActivities, inferActivities, parseScope, activityFamilyForNace, activityIsIndependent, candidateCompatible, validateCandidate, hasManufacturing };
});

