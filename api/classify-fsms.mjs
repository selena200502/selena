export default function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  return res.status(410).json({error:'此網站已改為 QMS 驗證範圍風險審查，請使用新版分析頁面。'});
}
