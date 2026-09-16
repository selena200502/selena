import { authorize } from '../lib/access.mjs';
export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if (req.method !== 'GET') return res.status(405).json({error:'Method not allowed'});
  const user = await authorize(req,res);
  if (user) return res.status(200).json({email:user.email});
}
