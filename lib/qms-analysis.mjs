export function validateScope(body) {
  if (!body || typeof body.scope !== 'string') throw new Error('請填寫驗證服務範圍。');
  const scope = body.scope.trim();
  if (!scope || scope.length > 2500) throw new Error('驗證服務範圍需為 1 至 2500 字。');
  return scope;
}

export function parseAnalysis(data) {
  if (data.status === 'incomplete') throw new Error('分析未完成，請重新分析。');
  const parts = (data.output || []).filter(x => x.type === 'message').flatMap(x => x.content || []);
  if (parts.some(x => x.type === 'refusal')) throw new Error('此範圍無法完成分析。');
  const raw = data.output_text || parts.filter(x => x.type === 'output_text').map(x => x.text).join('');
  const result = JSON.parse(raw);
  if (!['高風險初判','可能高風險','未辨識高風險','待確認'].includes(result.judgment)) throw new Error('分析結果格式不正確。');
  for (const field of ['summary','reason','audit_time_direction']) if (typeof result[field] !== 'string' || !result[field].trim()) throw new Error('分析結果缺少說明。');
  if (!Array.isArray(result.assumptions) || !result.assumptions.every(x => typeof x === 'string')) throw new Error('分析條件格式不正確。');
  if (!Array.isArray(result.scenarios) || !result.scenarios.length || result.scenarios.length > 12) throw new Error('分析情境格式不正確。');
  for (const row of result.scenarios) for (const field of ['intended_use','function','failure_chain','life_risk','economic_catastrophe','conclusion']) if (typeof row[field] !== 'string' || !row[field].trim()) throw new Error('分析情境缺少說明。');
  return result;
}
