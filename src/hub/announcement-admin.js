import { request, freshSession } from './backend.js';

export function createAnnouncementAdmin() {
  const $ = id => document.getElementById(id);
  const el = (tag, value) => {
    const n = document.createElement(tag);
    if (value !== undefined) n.textContent = value;
    return n;
  };
  let initialized = false, loading = false;
  const status = text => { $('announcement-admin-status').textContent = text; };
  const showRecipients = () => {
    $('announcement-recipients-row').hidden = $('announcement-audience').value !== 'selected';
  };

  async function reload() {
    if (loading) return;
    loading = true;
    status('Loading announcements…');
    try {
      if (!(await freshSession())) throw Error('Sign in again.');
      const [posts, profiles, reads] = await Promise.all([
        request('/rest/v1/announcements?select=*&order=created_at.desc&limit=150'),
        request('/rest/v1/profiles?select=id,handle&order=handle.asc&limit=1000'),
        request('/rest/v1/announcement_reads?select=announcement_id&limit=10000')
      ]);
      const counts = new Map();
      for (const r of reads) counts.set(r.announcement_id, (counts.get(r.announcement_id) || 0) + 1);
      const names = Object.fromEntries(profiles.map(p => [p.id, p.handle]));
      const select = $('announcement-recipients');
      const checked = new Set([...select.selectedOptions].map(o => o.value));
      select.replaceChildren(...profiles.map(p => {
        const opt = new Option(p.handle, p.id);
        opt.selected = checked.has(p.id);
        return opt;
      }));
      const list = $('announcement-admin-list');
      list.replaceChildren();
      if (!posts.length) list.append(el('p', 'No announcements yet.'));
      for (const post of posts) {
        const item = el('article');
        item.className = 'announcement-admin-item';
        item.append(el('h3', post.title), el('p', post.body));
        const description = post.audience === 'selected' ? 'To ' + (names[post.recipient_id] || 'deleted account')
          : post.audience === 'registered' ? 'Registered accounts' : 'Everyone';
        const active = !post.active ? 'Unpublished'
          : post.expires_at && Date.parse(post.expires_at) < Date.now() ? 'Expired' : 'Published';
        const details = el('p', description + ' · ' + active + ' · ' + (counts.get(post.id) || 0) + ' account reads');
        details.className = 'announcement-meta';
        const button = el('button', post.active ? 'Unpublish' : 'Restore');
        button.className = 'action';
        button.type = 'button';
        button.onclick = async () => {
          if (post.active && !confirm('Unpublish this announcement?')) return;
          button.disabled = true;
          try {
            if (!(await freshSession())) throw Error('Sign in again.');
            await request('/rest/v1/announcements?id=eq.' + encodeURIComponent(post.id), {
              method: 'PATCH', body: { active: !post.active }, prefer: 'return=minimal'
            });
            await reload();
          } catch (error) {
            status('Could not update: ' + error.message);
          } finally { button.disabled = false; }
        };
        item.append(details, button);
        list.append(item);
      }
      status('Announcements loaded.');
    } catch (error) {
      status('Could not load announcements: ' + error.message);
    } finally { loading = false; }
  }

  async function publish(event) {
    event.preventDefault();
    const button = $('announcement-send');
    if (button.disabled) return;
    const title = $('announcement-title').value.trim();
    const body = $('announcement-body').value.trim();
    const audience = $('announcement-audience').value;
    const priority = $('announcement-priority').value;
    const link_url = $('announcement-link').value.trim() || null;
    const days = $('announcement-expiry').value;
    const targets = audience === 'selected'
      ? [...$('announcement-recipients').selectedOptions].map(o => o.value) : [null];
    if (!targets.length) return status('Choose at least one recipient.');
    if (title.length < 3 || title.length > 100 || !body || body.length > 1000) return status('Check the title and message length.');
    if (link_url && !/^#[a-z0-9][a-z0-9-]{0,49}$/.test(link_url)) return status('Use a game link like #risk.');
    button.disabled = true;
    try {
      const session = await freshSession();
      if (!session?.user?.id) throw Error('Sign in again.');
      const published_at = new Date().toISOString();
      const expires_at = days === 'never' ? null : new Date(Date.now() + Number(days) * 86400000).toISOString();
      await request('/rest/v1/announcements', {
        method: 'POST', prefer: 'return=minimal',
        body: targets.map(recipient_id => ({
          title, body, audience, recipient_id, priority, link_url, published_at, expires_at,
          created_by: session.user.id
        }))
      });
      $('announcement-form').reset();
      showRecipients();
      await reload();
      status('Published to ' + (audience === 'selected' ? targets.length + ' account(s).' : audience === 'everyone' ? 'everyone.' : 'registered accounts.'));
    } catch (error) {
      status('Could not publish: ' + error.message);
    } finally { button.disabled = false; }
  }

  function init() {
    if (initialized) return;
    initialized = true;
    $('announcement-audience').onchange = showRecipients;
    $('announcement-form').onsubmit = publish;
    $('announcement-refresh').onclick = () => void reload();
    showRecipients();
    void reload();
  }
  return { init };
}
