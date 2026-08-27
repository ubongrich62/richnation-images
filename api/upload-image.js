// Server-side proxy for uploading images to GitHub.
//
// The real GitHub token lives only in Vercel's encrypted environment
// variables (GITHUB_TOKEN), never in this file and never shipped to a
// browser. admin.html calls this endpoint instead of talking to GitHub's
// Contents API directly. APP_SECRET is a much lower-stakes shared value
// (it only gates "can call this upload proxy", not "can write to GitHub")
// so it's fine for it to live in admin.html's public source.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-app-secret');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (req.headers['x-app-secret'] !== process.env.APP_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { dataUrl, folder } = req.body || {};
  if (!dataUrl || typeof dataUrl !== 'string' || dataUrl.indexOf('data:image') !== 0) {
    return res.status(400).json({ error: 'dataUrl must be a data:image/... URI' });
  }
  const safeFolder = (folder || 'misc').replace(/[^a-z0-9_-]/gi, '');

  try {
    const commaIdx = dataUrl.indexOf(',');
    const base64Content = dataUrl.slice(commaIdx + 1);
    const mimeMatch = dataUrl.slice(0, commaIdx).match(/data:[^/]+\/([^;]+)/);
    const ext = (mimeMatch ? mimeMatch[1] : 'jpg').split('+')[0];
    const path = 'images/' + safeFolder + '/' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.' + ext;

    const owner = 'ubongrich62';
    const repo = 'richnation-images';
    const branch = 'main';

    const ghRes = await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + path, {
      method: 'PUT',
      headers: {
        Authorization: 'token ' + process.env.GITHUB_TOKEN,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: 'Upload ' + path, content: base64Content, branch }),
    });

    if (!ghRes.ok) {
      const errBody = await ghRes.text();
      return res.status(502).json({ error: 'GitHub upload failed: ' + ghRes.status, detail: errBody });
    }

    return res.status(200).json({ url: 'https://raw.githubusercontent.com/' + owner + '/' + repo + '/' + branch + '/' + path });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
