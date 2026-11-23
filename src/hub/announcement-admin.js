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
  const showKind = () => {
    const poll = $('announcement-kind').value === 'poll';
    $('announcement-options-row').hidden = !poll;
    $('announcement-options').required = poll;
  };
  const kindLabel = post => post.kind === 'poll' ? 'Poll' : post.kind === 'question' ? 'Question' : 'Message';

  function responseSummary(post, answers, names) {
    const box = el('div');
    box.className = 'announcement-admin-results';
    if (post.kind === 'poll') {
      const options = Array.isArray(post.options) ? post.options : [];
      const votes = new Map();
      for (const row of answers) if (row.choice) votes.set(row.choice, (votes.get(row.choice) || 0) + 1);
      const total = [...votes.values()].reduce((sum, count) => sum + count, 0);
      box.append(el('p', total + (total === 1 ? ' response' : ' responses')));
      for (const option of options) {
        const count = votes.get(option) || 0;
        box.append(el('p', option + ' — ' + count + (total ? ' (' + Math.round(count / total * 100) + '%)' : '')));
      }
      return box;
    }
    box.append(el('p', answers.length + (answers.length === 1 ? ' answer' : ' answers')));
    if (!answers.length) {
      box.append(el('p', 'No answers yet.'));
      return box;
    }
    const list = el('ul');
    for (const row of answers) {
      const item = el('li');
      item.append(el('strong', (names[row.user_id] || 'deleted account') + ': '), el('span', row.answer || ''));
      list.append(item);
    }
    box.append(list);
    return box;
  }

  async function reload() {
    if (loading) return;
    loading = true;
    status('Loading announcements…');
    try {
      if (!(await freshSession())) throw Error('Sign in again.');
      const [posts, profiles, reads, responses] = await Promise.all([
        request('/rest/v1/announcements?select=*&order=created_at.desc&limit=150'),
        request('/rest/v1/profiles?select=id,handle&order=handle.asc&limit=1000'),
        request('/rest/v1/announcement_reads?select=announcement_id&limit=10000'),
        request('/rest/v1/announcement_responses?select=announcement_id,user_id,choice,answer,updated_at&order=updated_at.desc&limit=10000')
      ]);
      const counts = new Map();
      for (const r of reads) counts.set(r.announcement_id, (counts.get(r.announcement_id) || 0) + 1);
      const answers = new Map();
      for (const r of responses) {
        if (!answers.has(r.announcement_id)) answers.set(r.announcement_id, []);
        answers.get(r.announcement_id).push(r);
      }
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
        if (post.kind === 'poll' || post.kind === 'question') {
          item.append(responseSummary(post, answers.get(post.id) || [], names));
        }
        const description = post.audience === 'selected' ? 'To ' + (names[post.recipient_id] || 'deleted account')
          : post.audience === 'registered' ? 'Registered accounts' : 'Everyone';
        const active = !post.active ? 'Unpublished'
          : post.expires_at && Date.parse(post.expires_at) < Date.now() ? 'Expired' : 'Published';
        const details = el('p', kindLabel(post) + ' · ' + description + ' · ' + active + ' · ' + (counts.get(post.id) || 0) + ' account reads');
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
    const kind = $('announcement-kind').value;
    const link_url = $('announcement-link').value.trim() || null;
    const days = $('announcement-expiry').value;
    const options = kind === 'poll'
      ? $('announcement-options').value.split('\n').map(line => line.trim()).filter(Boolean)
      : null;
    const targets = audience === 'selected'
      ? [...$('announcement-recipients').selectedOptions].map(o => o.value) : [null];
    if (!targets.length) return status('Choose at least one recipient.');
    if (title.length < 3 || title.length > 100 || !body || body.length > 1000) return status('Check the title and message length.');
    if (kind === 'poll') {
      if (options.length < 2 || options.length > 8) return status('Give the poll 2 to 8 answers, one per line.');
      if (options.some(option => option.length > 80)) return status('Keep each poll answer under 80 characters.');
      if (new Set(options).size !== options.length) return status('Each poll answer must be different.');
    }
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
          title, body, audience, recipient_id, priority, kind, options, link_url, published_at, expires_at,
          created_by: session.user.id
        }))
      });
      $('announcement-form').reset();
      showRecipients();
      showKind();
      await reload();
      status('Published ' + (kind === 'poll' ? 'poll' : kind === 'question' ? 'question' : 'announcement') +
        ' to ' + (audience === 'selected' ? targets.length + ' account(s).' : audience === 'everyone' ? 'everyone.' : 'registered accounts.'));
    } catch (error) {
      status('Could not publish: ' + error.message);
    } finally { button.disabled = false; }
  }

  function init() {
    if (initialized) return;
    initialized = true;
    $('announcement-audience').onchange = showRecipients;
    $('announcement-kind').onchange = showKind;
    $('announcement-form').onsubmit = publish;
    $('announcement-refresh').onclick = () => void reload();
    showRecipients();
    showKind();
    void reload();
  }
  return { init };
}
