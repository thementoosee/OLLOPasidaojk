// Fetches Twitch profile images for a list of usernames
// Uses App Access Token (no user auth needed)

let cachedToken = null;
let tokenExpiry = 0;

async function getAppAccessToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('TWITCH_CLIENT_ID or TWITCH_CLIENT_SECRET not set');
  }

  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    }),
  });

  if (!res.ok) throw new Error('Failed to get Twitch app token');

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { usernames } = req.body;
    if (!Array.isArray(usernames) || usernames.length === 0) {
      return res.status(400).json({ error: 'usernames array required' });
    }

    // Twitch API allows max 100 users per request
    const token = await getAppAccessToken();
    const clientId = process.env.TWITCH_CLIENT_ID;
    const results = {};

    // Process in batches of 100
    for (let i = 0; i < usernames.length; i += 100) {
      const batch = usernames.slice(i, i + 100);
      const params = batch.map(u => `login=${encodeURIComponent(u.toLowerCase())}`).join('&');

      const twitchRes = await fetch(`https://api.twitch.tv/helix/users?${params}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Client-Id': clientId,
        },
      });

      if (!twitchRes.ok) {
        console.error('Twitch API error:', twitchRes.status, await twitchRes.text());
        continue;
      }

      const twitchData = await twitchRes.json();
      for (const user of twitchData.data || []) {
        results[user.login.toLowerCase()] = {
          profile_image_url: user.profile_image_url,
          display_name: user.display_name,
        };
      }
    }

    return res.status(200).json({ users: results });
  } catch (err) {
    console.error('Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
