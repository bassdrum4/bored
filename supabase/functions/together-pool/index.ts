import { createPoolHandler } from './handler.js';
const url = Deno.env.get('SUPABASE_URL')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
async function api(path: string, token: string, key: string, body?: unknown) {
  const response = await fetch(url + path, { method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: token, apikey: key, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.message || data.msg || 'Pool request failed.') as Error & {status:number};
    error.status = response.status; throw error;
  }
  return data;
}
Deno.serve(createPoolHandler({
  authorize: (auth: string) => api('/auth/v1/user', auth, anonKey),
  readMatch: (auth: string, id: string) => api('/rest/v1/rpc/bt_rpc', auth, anonKey, { action: 'match', args: { match_id: id } }),
  commitShot: (shot: unknown) => api('/rest/v1/rpc/bt_pool_commit', 'Bearer ' + serviceKey, serviceKey, { shot })
}));
