// All membership is ephemeral. No storage, no per-player timers and no polling.
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function createRoster() {
  const accounts = new Map(), guests = new Map(), clients = new Map();
  function remove(client) {
    const old = clients.get(client);
    if (!old) return false;
    clients.delete(client);
    const map = old.guest ? guests : accounts, group = map.get(old.id);
    group.clients.delete(client);
    if (!group.clients.size) map.delete(old.id);
    return true;
  }
  function add(client, identity) {
    const old = clients.get(client);
    if (old && old.id === identity.id && old.guest === identity.guest) {
      if (!identity.guest) accounts.get(old.id).name = identity.name;
      clients.set(client,identity); return;
    }
    remove(client);
    const map = identity.guest ? guests : accounts;
    let group = map.get(identity.id);
    if (!group) { group = {name:identity.name,clients:new Set()}; map.set(identity.id,group); }
    if (!identity.guest) group.name = identity.name;
    group.clients.add(client); clients.set(client,identity);
  }
  return {
    add, remove,
    identity: client => clients.get(client),
    accountClients: id => [...(accounts.get(id)?.clients || [])],
    counts: () => ({g:guests.size,a:accounts.size}),
    names: () => [...accounts.values()].map(x=>x.name).sort((a,b)=>a.localeCompare(b))
  };
}
