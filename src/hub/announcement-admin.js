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
  const choices = () => [...$('announcement-options').querySelectorAll('input')];
  const pollOptions = () => choices().map(input => input.value.trim());
  const pollError = options => options.length < 2 || options.length > 8 ? 'Add 2 to 8 choices.'
    : options.some(option => !option) ? 'Fill in every choice or remove unused ones.'
    : options.some(option => option.length > 80) ? 'Keep each choice at 80 characters or fewer.'
    : new Set(options.map(option => option.toLowerCase())).size !== options.length ? 'Each choice must be different.' : '';
  const defaultBody = kind => kind === 'poll' ? 'Choose one answer.' : kind === 'question' ? 'Share your thoughts.' : '';
  const showRecipients = () => {
    $('announcement-recipients-row').hidden = $('announcement-audience').value !== 'selected';
    updatePreview();
  };
  function updatePreview() {
    const kind = $('announcement-kind').value;
    const title = $('announcement-title').value;
    const body = $('announcement-body').value;
    $('announcement-title-count').textContent = title.length + '/100';
    $('announcement-body-count').textContent = body.length + '/1000';
    $('announcement-preview-kind').textContent = 'FROM BORED / NEW ' + kind.toUpperCase();
    $('announcement-preview-title').textContent = title.trim() || (kind === 'message' ? 'Your announcement' : 'Your question');
    $('announcement-preview-body').textContent = body.trim() || defaultBody(kind) || 'Your message will appear here.';
    $('announcement-preview-card').classList.toggle('is-important', $('announcement-priority').value === 'important');
    const options = $('announcement-preview-options');
    options.replaceChildren();
    if (kind === 'poll') {
      for (const [i, option] of pollOptions().entries()) {
        const choice = el('div', option || 'Choice ' + (i + 1));
        choice.className = 'announcement-preview-choice';
        options.append(choice);
      }
    } else if (kind === 'question') {
      const answer = el('div', 'Type your answer...');
      answer.className = 'announcement-preview-answer';
      options.append(answer, el('small', 'Signed-in players can reply.'));
    }
    $('announcement-preview-link').textContent = $('announcement-link').value.trim() ? 'Play ' + $('announcement-link').value.trim() + ' →' : '';
    const audience = $('announcement-audience');
    const expiry = $('announcement-expiry');
    $('announcement-delivery-summary').textContent = audience.selectedOptions[0].textContent + ' · ' + expiry.selectedOptions[0].textContent;
    $('announcement-options-error').textContent = kind === 'poll' && pollOptions().every(Boolean) ? pollError(pollOptions()) : '';
  }
  function renderChoices(values = ['', '']) {
    const list = $('announcement-options');
    list.replaceChildren();
    for (const [index, value] of values.entries()) {
      const row = el('div');
      row.className = 'announcement-choice-row';
      const input = el('input');
      input.type = 'text';
      input.maxLength = 80;
      input.placeholder = 'Choice ' + (index + 1);
      input.setAttribute('aria-label', input.placeholder);
      input.value = value;
      const remove = el('button', '×');
      remove.type = 'button';
      remove.setAttribute('aria-label', 'Remove choice ' + (index + 1));
      remove.disabled = values.length <= 2;
      remove.onclick = () => renderChoices(pollOptions().filter((_, i) => i !== index));
      input.addEventListener('paste', event => {
        const lines = (event.clipboardData?.getData('text') || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
        if (lines.length < 2) return;
        event.preventDefault();
        const current = choices().map(input => input.value);
        const next = [...current.slice(0, index), ...lines, ...current.slice(index + 1).filter(Boolean)];
        if (next.length > 8 || lines.some(line => line.length > 80)) {
          $('announcement-options-error').textContent = 'Paste at most 8 total choices, each 80 characters or fewer.';
          return;
        }
        renderChoices(next);
        choices()[Math.min(index + lines.length - 1, next.length - 1)].focus();
      });
      row.append(el('span', String(index + 1)), input, remove);
      list.append(row);
    }
    $('announcement-add-option').disabled = values.length >= 8;
    updatePreview();
  }
  const showKind = () => {
    const kind = $('announcement-kind').value;
    const poll = kind === 'poll';
    $('announcement-options-row').hidden = !poll;
    $('announcement-title-label').textContent = kind === 'message' ? 'Title' : 'Question';
    $('announcement-title').placeholder = kind === 'message' ? 'New game: Risk!' : 'What should Bored do next?';
    $('announcement-body-label').textContent = kind === 'message' ? 'Message' : 'Extra context (optional)';
    $('announcement-body').placeholder = kind === 'message' ? "Tell players what's new." : 'Explain the question if needed.';
    $('announcement-body').required = kind === 'message';
    $('announcement-kind-help').textContent = poll ? 'Anyone in the audience can vote once, including guests on public polls.' : kind === 'question' ? 'Players need an account to submit a written answer.' : 'Send a message without asking for a response.';
    $('announcement-send').textContent = 'Publish ' + (poll ? 'poll' : kind === 'question' ? 'question' : 'announcement');
    updatePreview();
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
        const row = el('div');
        row.className = 'announcement-result-row';
        const percent = total ? Math.round(count / total * 100) : 0;
        const label = el('p', option + ' - ' + count + ' (' + percent + '%)');
        const track = el('div');
        track.className = 'announcement-result-track';
        const bar = el('div');
        bar.style.width = percent + '%';
        track.append(bar);
        row.append(label, track);
        box.append(row);
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
    const body = $('announcement-body').value.trim() || defaultBody($('announcement-kind').value);
    const audience = $('announcement-audience').value;
    const priority = $('announcement-priority').value;
    const kind = $('announcement-kind').value;
    const link_url = $('announcement-link').value.trim() || null;
    const days = $('announcement-expiry').value;
    const options = kind === 'poll' ? pollOptions() : null;
    const targets = audience === 'selected'
      ? [...$('announcement-recipients').selectedOptions].map(o => o.value) : [null];
    if (!targets.length) return status('Choose at least one recipient.');
    if (title.length < 3 || title.length > 100 || !body || body.length > 1000) return status('Check the title and message length.');
    if (kind === 'poll' && pollError(options)) return status(pollError(options));
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
      renderChoices();
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
    $('announcement-form').addEventListener('input', updatePreview);
    $('announcement-form').addEventListener('change', updatePreview);
    $('announcement-add-option').onclick = () => {
      const values = choices().map(input => input.value);
      if (values.length < 8) { renderChoices([...values, '']); choices().at(-1).focus(); }
    };
    renderChoices();
    $('announcement-kind').onchange = showKind;
    $('announcement-form').onsubmit = publish;
    $('announcement-refresh').onclick = () => void reload();
    showRecipients();
    showKind();
    void reload();
  }
  return { init };
}
