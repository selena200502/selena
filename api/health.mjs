export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({error:'Method not allowed'});
  return res.status(200).json({
    ok: true,
    app_version: 'V8.1.12-WEB-R3',
    serverless: true,
    gpt_configured: Boolean(process.env.OPENAI_API_KEY)
  });
}

