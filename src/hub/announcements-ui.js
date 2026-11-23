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
  // announcement id -> { choice } or { answer }. One row per account, so this
  // is also how the card knows whether the poll was already answered.
  const myResponses = new Map();
  // announcement id -> Map(option -> votes), for polls this player answered.
  const pollTallies = new Map();
  let identity = hasIdentity() ? getSession()?.user?.id : null;
  const current = () => hasIdentity() ? getSession()?.user?.id : null;
  const read = item => (identity ? accountReads : guestReads).has(item.id);
  const pollOptions = item => Array.isArray(item.options)
    ? item.options.filter(option => typeof option === 'string' && option) : [];
  const answerKind = item => item.kind === 'poll' || item.kind === 'question' ? item.kind : 'message';

  function pollList(item, mine) {
    const list = make('div', undefined, 'announcement-poll');
    list.setAttribute('role', 'group');
    list.setAttribute('aria-label', 'Poll answers');
    for (const option of pollOptions(item)) {
      const button = make('button', option, 'announcement-option');
      button.type = 'button';
      button.setAttribute('aria-pressed', String(mine?.choice === option));
      list.append(button);
    }
    return list;
  }
  function pollTally(item, mine) {
    const counts = pollTallies.get(item.id) || new Map();
    const total = pollOptions(item).reduce((sum, option) => sum + (counts.get(option) || 0), 0);
    const box = make('div', undefined, 'announcement-tally');
    box.setAttribute('aria-label', 'Poll results');
    for (const option of pollOptions(item)) {
      const votes = counts.get(option) || 0;
      const row = make('p', undefined, 'announcement-result' + (mine?.choice === option ? ' announcement-chosen' : ''));
      row.append(make('span', option, 'announcement-result-label'));
      row.append(make('span', votes + (votes === 1 ? ' vote' : ' votes') +
        (total ? ' · ' + Math.round(votes / total * 100) + '%' : ''), 'announcement-result-value'));
      box.append(row);
    }
    return box;
  }

  // Poll choices and written answers live inside the dialog; the banner stays a
  // quiet notice with a "Read more" button so it never crowds a game.
  function responseForm(item) {
    if (answerKind(item) === 'message') return null;
    const form = make('form', undefined, 'announcement-response');
    form.setAttribute('aria-label', 'Answer: ' + item.title);
    const status = make('p', undefined, 'announcement-response-status');
    status.setAttribute('role', 'status');
    const mine = myResponses.get(item.id);

    if (!identity) {
      if (answerKind(item) === 'poll') {
        const list = pollList(item, null);
        for (const button of list.querySelectorAll('button')) button.disabled = true;
        form.append(list);
      }
      form.append(make('p', answerKind(item) === 'poll'
        ? 'Sign in to vote in this poll.'
        : 'Sign in to answer this question.', 'announcement-response-hint'));
      return form;
    }

    if (answerKind(item) === 'poll') {
      const list = pollList(item, mine);
      const buttons = [...list.querySelectorAll('button')];
      for (const button of buttons) {
        button.onclick = async () => {
          if (button.disabled) return;
          for (const other of buttons) other.disabled = true;
          if (!(await respond(item, { choice: button.textContent }, status))) {
            for (const other of buttons) other.disabled = false;
          }
        };
      }
      form.append(list);
      if (mine) form.append(pollTally(item, mine));
      form.append(status);
      return form;
    }

    const label = make('label', 'Your answer', 'announcement-response-label');
    const box = make('textarea');
    box.rows = 3;
    box.maxLength = 1000;
    box.placeholder = 'Type your answer…';
    box.value = mine?.answer || '';
    label.append(box);
    const send = make('button', mine ? 'Update answer' : 'Send answer', 'announcement-submit');
    send.type = 'submit';
    form.append(label, send, status);
    form.onsubmit = event => {
      event.preventDefault();
      const text = box.value.trim();
      if (!text) {
        status.textContent = 'Write an answer first.';
        return;
      }
      send.disabled = true;
      void respond(item, { answer: text }, status).then(ok => { if (!ok) send.disabled = false; });
    };
    return form;
  }

  function card(item, banner = false) {
    const kind = answerKind(item);
    const article = make('article', undefined, 'announcement-card' + (item.priority === 'important' ? ' announcement-important' : ''));
    if (banner) article.append(make('p', 'FROM BORED / NEW ' +
      (kind === 'poll' ? 'POLL' : kind === 'question' ? 'QUESTION' : 'MESSAGE'), 'announcement-eyebrow'));
    article.append(make('h3', item.title), make('p', item.body));
    if (!banner) {
      const form = responseForm(item);
      if (form) article.append(form);
    }
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

  // The tally is aggregate only: the function behind it never exposes who
  // chose what, and open-ended answers stay between the player and the admins.
  async function loadTally(id) {
    const who = current();
    if (!who) return;
    try {
      const rows = await request('/rest/v1/rpc/announcement_results', {
        method: 'POST', body: { p_announcement: id }
      });
      if (current() !== who || !Array.isArray(rows)) return;
      pollTallies.set(id, new Map(rows.map(row => [row.choice, Number(row.votes) || 0])));
      render();
    } catch {}
  }

  async function respond(item, payload, status) {
    const who = current();
    if (!who) {
      status.textContent = 'Sign in to answer.';
      return false;
    }
    status.textContent = 'Sending…';
    try {
      if (!(await freshSession()) || current() !== who) throw Error('Session changed.');
      const result = await request('/rest/v1/rpc/respond_to_announcement', {
        method: 'POST',
        body: {
          p_announcement: item.id,
          p_choice: payload.choice || null,
          p_answer: payload.answer || null
        }
      });
      if (current() !== who) return false;
      myResponses.set(item.id, {
        choice: result?.choice || payload.choice || null,
        answer: result?.answer || payload.answer || null
      });
      if (payload.choice) await loadTally(item.id);
      await acknowledge(item);
      render();
      $('announcement-status').textContent = payload.choice ? 'Vote recorded.' : 'Answer sent.';
      return true;
    } catch (error) {
      if (current() !== who) return false;
      status.textContent = error?.message || 'Could not send that answer.';
      return false;
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
      const [messages, receipts, answers] = await Promise.all([
        request('/rest/v1/announcements?select=id,title,body,kind,options,audience,recipient_id,priority,link_url,active,created_at,published_at,expires_at&order=created_at.desc&limit=100',
          { token: who ? undefined : ANON_TOKEN }),
        who ? request('/rest/v1/announcement_reads?select=announcement_id&user_id=eq.' + encodeURIComponent(who) + '&limit=1000') : Promise.resolve([]),
        who ? request('/rest/v1/announcement_responses?select=announcement_id,choice,answer&user_id=eq.' + encodeURIComponent(who) + '&limit=200') : Promise.resolve([])
      ]);
      if (seq !== generation || current() !== who) return;
      entries = messages || [];
      accountReads = new Set(receipts.map(r => r.announcement_id));
      myResponses.clear();
      for (const row of answers || []) {
        if (row?.announcement_id) myResponses.set(row.announcement_id, { choice: row.choice, answer: row.answer });
      }
      $('announcement-status').textContent = '';
      render();
      // Answered polls show their tally, loaded lazily so the first paint is
      // never held up by a request per poll.
      for (const item of entries) {
        if (item.kind === 'poll' && myResponses.get(item.id)?.choice) void loadTally(item.id);
      }
    } catch {
      if (seq !== generation || current() !== who) return;
      entries = [];
      accountReads.clear();
      myResponses.clear();
      pollTallies.clear();
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
      myResponses.clear();
      pollTallies.clear();
      render();
      void refresh({ force: true });
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
    setInterval(() => { if (!document.hidden) void refresh(); }, 120000);
    void refresh({ force: true });
  }
  return { initAnnouncements };
}
