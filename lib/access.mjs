import { createClerkClient } from '@clerk/backend';

export const administratorEmails = new Set([
  'selena.yeh@ucscert.com.tw',
  'selena424@hotmail.com',
]);
export function publishableKey() {
  return process.env.CLERK_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '';
}
function clerkClient() {
  return createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY, publishableKey: publishableKey() });
}
export function approvedUser(user) {
  return verifiedEmails(user).some(email => administratorEmails.has(email)) || user?.publicMetadata?.qmsApproved === true;
}
function verifiedEmails(user) {
  return user?.emailAddresses?.filter(x => x.verification?.status === 'verified').map(x => x.emailAddress?.toLowerCase()).filter(Boolean) || [];
}
async function authenticatedUser(req, res) {
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
    const email = verifiedEmails(user)[0];
    if (!email) {res.status(403).json({error:'請先完成電子郵件驗證。'}); return null;}
    return {userId:auth.userId, email, user};
  } catch {
    res.status(401).json({error:'登入已過期或無法驗證，請重新登入。'}); return null;
  }
}

export async function authorize(req, res) {
  const session = await authenticatedUser(req,res);
  if (!session) return null;
  if (!approvedUser(session.user)) {res.status(403).json({error:'此帳號尚未經管理者核准。'}); return null;}
  return {userId:session.userId,email:session.email,isAdmin:administratorEmails.has(session.email)};
}

export async function authorizeAdmin(req,res) {
  const session = await authenticatedUser(req,res);
  if (!session) return null;
  if (!administratorEmails.has(session.email)) {res.status(403).json({error:'只有管理者可以核准使用者。'}); return null;}
  return {userId:session.userId,email:session.email,client:clerkClient()};
}

export function sameOrigin(req, res) {
  if (req.headers.origin !== 'https://selena-orpin.vercel.app' || req.headers['x-qms-request'] !== '1') {
    res.status(403).json({error:'請從本網站執行分析。'}); return false;
  }
  return true;
}
