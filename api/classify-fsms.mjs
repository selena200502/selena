const MODEL = process.env.OPENAI_MODEL || 'gpt-5.4-mini';
const OPENAI_URL = 'https://api.openai.com/v1/responses';
const MAX_REQUEST_BYTES = 128_000;

const CODES = ['AI','AII','BI','BII','BIII','C0','CI','CII','CIII','CIV','D','E','FI','FII','G','H','I','J','K'];

function responseText(data) {
  if (typeof data.output_text === 'string') return data.output_text;
  for (const item of data.output || []) for (const content of item.content || []) {
    if (content.type === 'output_text' && typeof content.text === 'string') return content.text;
  }
  throw new Error('模型未回傳可解析的結構化結果');
}

const schema = {
  type:'object',additionalProperties:false,properties:{
    categories:{type:'array',minItems:1,maxItems:8,items:{type:'object',additionalProperties:false,properties:{
      code:{type:'string',enum:CODES},scope_segment:{type:'string'},reason:{type:'string'},evidence:{type:'array',items:{type:'string'}},confidence:{type:'integer',minimum:0,maximum:100},review_required:{type:'boolean'}
    },required:['code','scope_segment','reason','evidence','confidence','review_required']}},
    missing_information:{type:'array',items:{type:'string'}},review_required:{type:'boolean'}
  },required:['categories','missing_information','review_required']
};

export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  if(!process.env.OPENAI_API_KEY)return res.status(503).json({error:'尚未設定 OPENAI_API_KEY；請人工選擇 FSMS 類別。'});
  try{
    const payload=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    if(Buffer.byteLength(JSON.stringify(payload),'utf8')>MAX_REQUEST_BYTES)return res.status(413).json({error:'請求內容過大。'});
    if(payload.input?.system!=='ISO 22000')return res.status(400).json({error:'此流程僅適用 ISO 22000。'});
    const instructions=[
      '你是 ISO 22003-1:2022 Annex A 食品鏈類別判定助理，使用繁體中文。',
      '只可從 AI、AII、BI、BII、BIII、C0、CI、CII、CIII、CIV、D、E、FI、FII、G、H、I、J、K 選擇。',
      '依實際產品、製程、保存條件、服務及在食品鏈中的角色作實質判定，不可依 NACE、EA 或 QMS/EMS/OHSMS 技術類別轉換。',
      '同一驗證範圍可有多個適用類別，必須全部分列；不得為了人天只留下單一類別。',
      'C0 是動物屠宰等初級轉換；CI 是易腐動物產品；CII 是易腐植物產品；CIII 是易腐混合產品；CIV 是常溫穩定食品。',
      'FI 是實體零售/批發，FII 是不實際持有產品的經紀/交易；G 運輸貯藏；H 支援服務；I 包材；J 設備；K 化學/生化投入物。',
      '若資訊不足仍選最合理候選，但 review_required=true 並列出缺少的保存條件、製程或產品用途。',
      'allowed_categories 是正式定義來源；不要輸出風險、複雜度、NACE、EA 或人天。'
    ].join('\n');
    const apiResponse=await fetch(OPENAI_URL,{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:MODEL,instructions,input:JSON.stringify(payload),text:{format:{type:'json_schema',name:'fsms_classification',strict:true,schema}}})});
    const data=await apiResponse.json();
    if(!apiResponse.ok)throw new Error(data.error?.message||'OpenAI API 呼叫失敗');
    const parsed=JSON.parse(responseText(data));
    parsed.categories=(parsed.categories||[]).filter(item=>CODES.includes(item.code));
    return res.status(200).json({...parsed,model:data.model||MODEL,source:'ISO 22003-1:2022 Annex A GPT semantic classification'});
  }catch(error){return res.status(502).json({error:error.message||'FSMS 分類失敗'});}
}

