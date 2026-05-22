const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.SPOTIFY_REFRESH_TOKEN;

const TOKEN_ENDPOINT = 'https://accounts.spotify.com/api/token';
const NOW_PLAYING_ENDPOINT = 'https://api.spotify.com/v1/me/player/currently-playing';

async function getAccessToken() {
  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: REFRESH_TOKEN,
    }),
  });
  return response.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=5, stale-while-revalidate=10');

  // Debug mode: /api/spotify-now-playing?debug=1
  const debug = req.query?.debug === '1';

  try {
    if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
      const missing = [];
      if (!CLIENT_ID) missing.push('SPOTIFY_CLIENT_ID');
      if (!CLIENT_SECRET) missing.push('SPOTIFY_CLIENT_SECRET');
      if (!REFRESH_TOKEN) missing.push('SPOTIFY_REFRESH_TOKEN');
      if (debug) return res.status(200).json({ error: 'Missing env vars', missing });
      return res.status(200).json({ isPlaying: false });
    }

    const tokenData = await getAccessToken();
    if (debug && !tokenData.access_token) {
      return res.status(200).json({ error: 'Token exchange failed', tokenError: tokenData.error, tokenDesc: tokenData.error_description });
    }

    const { access_token } = tokenData;
    const response = await fetch(NOW_PLAYING_ENDPOINT, {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    if (response.status === 204 || response.status > 400) {
      if (debug) return res.status(200).json({ isPlaying: false, reason: 'No active player', spotifyStatus: response.status });
      return res.status(200).json({ isPlaying: false });
    }

    const data = await response.json();

    if (!data.item) {
      return res.status(200).json({ isPlaying: false });
    }

    return res.status(200).json({
      isPlaying: data.is_playing,
      title: data.item.name,
      artist: data.item.artists.map((a) => a.name).join(', '),
      albumArt: data.item.album.images?.[2]?.url || data.item.album.images?.[0]?.url,
      songUrl: data.item.external_urls.spotify,
    });
  } catch (error) {
    return res.status(200).json({ isPlaying: false });
  }
}
