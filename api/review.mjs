import { authorize, sameOrigin } from '../lib/access.mjs';
import { prompt, schema } from '../lib/qms-config.mjs';
import { validateScope, parseAnalysis } from '../lib/qms-analysis.mjs';

export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if (req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});
  if (!sameOrigin(req,res) || !await authorize(req,res)) return;
  let scope;
  try {
    if (Number(req.headers['content-length']) > 16000) return res.status(413).json({error:'請求內容過大。'});
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (Buffer.byteLength(JSON.stringify(body || {})) > 16000) return res.status(413).json({error:'請求內容過大。'});
    scope = validateScope(body);
  } catch {return res.status(400).json({error:'請填寫 1 至 2500 字的驗證服务範圍。'});}
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({error:'GPT 服務尚未完成設定。'});
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method:'POST',signal:AbortSignal.timeout(50000),
      headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},
      body:JSON.stringify({model:process.env.OPENAI_MODEL || 'gpt-5.4-mini',store:false,instructions:prompt,input:JSON.stringify({scope}),max_output_tokens:6500,reasoning:{effort:'low'},text:{format:{type:'json_schema',name:'qms_scope_review',strict:true,schema}}})
    });
    if (!response.ok) {
      const error = response.status === 429 ? 'GPT 額度不足或服務繁忙，請管理員檢查 API 用量。' : response.status === 401 || response.status === 403 ? 'GPT 金鑰或存取權限無法使用，請管理員檢查。' : response.status === 404 ? 'GPT 模型無法使用，請管理員檢查模型設定。' : 'GPT 服務暫時無法完成分析，請稍後再試。';
      return res.status(502).json({error});
    }
    return res.status(200).json(parseAnalysis(await response.json()));
  } catch {return res.status(502).json({error:'分析逾時或未取得完整結果，請重新分析。'});}
}
