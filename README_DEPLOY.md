# V8.1.12 WEB R3：Vercel 部署與測試

本資料夾是一個完整 R3，不是 R2 改名。一般使用者在 `index.html` 按「執行判定」後，程式會先產生 V8.1.12 Offline Engine 結果，再自動 `POST /api/classify`。GPT 負責 NACE 語意主判定；正式 NACE/EA 對照、Q/E/O 技術類別、風險/複雜度與人天仍由瀏覽器內既有 V8.1.12 受控規則映射及驗證。

API Key 只由 Vercel Serverless Function 讀取 `process.env.OPENAI_API_KEY`。前端、Git repository 和輸出 JSON 都不需要、也不應包含真實 Key。

## 專案內容

- `index.html`：完整 V8.1.12 UI 與 Offline Engine；自動呼叫 GPT，保留製造＋銷售、多產品、多製程與多活動組合。
- `api/classify.mjs`：OpenAI Responses API 結構化輸出端點。
- `api/health.mjs`：只回報 serverless 是否運作、GPT 是否已設定，不回傳 Key、模型或其他秘密。
- `formal-sources.js`、`activity-engine.js`、`risk-engine.js`：原有正式對照、活動與風險規則。
- `.env.example`：僅供變數名稱示範；不可填入真實 Key 後提交。

## 部署到 Vercel

R3 含 Serverless Function，請用 Git repository 匯入部署，不要把它當成只有 HTML 的 Vercel Drop 靜態網站。

1. 將整個 `V8.1.12-WEB-R3` 資料夾放進 GitHub、GitLab 或 Bitbucket repository 並推送。
2. 到 Vercel 選 **Add New → Project**，匯入該 repository。
3. **Framework Preset** 選 `Other`。
4. 若 repository 根目錄就是本資料夾，**Root Directory** 保持預設；若本資料夾在 repository 內，Root Directory 指向 `V8.1.12-WEB-R3`。
5. **Build Command** 與 **Output Directory** 留空；本專案不需前端建置。
6. Node runtime 由 `package.json` 指定為 Node.js 20 或以上，且沒有第三方套件。
7. 完成下方環境變數設定後按 **Deploy**。

## 設定 OPENAI_API_KEY

1. 進入 Vercel Project，開啟 **Settings → Environment Variables**。
2. Name 輸入 `OPENAI_API_KEY`，Value 貼上 OpenAI Project API Key。
3. 建議環境：Production 正式站必須設定；Preview 只在受控測試時設定；Development 使用 `vercel dev` 時可放在本機 `.env.local`，該檔已被 `.gitignore` 排除。
4. 儲存後必須到 **Deployments** 對最新部署選 **Redeploy**；既有 deployment 不會自動取得新變數。

不要新增前端 API Key 欄位，也不要把真實值寫入 `.env.example`、HTML、JavaScript 或 Git。

本 WEB R3 只部署 `GET /api/health` 與 `POST /api/classify`。舊桌面版的案件工作區 API 與 EnMS 語意補強 API 不屬於此部署；EnMS 仍使用既有 V8.1.12 本地規則與人工覆核。前端不會在載入頁面時呼叫桌面版 API。

## 測試健康檢查

開啟 `https://你的網域.vercel.app/api/health`。Serverless 正常且 Key 已設定時應看到：

```json
{"ok":true,"app_version":"V8.1.12-WEB-R3","serverless":true,"gpt_configured":true}
```

`gpt_configured:false` 表示函式已啟用，但該 deployment 沒有取得 `OPENAI_API_KEY`。健康檢查不會驗證 Key 是否有效，也不會洩漏 Key。

## 測試 GPT 判定與 fallback

1. 開啟首頁，輸入認證範圍與案件資料。
2. 建議用「油漆及塗料之製造與銷售」測試多活動；活動同時勾選製造與銷售。
3. 按「執行判定」。本地 V8.1.12 結果會先完成，瀏覽器再自動呼叫 `/api/classify`，不需複製貼上。
4. GPT 成功並經本地驗證後，頁首顯示 **GPT Online + V8.1.12 Validation**。
5. 正式 NACE 沒有完全適宜項目時，結果應保留 **GPT Preferred / Manual Review**，不可用近似正式碼強制覆蓋。
6. 移除 Key、封鎖網路或讓 API 暫時失敗後重新測試，頁首應顯示 **Offline Fallback**，且仍保留 Offline Engine 結果。一般使用者不會看到 API Key、技術 JSON或設定畫面。

可在本資料夾執行 `npm test` 做本機 smoke test；它會檢查前端 script 語法、Serverless Function 可載入、前端自動 `/api/classify` hook、fallback、狀態文字及常見 Key 格式洩漏。

## 常見問題

- **Failed to fetch**：瀏覽器完全沒有收到 `/api/classify` 的 HTTP 回應。先直接開啟同一網域的 `/api/health`；若它也無法開啟，通常是直接雙擊 `index.html`、使用純靜態 Vercel Drop、Root Directory 錯誤，或部署未包含 `api`。必須從 Vercel 部署後的 `https://...vercel.app` 首頁操作，不能用 `file://` 本機檔案直接呼叫 Serverless Function。
- **401**：Key 無效、已撤銷或貼錯。更新 Vercel 環境變數並重新部署；前端會自動 fallback。
- **404**：多半是用純靜態 Drop、Root Directory 指錯，或 `api` 不在部署根目錄。改用 Git import 並修正根目錄。
- **500/502/503**：503 通常表示未設定 Key；502 通常是 OpenAI API、額度、模型權限或回傳解析失敗。查看 Vercel **Logs → Functions**；使用者端仍會 fallback。
- **CORS**：首頁與 `/api/*` 應使用同一 Vercel 網域，因此不需要 CORS。不要從 `file://` 或另一網域直接呼叫 API；如確需跨網域，應先定義允許來源與驗證機制，不要使用公開萬用 `*`。
- **健康檢查成功但 GPT 失敗**：健康檢查只確認變數存在。請檢查 OpenAI Project 的 Key 狀態、API 額度與 Vercel Function logs。

正式案件仍應保留人工覆核。GPT 不得直接決定 EA、Q/E/O 技術類別、風險/複雜度或人天。

