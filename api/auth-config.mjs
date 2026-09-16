import { publishableKey } from '../lib/access.mjs';
export default function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if (req.method !== 'GET') return res.status(405).json({error:'Method not allowed'});
  const key = publishableKey();
  if (!key) return res.status(503).json({error:'登入服務尚未完成設定。'});
  return res.status(200).json({publishableKey:key});
}
