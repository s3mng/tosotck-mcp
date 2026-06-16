const BASE = "https://openapi.tossinvest.com";

const cache = { token: "", expiresAt: 0 };

export async function getToken(clientId: string, clientSecret: string): Promise<string> {
  if (cache.token && Date.now() < cache.expiresAt - 60_000) {
    return cache.token;
  }

  const res = await fetch(`${BASE}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) throw new Error(`인증 실패: ${res.status}`);
  const data = await res.json() as { access_token: string; expires_in?: number };

  cache.token = data.access_token;
  cache.expiresAt = Date.now() + (data.expires_in ?? 3600) * 1000;

  return cache.token;
}

export { BASE };
