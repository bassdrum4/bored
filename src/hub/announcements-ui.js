import { request, freshSession, getSession, hasIdentity, ANON_TOKEN } from './backend.js';
import { readStored, writeStored } from './store.js';

export function createAnnouncementsUI({ track = () => {} } = {}) {
  const $ = id => document.getElementById(id);
  const make = (tag, text, cls) => {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  };
  const guestKey = 'bored.announcements.guestReads';
  const stored = readStored(guestKey, []);
  const guestReads = new Set(Array.isArray(stored) ? stored : []);
  let entries = [], accountReads = new Set(), generation = 0, refreshedAt = 0;
  const seenBannerImpressions = new Set();
  let identity = hasIdentity() ? getSession()?.user?.id : null;
  const current = () => hasIdentity() ? getSession()?.user?.id : null;
  const read = item => (identity ? accountReads : guestReads).has(item.id);

  function card(item, banner = false) {
    const article = make('article', undefined, 'announcement-card' + (item.priority === 'important' ? ' announcement-important' : ''));
    if (banner) article.append(make('p', 'FROM BORED / NEW MESSAGE', 'announcement-eyebrow'));
    article.append(make('h3', item.title), make('p', item.body));
    const actions = make('div', undefined, 'announcement-actions');
    if (item.link_url && /^#[a-z0-9][a-z0-9-]{0,49}$/.test(item.link_url)) {
      const link = make('a', 'Play →');
      link.href = item.link_url;
      link.onclick = () => {
        track('announcement_click', { surface: 'announcement', action: 'click', announcement_id: item.id });
        if ($('announcement-dialog').open) $('announcement-dialog').close();
      };
      actions.append(link);
    }
    if (banner) {
      const details = make('button', 'Read more');
      details.type = 'button';
      details.onclick = () => $('announcement-dialog').showModal();
      actions.append(details);
    }
    if (!read(item)) {
      const dismiss = make('button', banner ? '×' : 'Mark read',
        banner ? 'announcement-dismiss' : '');
      dismiss.type = 'button';
      if (banner) {
        dismiss.setAttribute('aria-label', 'Dismiss announcement: ' + item.title);
        dismiss.title = 'Dismiss announcement';
      }
      dismiss.onclick = () => void acknowledge(item);
      if (banner) article.append(dismiss);
      else actions.append(dismiss);
    }
    if (actions.childNodes.length) article.append(actions);
    return article;
  }
  function render() {
    const now = Date.now();
    const visible = entries.filter(e => e.active && Date.parse(e.published_at) <= now &&
      (!e.expires_at || Date.parse(e.expires_at) > now) &&
      (e.audience === 'everyone' || (identity && (e.audience === 'registered' || e.recipient_id === identity))));
    const unread = visible.filter(e => !read(e));
    const count = $('announcement-count');
    count.hidden = !unread.length;
    count.textContent = unread.length > 9 ? '9+' : String(unread.length);
    $('announcement-toggle').setAttribute('aria-label', unread.length ? unread.length + ' unread announcements' : 'Announcements');
    const banner = $('announcement-banner');
    banner.replaceChildren(...unread.slice(0, 1).map(e => card(e, true)));
    banner.hidden = !unread.length;
    if (!document.hidden && unread.length && !seenBannerImpressions.has(unread[0].id)) {
      seenBannerImpressions.add(unread[0].id);
      track('announcement_impression', { surface: 'announcement', announcement_id: unread[0].id });
    }
    const list = $('announcement-list');
    list.replaceChildren(...visible.map(e => card(e)));
    if (!visible.length) list.append(make('p', 'No announcements right now.'));
  }
  async function acknowledge(item) {
    if (read(item)) return;
    const who = current();
    if (!who) {
      guestReads.add(item.id);
      writeStored(guestKey, [...guestReads].slice(-200));
      render();
      return;
    }
    accountReads.add(item.id);
    render();
    try {
      if (!(await freshSession()) || current() !== who) throw Error('Session changed.');
      await request('/rest/v1/announcement_reads?on_conflict=announcement_id,user_id', {
        method: 'POST', body: { announcement_id: item.id, user_id: who },
        prefer: 'resolution=ignore-duplicates,return=minimal'
      });
    } catch {
      if (current() === who) {
        accountReads.delete(item.id);
        $('announcement-status').textContent = 'Could not mark this announcement as read.';
        render();
      }
    }
  }
  // Coming back to the tab is not a reason to re-read the list: coalesce focus
  // refreshes so tabbing in and out cannot spend a request each time.
  async function refresh({ force = false } = {}) {
    if (!force && Date.now() - refreshedAt < 60000) return;
    refreshedAt = Date.now();
    const seq = ++generation, who = current();
    try {
      if (who && !(await freshSession())) throw Error('Session expired');
      const [messages, receipts] = await Promise.all([
        request('/rest/v1/announcements?select=id,title,body,audience,recipient_id,priority,link_url,active,created_at,published_at,expires_at&order=created_at.desc&limit=100',
          { token: who ? undefined : ANON_TOKEN }),
        who ? request('/rest/v1/announcement_reads?select=announcement_id&user_id=eq.' + encodeURIComponent(who) + '&limit=1000') : Promise.resolve([])
      ]);
      if (seq !== generation || current() !== who) return;
      entries = messages || [];
      accountReads = new Set(receipts.map(r => r.announcement_id));
      $('announcement-status').textContent = '';
      render();
    } catch {
      if (seq !== generation || current() !== who) return;
      entries = [];
      accountReads.clear();
      $('announcement-status').textContent = 'Announcements are unavailable right now.';
      render();
    }
  }
  function initAnnouncements() {
    $('announcement-toggle').onclick = () => {
      render();
      $('announcement-dialog').showModal();
    };
    $('announcement-close').onclick = () => $('announcement-dialog').close();
    window.addEventListener('bored:identity', () => {
      const next = current();
      if (identity === next) return;
      identity = next;
      entries = [];
      accountReads.clear();
      render();
      void refresh({ force: true });
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
    setInterval(() => { if (!document.hidden) void refresh(); }, 120000);
    void refresh({ force: true });
  }
  return { initAnnouncements };
}
