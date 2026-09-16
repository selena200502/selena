import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
import {validateScope,parseAnalysis} from '../lib/qms-analysis.mjs';

let authenticated=true;
let account={emailAddresses:[{emailAddress:'selena.yeh@ucscert.com.tw',verification:{status:'verified'}}]};
mock.module('@clerk/backend',{namedExports:{createClerkClient:()=>({authenticateRequest:async (request,options)=>{
  assert.deepEqual(options.authorizedParties,['https://selena-orpin.vercel.app']);
  assert.equal(options.acceptsToken,'session_token');
  return {isSignedIn:authenticated,toAuth:()=>({userId:authenticated?'user-approved':null})};
},users:{getUser:async()=>account}})}});
const {default:handler}=await import('../api/review.mjs');
process.env.CLERK_SECRET_KEY='test-only';
process.env.CLERK_PUBLISHABLE_KEY='test-only';
process.env.OPENAI_API_KEY='test-only';
const row={intended_use:'冷房除濕',function:'溫濕度控制',failure_chain:'電氣安全失效 → 觸電或起火',life_risk:'可能危及生命',economic_catastrophe:'一般維修費不是經濟災難',conclusion:'高風險因素'};
const result={judgment:'高風險初判',summary:'電氣設備',reason:'QMS 2 電氣設備範例及安全失效',audit_time_direction:'考量增加人天，無固定天數',assumptions:['可燃冷媒僅條件式風險'],scenarios:[row]};
const modelResult={status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(result)}]}]};
let calls=[];
const originalFetch=globalThis.fetch;
async function run(overrides={},apiResponse=modelResult,status=200) {
  calls=[];globalThis.fetch=async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify(apiResponse),{status});};
  const req={method:'POST',url:'/api/review',headers:{origin:'https://selena-orpin.vercel.app','x-qms-request':'1'},body:{scope:'冷氣機之生產'},...overrides};
  const res={code:200,body:null,setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
  await handler(req,res);return res;
}
test('approved verified user receives complete GPT result and strict schema',async()=>{
  const res=await run();assert.equal(res.code,200);assert.deepEqual(res.body,result);
  const body=JSON.parse(calls[0].options.body);assert.equal(body.store,false);assert.equal(body.text.format.strict,true);assert.deepEqual(JSON.parse(body.input),{scope:'冷氣機之生產'});
});
test('both approved email accounts are accepted after verification',async()=>{
  for (const email of ['selena.yeh@ucscert.com.tw','selena424@hotmail.com']) {
    account={emailAddresses:[{emailAddress:email,verification:{status:'verified'}}]};
    assert.equal((await run()).code,200);
  }
  account={emailAddresses:[{emailAddress:'selena.yeh@ucscert.com.tw',verification:{status:'verified'}}]};
});
test('anonymous requests cannot call GPT',async()=>{authenticated=false;try{assert.equal((await run()).code,401);assert.equal(calls.length,0);}finally{authenticated=true;}});
test('unverified and lookalike email addresses cannot call GPT',async()=>{
  for(const email of ['selena.yeh@ucscert.com.tw.attacker.test','other@ucscert.com.tw']){account={emailAddresses:[{emailAddress:email,verification:{status:'verified'}}]};assert.equal((await run()).code,403);assert.equal(calls.length,0);}
  account={emailAddresses:[{emailAddress:'selena.yeh@ucscert.com.tw',verification:{status:'unverified'}}]};assert.equal((await run()).code,403);
  account={emailAddresses:[{emailAddress:'selena.yeh@ucscert.com.tw',verification:{status:'verified'}}]};
});
test('cross-origin and missing application header are rejected before GPT',async()=>{
  for(const headers of [{origin:'https://attacker.test','x-qms-request':'1'},{origin:'https://selena-orpin.vercel.app'}]){assert.equal((await run({headers})).code,403);assert.equal(calls.length,0);}
});
test('empty oversized and malformed input is rejected',async()=>{
  for(const body of [{scope:''},{scope:'a'.repeat(2501)},'{invalid']){assert.equal((await run({body})).code,400);assert.equal(calls.length,0);}
  assert.equal(validateScope({scope:' 冷氣機之生產 '}),'冷氣機之生產');
});
test('incomplete refusal and missing risk details cannot be shown as successful analysis',async()=>{
  for(const response of [{...modelResult,status:'incomplete'},{output:[{type:'message',content:[{type:'refusal'}]}]},{output_text:JSON.stringify({...result,scenarios:[{...row,life_risk:''}]})}])assert.equal((await run({},response)).code,502);
  assert.throws(()=>parseAnalysis({output_text:'{}'}));
});
test('upstream error never exposes secret-bearing error payload',async()=>{const res=await run({},{error:{message:'test-sensitive-token'}},401);assert.equal(res.code,502);assert.doesNotMatch(JSON.stringify(res.body),/test-sensitive-token/);});
test('cleanup',()=>{globalThis.fetch=originalFetch;});
