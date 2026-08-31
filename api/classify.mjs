const MODEL = process.env.OPENAI_MODEL || 'gpt-5.4-mini';
const OPENAI_URL = 'https://api.openai.com/v1/responses';
const MAX_REQUEST_BYTES = 256_000;

function responseText(data) {
  if (typeof data.output_text === 'string') return data.output_text;
  for (const item of data.output || []) {
    if (item.type !== 'message') continue;
    for (const content of item.content || []) {
      if (content.type === 'output_text' && typeof content.text === 'string') return content.text;
    }
  }
  throw new Error('模型未回傳可解析的結構化結果');
}

function requestBody(req) {
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  return req.body || {};
}

function hasDualActivity(input) {
  const details = input.scope_segment_details || [];
  return details.some(detail => {
    const text = [detail.product || '', ...(detail.activities || [])].join(' ');
    return /(?:設計|開發|生產|製造|加工|組裝)/.test(text) && /(?:銷售|配銷|買賣|批發)/.test(text);
  }) || (/(?:設計|開發|生產|製造|加工|組裝)/.test(input.product || '') && /(?:銷售|配銷|買賣|批發)/.test(input.product || ''));
}

const schema = dual => ({
  type:'object', additionalProperties:false,
  properties:{
    candidates:{type:'array', minItems:dual?2:1, maxItems:12, items:{
      type:'object', additionalProperties:false,
      properties:{
        economic_activity:{type:'string'}, nace:{type:'string'}, scope_segment:{type:'string'}, object:{type:'string'},
        product_function:{type:'string'}, process:{type:'string'},
        activity:{type:'string', enum:['設計','製造','印刷','銷售','安裝','維修','運輸','倉儲','顧問','試驗','租賃','管理','服務']},
        semantic_classification:{type:'string'},
        formal_match:{type:'string', enum:['exact','partial','none','conflict']},
        confidence:{type:'integer',minimum:0,maximum:100}, reason:{type:'string'},
        evidence:{type:'array',items:{type:'string'}},
        missing_information:{type:'array',items:{type:'string'}}
      },
      required:['economic_activity','product_function','process','activity','nace','reason','confidence','missing_information','scope_segment','object','semantic_classification','formal_match','evidence']
    }},
    outside_whitelist_suggestions:{type:'array',maxItems:6,items:{type:'object',additionalProperties:false,properties:{nace:{type:'string'},scope_segment:{type:'string'},reason:{type:'string'},evidence:{type:'array',items:{type:'string'}}},required:['nace','scope_segment','reason','evidence']}},
    missing_information:{type:'array',items:{type:'string'}}, review_required:{type:'boolean'}
  },
  required:['candidates','outside_whitelist_suggestions','missing_information','review_required']
});

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({error:'尚未設定 OPENAI_API_KEY；前端將改用離線規則引擎。'});
  try {
    const payload = requestBody(req);
    if (Buffer.byteLength(JSON.stringify(payload), 'utf8') > MAX_REQUEST_BYTES) {
      return res.status(413).json({error:'請求內容過大；前端將保留離線規則引擎結果。'});
    }
    const input = payload.input || {};
    if (!['ISO 9001','ISO 14001','ISO 45001'].includes(input.system)) {
      return res.status(400).json({error:'此 GPT NACE 流程僅適用 ISO 9001、ISO 14001、ISO 45001。'});
    }
    const dual = hasDualActivity(input);
    const instructions = [
      '你是管理系統驗證範圍的第一階段語意分類助理。使用繁體中文。',
      '固定判定鏈：認證範圍 → 實際經濟活動 economic_activity → 產品功能 product_function → 製程 process → NACE Division → Group → Class → Included/Excluded 驗證。不得輸出或猜測 EA、Q/E/O 技術類別、風險、複雜度或人天；這些只由前端 V8.1.12 受控規則推導。',
      '先獨立依完整語意提出候選，再以 allowed_nace_catalog 驗證。它是驗證資料，不是白名單或答案來源。',
      '若 NACE Rev.2 沒有完全適宜項目，保留 GPT 最合理建議，formal_match 設 partial 或 none，列出缺少資訊並要求人工覆核；不得硬套近似碼。',
      '每個 candidate 只代表一個 scope_segment 的一個獨立交付活動。scope_segment 必須逐字等於 input.scope_segments 的一項。',
      '同段明列製造／生產／加工／組裝與銷售／買賣／配銷／批發時，必須同時輸出製造與貿易候選，互不覆蓋。',
      '多產品、多製程、多服務或多活動應分列，最多十二項。附屬於主要交付的設計、安裝、維修、檢驗不另分類，除非文字明示為獨立或受託服務。',
      '依產品功能、最終用途、材料與實際製程綜合判斷，不可只靠關鍵字；產品名稱本身不可自動產生製造活動。',
      '原料、半成品、成品與純銷售必須分開。初級塑膠需有聚合／造粒證據；薄膜板片等成品不因材質名稱歸入初級原料。',
      'reason 必須摘要 Division→Group→Class 與 Included/Excluded 驗證；missing_information 列出該候選缺少的案件資料。所有候選預設需人工覆核；evidence 說明範圍中的直接證據。',
      dual ? '程式已確認同段同時含製造類與銷售類活動；至少回傳一個製造候選與一個貿易候選。' : '仍須自行檢查是否存在多活動或多組合。',
      '遵守 payload.known_error_guardrails，並保留 V8.1.12 既有優化條件。'
    ].join('\n');
    const apiResponse = await fetch(OPENAI_URL, {
      method:'POST',
      headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},
      body:JSON.stringify({
        model:MODEL, store:false, instructions, input:JSON.stringify(payload),
        text:{format:{type:'json_schema',name:'nace_semantic_candidates',strict:true,schema:schema(dual)}}
      })
    });
    const data = await apiResponse.json();
    if (!apiResponse.ok) throw new Error(data?.error?.message || `OpenAI API 錯誤 (${apiResponse.status})`);
    return res.status(200).json({...JSON.parse(responseText(data)), model:data.model || MODEL});
  } catch (error) {
    console.error('GPT classification failed', error);
    return res.status(502).json({error:'GPT 判定暫時無法使用；前端將保留離線規則引擎結果。'});
  }
}

