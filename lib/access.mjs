import { createClerkClient } from '@clerk/backend';

export const approvedEmail = 'selena.yeh@ucscert.com.tw';
export function publishableKey() {
  return process.env.CLERK_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '';
}
function clerkClient() {
  return createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY, publishableKey: publishableKey() });
}
export function approvedUser(user) {
  return user?.emailAddresses?.some(x => x.emailAddress?.toLowerCase() === approvedEmail && x.verification?.status === 'verified') || false;
}
export async function authorize(req, res) {
  if (!process.env.CLERK_SECRET_KEY || !publishableKey()) {
    res.status(503).json({error:'登入服務尚未完成設定。'}); return null;
  }
  try {
    const headers = new Headers();
    for (const [key,value] of Object.entries(req.headers)) if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : String(value));
    const origin = 'https://selena-orpin.vercel.app';
    const client = clerkClient();
    const state = await client.authenticateRequest(new Request(origin + req.url, {headers}), { authorizedParties:[origin], acceptsToken:'session_token' });
    const auth = state.toAuth();
    if (!auth?.userId || !state.isSignedIn) {res.status(401).json({error:'請先登入指定帳號。'}); return null;}
    const user = await client.users.getUser(auth.userId);
    if (!approvedUser(user)) {res.status(403).json({error:'此帳號未獲授權，請使用指定帳號登入。'}); return null;}
    return {userId:auth.userId, email:approvedEmail};
  } catch {
    res.status(401).json({error:'登入已過期或無法驗證，請重新登入。'}); return null;
  }
}

export function sameOrigin(req, res) {
  if (req.headers.origin !== 'https://selena-orpin.vercel.app' || req.headers['x-qms-request'] !== '1') {
    res.status(403).json({error:'請從本網站執行分析。'}); return false;
  }
  return true;
}
