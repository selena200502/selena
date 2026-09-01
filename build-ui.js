(function () {
  const nativeFetch = window.fetch.bind(window);
  const style = document.createElement('style');
  style.textContent = '#caseWorkspace, #caseWorkspace + section { display:none !important } .deployment-mode{max-width:1180px;margin:14px auto 0;padding:0 18px}.deployment-mode span{display:inline-block;padding:8px 12px;border-radius:999px;background:#fff0d0;color:#8a5100;font-weight:800}.deployment-mode.online span{background:#dbf7e8;color:#087443}';
  document.head.appendChild(style);
  const mode = document.createElement('div');
  mode.className = 'deployment-mode';
  mode.innerHTML = '<span id="deploymentMode">正在檢查 GPT 服務…</span><p class="small" id="deploymentModeNote">若 API 不可用，系統會自動保留並顯示 V8.1.25 離線結果。</p>';
  document.querySelector('header').after(mode);
  document.title = '驗證範圍 GPT 混合引擎 — V8.1.25 R3';
  document.querySelector('header p').textContent = 'V8.1.25 R3｜Q/E/O 採 GPT NACE；FSMS 自動判定 ISO 22003-1 食品鏈類別';
  function showOnline() {
    mode.classList.add('online');
    document.querySelector('#deploymentMode').textContent = 'GPT Online + V8.1.25 Validation';
    document.querySelector('#deploymentModeNote').textContent = 'QMS／EMS／OHSMS 使用 NACE 驗證；FSMS 只使用 ISO 22003-1 Food Chain Category 與 FSMS 認證分類表。';
  }
  function showFallback() {
    mode.classList.remove('online');
    document.querySelector('#deploymentMode').textContent = 'Offline Fallback';
    document.querySelector('#deploymentModeNote').textContent = '線上判定目前不可用；畫面保留 V8.1.25 Offline Engine 結果，可繼續使用並交由人工覆核。';
  }
  window.r3EnsureApiReady = async function () {
    if (location.protocol === 'file:') {
      showFallback();
      throw new Error('R3_API_UNAVAILABLE');
    }
    try {
      const response = await nativeFetch('/api/health', {cache:'no-store'});
      const data = await response.json();
      if (!response.ok || !data.serverless || !data.gpt_configured) throw new Error('R3_API_UNAVAILABLE');
      return true;
    } catch (error) {
      showFallback();
      console.warn('R3 serverless preflight failed.', error);
      throw new Error('R3_API_UNAVAILABLE');
    }
  };
  window.fetch = async function (resource, options) {
    const url = typeof resource === 'string' ? resource : resource?.url || '';
    try {
      const response = await nativeFetch(resource, options);
      if (url.endsWith('/api/classify')) response.ok ? showOnline() : showFallback();
      return response;
    } catch (error) {
      if (url.endsWith('/api/classify')) showFallback();
      throw error;
    }
  };
  nativeFetch('/api/health', {cache:'no-store'}).then(async response => {
    const data = await response.json();
    if (!response.ok || !data.gpt_configured) throw new Error('unavailable');
    mode.classList.add('online');
    document.querySelector('#deploymentMode').textContent = 'GPT 服務已就緒';
    document.querySelector('#deploymentModeNote').textContent = '按「執行判定」後會先跑 Offline Engine，再自動進行線上 GPT 判定與本地規則驗證。';
  }).catch(showFallback);
})();






