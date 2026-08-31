import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import handler from '../api/classify.mjs';
import fsmsHandler from '../api/classify-fsms.mjs';

const root = path.resolve(import.meta.dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'build-ui.js'), 'utf8');
const api = fs.readFileSync(path.join(root, 'api/classify.mjs'), 'utf8');
const riskEngineSource = fs.readFileSync(path.join(root, 'risk-engine.js'), 'utf8');
for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)) {
  if (match[1].trim()) new vm.Script(match[1]);
}
new vm.Script(ui);
assert.match(html, /fetch\('\/api\/classify'/, 'front end must POST to /api/classify');
assert.match(html, /runNaceV2BeforeV4Hybrid/, 'offline engine must run before GPT hook');
assert.match(ui, /GPT Online \+ V8\.1\.15 Validation/);
assert.match(ui, /Offline Fallback/);
assert.match(ui, /r3EnsureApiReady/);
assert.doesNotMatch(html, /原始錯誤：/);
assert.match(html, /Object\.keys\(table\)\.find\(key=>normalizeTechnicalClass\(key\)===normalized\)/, 'risk lookup must preserve workbook codes with leading zero');
assert.doesNotMatch(html, /RiskEngine\.riskReferenceClass\([^\n]*technicalClass/, 'risk lookup must not receive the certification technical category');
assert.doesNotMatch(api, /gpt_technical_category/, 'GPT response schema must not return a technical category');
assert.doesNotMatch(html, /accepted\.gpt_technical_category|item\.gpt_technical_category|scope\.gpt_technical_category|rule\.gpt_technical_category/, 'GPT mapping must not write or provide a fallback technical category');
assert.match(html, /FALLBACK_NO_RISK_TABLE_MAPPING/, 'missing risk mapping must remain an explicit risk-table review');
assert.match(html, /calculateAuditV2BeforeFinalScopeHighestRisk/, 'highest final-scope risk must be selected before audit-day calculation');
assert.match(html, /applied_before_audit_day_lookup:true/, 'JSON must record that highest risk was applied before the audit-day table lookup');
assert.match(html, /Ds = TD \+ TH × \(HACCP studies - 1\) \+ TFTE/, 'FSMS must use the ISO 22003 Annex B formula');
assert.match(html, /controlling_category/, 'FSMS must retain the highest-TD controlling category');
assert.match(html, /FSMS_CATEGORIES/, 'FSMS categories must be an independent controlled dataset');
assert.match(html, /nace_applicability:'NOT_APPLICABLE'/, 'FSMS must explicitly exclude NACE 2.0');
assert.match(html, /risk:'高',complexity:'高'/, 'FSMS risk and complexity must both be high');
assert.match(html, /GPT_ISO_22003_1_WITH_FORMAL_CATEGORY_VALIDATION/, 'FSMS must use GPT ISO 22003-1 classification with formal table validation');
assert.match(html, /selection_mode:'AUTO_ONLY_READ_ONLY'/, 'FSMS categories must be automatic and read-only');
assert.match(html, /result\.add\('FI'\)/, 'tea sales guardrail must retain FI alongside processing');
assert.match(html, /site_stage_1_and_2_sum/, 'FSMS initial total must sum allocated Stage 1 and Stage 2 site days');
assert.match(html, /annual_addition_days:annual/, 'FSMS yearly P46/P47-style additions must be added to initial total');
assert.match(html, /fetch\('\/api\/classify-fsms'/, 'ISO 22000 must use its own GPT classification endpoint');
assert.match(html, /highestScopeRisk\(data,finalScopes=\[\]\)/, 'highest-risk selection must accept the final classified scopes');
assert.doesNotMatch(html, /v81RetainGptPreferredScopes\(output,preferred\);if\(preferred\.length\)render\(output\)/, 'GPT Preferred must not erase controlled risk and audit-day sections');
assert.match(api, /process\.env\.OPENAI_API_KEY/);
assert.doesNotMatch(html + ui + api, /sk-[A-Za-z0-9_-]{12,}/);
assert.match(html, /#caseWorkspace\{display:none!important\}/, 'desktop-only case workspace must be hidden in WEB R3');
assert.doesNotMatch(html, /\(async\(\)=>\{try\{let info=await caseApi\('\/api\/app-info'/, 'WEB R3 must not call the desktop app-info API on page load');
assert.doesNotMatch(html, /每次啟動(?:重新載入 API Key 並使用新的本機服務|使用新的本機服務並重新載入 API Key)/, 'browser copy must not describe loading an API key');
assert.match(html, /WEB R3 不呼叫未部署的 EnMS API/, 'EnMS must stay on the existing local rules in WEB R3');

delete process.env.OPENAI_API_KEY;
let statusCode = 0, body;
const req = {method:'POST', body:{input:{system:'ISO 9001'}}};
const res = {setHeader(){}, status(code){statusCode=code; return this;}, json(value){body=value; return value;}};
await handler(req, res);
assert.equal(statusCode, 503);
assert.match(body.error, /OPENAI_API_KEY/);

process.env.OPENAI_API_KEY = 'test-only-placeholder';
statusCode = 0; body = undefined;
await handler({method:'POST',body:{input:{system:'ISO 9001'},padding:'x'.repeat(256_001)}}, res);
assert.equal(statusCode, 413);

let outbound;
globalThis.fetch = async (_url, options) => {
  outbound = JSON.parse(options.body);
  return {ok:true, async json(){return {model:'test-model', output_text:JSON.stringify({
    candidates:[{economic_activity:'製造與銷售',product_function:'保護表面',process:'混合與包裝',activity:'製造',nace:'20.30',reason:'測試',confidence:90,missing_information:[],scope_segment:'油漆製造',object:'油漆',semantic_classification:'塗料製造',formal_match:'exact',evidence:['製造']}],
    outside_whitelist_suggestions:[],missing_information:[],review_required:true
  })};}};
};
statusCode = 0; body = undefined;
await handler({method:'POST',body:{input:{system:'ISO 9001',product:'油漆製造',scope_segments:['油漆製造'],scope_segment_details:[]}}}, res);
assert.equal(statusCode, 200);
assert.equal(body.candidates[0].economic_activity, '製造與銷售');
assert.equal(outbound.text.format.type, 'json_schema');
assert.equal(outbound.text.format.strict, true);
assert.match(outbound.instructions, /不得輸出或猜測 EA、Q\/E\/O 技術類別、風險、複雜度或人天/);

const riskSandbox = {};
vm.runInNewContext(riskEngineSource, riskSandbox);
const riskEngine = riskSandbox.RiskEngine;
assert.equal(riskEngine.riskReferenceClass('20.30','12','ISO 9001','塗料製造'), '12');
assert.equal(riskEngine.riskReferenceClass('49.41','31','ISO 14001','危險貨物運輸'), '31-3');
assert.equal(riskEngine.riskReferenceClass('49.41','31','ISO 45001','一般貨物運輸'), '31-2');
assert.equal(riskEngine.riskReferenceClass('82.92','35','ISO 9001','包裝服務'), '35-1');
// A changed or fabricated certification category is no longer an input, so it
// cannot overwrite the risk-workbook reference class.
assert.equal(riskEngine.riskReferenceClass('20.30','12','ISO 9001','99'), '12');
const highestQms = riskEngine.selectHighest([
  {nace:'46.75',technical_class:'29',risk:'低風險'},
  {nace:'20.30',technical_class:'12',risk:'高風險'},
  {nace:'22.21',technical_class:'14',risk:'中風險'}
], 'ISO 9001');
assert.equal(highestQms.selected.risk, '高風險');
const highestEms = riskEngine.selectHighest([
  {nace:'49.41',technical_class:'31-2',risk:'有限'},
  {nace:'20.30',technical_class:'12',risk:'高風險'},
  {nace:'22.21',technical_class:'14',risk:'低風險'}
], 'ISO 14001');
assert.equal(highestEms.selected.risk, '高風險');
const highestOhsms = riskEngine.selectHighest([
  {nace:'46.75',technical_class:'29-2',risk:'低風險'},
  {nace:'20.30',technical_class:'12',risk:'高風險'},
  {nace:'22.21',technical_class:'14',risk:'中風險'}
], 'ISO 45001');
assert.equal(highestOhsms.selected.risk, '高風險');
delete process.env.OPENAI_API_KEY;
statusCode = 0; body = undefined;
await fsmsHandler({method:'POST',body:{input:{system:'ISO 22000'}}},res);
assert.equal(statusCode,503);
process.env.OPENAI_API_KEY = 'test-only-placeholder';
globalThis.fetch = async (_url, options) => {
  outbound = JSON.parse(options.body);
  return {ok:true,async json(){return {model:'test-model',output_text:JSON.stringify({categories:[{code:'CII',scope_segment:'冷藏蔬菜加工',reason:'易腐植物產品加工',evidence:['冷藏','蔬菜加工'],confidence:91,review_required:false},{code:'G',scope_segment:'冷藏運輸',reason:'食品運輸與貯藏',evidence:['冷藏運輸'],confidence:88,review_required:false}],missing_information:[],review_required:false})};}};
};
statusCode = 0; body = undefined;
await fsmsHandler({method:'POST',body:{input:{system:'ISO 22000',product:'冷藏蔬菜加工及冷藏運輸'},allowed_categories:{}}},res);
assert.equal(statusCode,200);
assert.deepEqual(body.categories.map(item=>item.code),['CII','G']);
assert.match(outbound.instructions,/不可依 NACE、EA 或 QMS\/EMS\/OHSMS 技術類別轉換/);
assert.equal(outbound.text.format.strict,true);
delete process.env.OPENAI_API_KEY;
console.log('Smoke tests passed: syntax, API loading, structured GPT request, secret scan, automatic GPT hook, and offline fallback.');


