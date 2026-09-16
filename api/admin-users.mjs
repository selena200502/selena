import { authorizeAdmin, sameOrigin, administratorEmails } from '../lib/access.mjs';

function record(user) {
  const emails=(user.emailAddresses||[]).filter(x=>x.verification?.status==='verified').map(x=>x.emailAddress.toLowerCase());
  return {id:user.id,email:emails[0]||'',approved:user.publicMetadata?.qmsApproved===true||emails.some(x=>administratorEmails.has(x)),administrator:emails.some(x=>administratorEmails.has(x))};
}
export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if (!sameOrigin(req,res)) return;
  const admin=await authorizeAdmin(req,res);if(!admin)return;
  if(req.method==='GET') {
    const result=await admin.client.users.getUserList({limit:100,orderBy:'-created_at'});
    return res.status(200).json({users:result.data.map(record)});
  }
  if(req.method==='PATCH') {
    const {userId,approved}=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
    if(typeof userId!=='string'||typeof approved!=='boolean')return res.status(400).json({error:'核准資料不正確。'});
    const target=await admin.client.users.getUser(userId);
    if(record(target).administrator)return res.status(400).json({error:'管理者帳號保持核准狀態。'});
    const current=target.publicMetadata||{};
    await admin.client.users.updateUserMetadata(userId,{publicMetadata:{...current,qmsApproved:approved}});
    return res.status(200).json({user:{...record(target),approved}});
  }
  return res.status(405).json({error:'Method not allowed'});
}
