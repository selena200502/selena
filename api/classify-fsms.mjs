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
      '冷凍或冷藏只是保存條件，不可看到「調理食品」就歸 CIV。冷凍／冷藏食品屬易腐產品，必須依實際原料組成判定：動物性為 CI、植物性為 CII、同時含動植物或完整混合餐食為 CIII；冷凍／冷藏食品不得回傳 CIV。',
      '判定優先序與 QMS／EMS／OHSMS 的 GPT-first 原則一致：先依完整語意提出 Food Chain Category，再用 ISO 22003-1 Annex A 與 FSMS 認證分類表確認。若正式表沒有完全相同的產品字眼但沒有類別定義衝突，保留 GPT 最合理建議並標示需人工覆核，不得改套近似類別。',
      'FI 是實體零售/批發，FII 是不實際持有產品的經紀/交易；G 運輸貯藏；H 支援服務；I 包材；J 設備；K 化學/生化投入物。',
      '茶葉製造、調製或加工屬常溫穩定食品加工 CIV；同一範圍另有茶葉銷售、零售或批發時，必須另外保留 FI，因此「茶葉之加工、銷售」至少回傳 CIV 與 FI，不得只回傳其中一項。',
      '若冷凍調理食品未說明動物性、植物性或混合原料，應以產品語意提出 CI／CII／CIII 中最合理候選，review_required=true，並在 missing_information 要求確認主要原料組成；絕不可用 CIV 代替。',
      'CI、CII、CIII 是依原料組成區分的互斥候選；不可因資訊不足就把三者全部列為適用類別。泛稱「冷凍調理食品」且未提供原料時，以通常的混合調理餐食提出 CIII 單一建議並要求確認原料；只有範圍明列多種彼此獨立的動物、植物或混合產品時才可同時回傳多個 C 類別。',
      '同一驗證範圍可同時包含不同保存條件的獨立產品，必須分別保留適用類別。例如「冷藏蛋糕、常溫蛋糕與餅乾之生產」應回傳 CIII（冷藏易腐混合產品）與 CIV（常溫穩定蛋糕／餅乾）；不得因整段出現「冷藏」就刪除常溫產品的 CIV，也不得把「蛋糕」字面的「蛋」直接視為單一動物性產品而判 CI。',
      '若範圍以編號、分號或換行列出多項產品／活動，必須逐項判定後取聯集，不得把各項原料合併成一個混合產品。例如「1、冷藏蔬菜之截切分裝與配送 2、冷凍肉品與加工品之分裝與配送 3、常溫五穀雜糧之分裝與配送」應保留 CI（冷凍肉品）、CII（冷藏蔬菜）、CIII（另列冷凍加工品）、CIV（常溫五穀雜糧）及 G（配送）。',
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

