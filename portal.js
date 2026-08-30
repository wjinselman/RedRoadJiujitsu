/*
  Red Road Jiu Jitsu — local prototype portal
  -------------------------------------------------
  NO FIREBASE. NO FIRESTORE. NO CLOUD FUNCTIONS.
  NO POLLING. NO NETWORK REQUESTS.

  This file uses browser localStorage only so the member/owner demo can
  work smoothly with zero backend cost. Replace this layer deliberately
  if/when a real authenticated production backend is approved.
*/
(() => {
  'use strict';

  const STORAGE_KEY = 'redroad_demo_members_v1';
  const SESSION_KEY = 'redroad_demo_session_v1';

  const seedMembers = [
    { id: 'm-1001', name: 'Demo Member', email: 'member@redroad.demo', plan: 'Adult', rank: 'White Belt', status: 'Active', joined: '2026-08-30' },
    { id: 'm-1002', name: 'Jordan Lee', email: 'jordan@redroad.demo', plan: 'Family', rank: 'White Belt', status: 'Active', joined: '2026-08-18' },
    { id: 'm-1003', name: 'Casey Morgan', email: 'casey@redroad.demo', plan: 'Military / First Responder', rank: 'Blue Belt', status: 'Active', joined: '2026-08-10' }
  ];

  const readMembers = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(seedMembers));
        return [...seedMembers];
      }
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [...seedMembers];
    } catch (_) {
      return [...seedMembers];
    }
  };

  const writeMembers = members => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(members));
  };

  const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const moneyForPlan = plan => ({'Adult':135,'Kids':90,'Military / First Responder':100,'Family':300}[plan] || 0);
  const formatDate = value => {
    if (!value) return '—';
    const d = new Date(`${value}T12:00:00`);
    return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
  };

  const flash = (el, message, tone='ok') => {
    if (!el) return;
    el.textContent = message;
    el.dataset.tone = tone;
    el.hidden = false;
    window.setTimeout(() => { el.hidden = true; }, 2600);
  };

  const setupMemberPage = () => {
    const form = document.querySelector('#member-login-form');
    if (!form) return;

    const loginView = document.querySelector('#member-login-view');
    const dashboard = document.querySelector('#member-dashboard');
    const message = document.querySelector('#member-login-message');
    const emailInput = document.querySelector('#member-email');
    const logout = document.querySelector('#member-logout');

    const renderMember = member => {
      if (!member) return;
      document.querySelector('#member-name').textContent = member.name;
      document.querySelector('#member-plan').textContent = member.plan;
      document.querySelector('#member-rank').textContent = member.rank;
      document.querySelector('#member-status').textContent = member.status;
      document.querySelector('#member-joined').textContent = formatDate(member.joined);
      loginView.hidden = true;
      dashboard.hidden = false;
    };

    const restore = () => {
      try {
        const email = sessionStorage.getItem(SESSION_KEY);
        if (!email) return;
        const member = readMembers().find(m => m.email.toLowerCase() === email.toLowerCase());
        if (member) renderMember(member);
      } catch (_) {}
    };

    form.addEventListener('submit', event => {
      event.preventDefault();
      const email = emailInput.value.trim().toLowerCase();
      const member = readMembers().find(m => m.email.toLowerCase() === email);
      if (!member) {
        flash(message, 'Demo member not found. Try member@redroad.demo', 'error');
        return;
      }
      try { sessionStorage.setItem(SESSION_KEY, member.email); } catch (_) {}
      renderMember(member);
    });

    logout?.addEventListener('click', () => {
      try { sessionStorage.removeItem(SESSION_KEY); } catch (_) {}
      dashboard.hidden = true;
      loginView.hidden = false;
      emailInput.focus();
    });

    restore();
  };

  const setupOwnerPage = () => {
    const root = document.querySelector('#owner-dashboard');
    if (!root) return;

    const list = document.querySelector('#owner-member-list');
    const form = document.querySelector('#add-member-form');
    const panel = document.querySelector('#add-member-panel');
    const toggle = document.querySelector('#toggle-add-member');
    const message = document.querySelector('#owner-message');
    const reset = document.querySelector('#reset-demo-data');

    const render = () => {
      const members = readMembers();
      const active = members.filter(m => m.status === 'Active');
      const revenue = active.reduce((sum, m) => sum + moneyForPlan(m.plan), 0);
      const thisMonth = new Date().toISOString().slice(0,7);
      const newThisMonth = members.filter(m => (m.joined || '').slice(0,7) === thisMonth).length;

      document.querySelector('#stat-active').textContent = String(active.length);
      document.querySelector('#stat-revenue').textContent = `$${revenue.toLocaleString()}`;
      document.querySelector('#stat-paused').textContent = String(members.filter(m => m.status !== 'Active').length);
      document.querySelector('#stat-new').textContent = String(newThisMonth);

      list.innerHTML = members.map(member => `
        <article class="member-row" data-member-id="${esc(member.id)}">
          <div class="member-row-main">
            <strong>${esc(member.name)}</strong>
            <span>${esc(member.email)}</span>
          </div>
          <div class="member-row-meta"><span>${esc(member.plan)}</span><span>${esc(member.rank)}</span><span class="status-chip ${member.status === 'Active' ? 'active' : 'paused'}">${esc(member.status)}</span></div>
          <div class="member-row-actions">
            <button class="btn btn-mini btn-dark" data-action="toggle-status" type="button">${member.status === 'Active' ? 'Pause' : 'Activate'}</button>
            <button class="btn btn-mini btn-quiet" data-action="delete" type="button">Remove</button>
          </div>
        </article>`).join('');
    };

    toggle?.addEventListener('click', () => {
      panel.hidden = !panel.hidden;
      toggle.setAttribute('aria-expanded', String(!panel.hidden));
      if (!panel.hidden) panel.querySelector('input')?.focus();
    });

    form?.addEventListener('submit', event => {
      event.preventDefault();
      const fd = new FormData(form);
      const email = String(fd.get('email') || '').trim().toLowerCase();
      const members = readMembers();
      if (members.some(m => m.email.toLowerCase() === email)) {
        flash(message, 'That email is already in the demo member list.', 'error');
        return;
      }
      members.unshift({
        id: `m-${Date.now()}`,
        name: String(fd.get('name') || '').trim(),
        email,
        plan: String(fd.get('plan') || 'Adult'),
        rank: String(fd.get('rank') || 'White Belt'),
        status: 'Active',
        joined: new Date().toISOString().slice(0,10)
      });
      writeMembers(members);
      form.reset();
      panel.hidden = true;
      toggle?.setAttribute('aria-expanded','false');
      flash(message, 'Member added locally on this device.');
      render();
    });

    list?.addEventListener('click', event => {
      const button = event.target.closest('button[data-action]');
      if (!button) return;
      const row = button.closest('[data-member-id]');
      const id = row?.dataset.memberId;
      if (!id) return;
      let members = readMembers();
      const member = members.find(m => m.id === id);
      if (!member) return;

      if (button.dataset.action === 'toggle-status') {
        member.status = member.status === 'Active' ? 'Paused' : 'Active';
        writeMembers(members);
        render();
        flash(message, `${member.name} is now ${member.status.toLowerCase()}.`);
      }

      if (button.dataset.action === 'delete') {
        if (!window.confirm(`Remove ${member.name} from this local demo?`)) return;
        members = members.filter(m => m.id !== id);
        writeMembers(members);
        render();
        flash(message, 'Member removed from this local demo.');
      }
    });

    reset?.addEventListener('click', () => {
      if (!window.confirm('Reset the local demo member list?')) return;
      writeMembers([...seedMembers]);
      render();
      flash(message, 'Demo data reset.');
    });

    render();
  };

  setupMemberPage();
  setupOwnerPage();
})();
