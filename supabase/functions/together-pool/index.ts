import { createPoolHandler } from './handler.js';
const url = Deno.env.get('SUPABASE_URL')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
async function api(path: string, token: string, key: string, body?: unknown) {
  const response = await fetch(url + path, { method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: token, apikey: key, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body) });
  // The gateway in front of the database answers a blip with a Cloudflare HTML
  // page (520-527). Parsing that as JSON only sent
  // "Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON" to the player, so
  // a body that is not JSON is reported as the temporary outage it is.
  const text = await response.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!response.ok || data === null) {
    const message = data && (data.message || data.msg) || 'Pool is temporarily unavailable. Please try again.';
    const error = new Error(message) as Error & {status:number};
    error.status = response.ok ? 503 : response.status;
    throw error;
  }
  return data;
}
Deno.serve(createPoolHandler({
  authorize: (auth: string) => api('/auth/v1/user', auth, anonKey),
  readMatch: (auth: string, id: string) => api('/rest/v1/rpc/bt_rpc', auth, anonKey, { action: 'match', args: { match_id: id } }),
  commitShot: (shot: unknown) => api('/rest/v1/rpc/bt_pool_commit', 'Bearer ' + serviceKey, serviceKey, { shot })
}));
