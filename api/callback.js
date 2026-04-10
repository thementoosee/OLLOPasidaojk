export default async function handler(req, res) {
  const { code } = req.query;
  if (!code) {
    return res.status(400).send('Missing code parameter');
  }
  res.status(200).send(`<html><body style="background:#111;color:#fff;font-family:monospace;padding:40px">
    <h2>Your Spotify authorization code:</h2>
    <pre style="background:#222;padding:20px;border-radius:8px;word-break:break-all">${code}</pre>
    <p>Copy this code and use it in Step 2 below.</p>
  </body></html>`);
}
