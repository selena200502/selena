const el = id => document.getElementById(id);
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let clerk;
function status(message, error=false) {el('status').textContent=message;el('status').classList.toggle('error',error);}
function loadScript(src,key) {
  return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.crossOrigin='anonymous';if(key)s.dataset.clerkPublishableKey=key;s.onload=resolve;s.onerror=()=>reject(new Error('無法載入登入服務，請檢查網路後重新整理。'));document.head.appendChild(s);});
}
function renderResult(d) {
  el('result').innerHTML='<h2>'+esc(d.judgment)+'</h2><p>'+esc(d.summary)+'</p><p class="audit">'+esc(d.audit_time_direction)+'</p><h3>用途、功能與失效後果</h3><div class="scroll"><table><thead><tr><th>預期用途</th><th>功能</th><th>失效後果</th><th>生命風險</th><th>經濟災難</th><th>情境判定</th></tr></thead><tbody>'+d.scenarios.map(r=>'<tr>'+['intended_use','function','failure_chain','life_risk','economic_catastrophe','conclusion'].map(k=>'<td>'+esc(r[k])+'</td>').join('')+'</tr>').join('')+'</tbody></table></div><h3>判定理由</h3><p>'+esc(d.reason)+'</p>'+(d.assumptions.length?'<h3>推估與未知條件</h3><ul>'+d.assumptions.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>':'');
}
async function sessionHeaders() {return {Authorization:'Bearer '+await clerk.session.getToken()};}
async function init() {
  try {
    const response=await fetch('/api/auth-config',{cache:'no-store'});const config=await response.json();if(!response.ok)throw new Error(config.error);
    const domain=atob(config.publishableKey.split('_')[2]).replace(/\$$/,'');
    if(!/^[a-zA-Z0-9.-]+$/.test(domain))throw new Error('登入服務設定不正確。');
    await loadScript('https://'+domain+'/npm/@clerk/ui@1/dist/ui.browser.js');
    await loadScript('https://'+domain+'/npm/@clerk/clerk-js@6/dist/clerk.browser.js',config.publishableKey);
    clerk=window.Clerk;await clerk.load({ui:{ClerkUI:window.__internal_ClerkUICtor}});
    if(!clerk.isSignedIn){status('請先登入指定帳號。');clerk.mountSignIn(el('login-widget'),{forceRedirectUrl:location.origin});el('signup').hidden=false;return;}
    el('login').hidden=true;el('logout').hidden=false;
    const session=await fetch('/api/session',{headers:await sessionHeaders(),cache:'no-store'});const user=await session.json();if(!session.ok)throw new Error(user.error);
    el('review').hidden=false;status('已登入：'+user.email);
  }catch(error){status(error.message || '登入服務無法使用，請重新整理。',true);}
}
el('logout').addEventListener('click',()=>clerk.signOut({redirectUrl:location.origin}));
el('signup').addEventListener('click',()=>{clerk.unmountSignIn(el('login-widget'));clerk.mountSignUp(el('login-widget'),{forceRedirectUrl:location.origin});el('signup').hidden=true;el('signin').hidden=false;});
el('signin').addEventListener('click',()=>{clerk.unmountSignUp(el('login-widget'));clerk.mountSignIn(el('login-widget'),{forceRedirectUrl:location.origin});el('signin').hidden=true;el('signup').hidden=false;});
el('scope-form').addEventListener('submit',async event=>{
  event.preventDefault();const scope=el('scope').value.trim();if(!scope)return;
  el('assess').disabled=true;el('scope').disabled=true;el('result').textContent='GPT 正在分析用途、功能與失效後果，請稍候…';
  try {
    const response=await fetch('/api/review',{method:'POST',headers:{...await sessionHeaders(),'Content-Type':'application/json','X-QMS-Request':'1'},body:JSON.stringify({scope}),signal:AbortSignal.timeout(60000)});
    const result=await response.json();if(!response.ok)throw new Error(result.error);renderResult(result);
  }catch(error){el('result').textContent=error.name==='TimeoutError'?'分析逾時，請重新分析。':error.message || '分析服務無法使用，請稍後再試。';}
  finally{el('assess').disabled=false;el('scope').disabled=false;}
});
el('scope').addEventListener('input',()=>{el('result').textContent='範圍已更新，請重新分析。';});
init();
