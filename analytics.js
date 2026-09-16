/* Optional analytics: no third-party scripts until the visitor accepts. */
(() => {
  const publicPages = new Set(["/","/index.html","/jiu-jitsu-ardmore-ok.html","/jiu-jitsu-davis-ok.html","/jiu-jitsu-dickson-ok.html","/jiu-jitsu-healdton-ok.html","/jiu-jitsu-lone-grove-ok.html","/jiu-jitsu-madill-ok.html","/jiu-jitsu-marietta-ok.html","/jiu-jitsu-pauls-valley-ok.html","/jiu-jitsu-ringling-ok.html","/jiu-jitsu-sulphur-ok.html","/jiu-jitsu-thackerville-ok.html","/jiu-jitsu-wilson-ok.html","/jiu-jitsu-wynnewood-ok.html","/story.html"]);
  const privacyPage = location.pathname === '/privacy.html';
  if ((!publicPages.has(location.pathname) && !privacyPage) || window.redRoadConsentReady) return;
  window.redRoadConsentReady = true;
  const key = 'rr-analytics-consent-v1';
  const lifetime = 180 * 24 * 60 * 60 * 1000;
  const production = ['redroadbjj.com', 'www.redroadbjj.com'].includes(location.hostname);
  let started = false, choice = readChoice(), previousFocus;
  function readChoice() {
    try {
      const saved = JSON.parse(localStorage.getItem(key));
      return saved && saved.expires > Date.now() && ['accepted', 'declined'].includes(saved.choice) ? saved.choice : null;
    } catch { return null; }
  }
  function cleanCookies() {
    document.cookie.split(';').forEach(part => {
      const name = part.split('=')[0].trim();
      if (!/^(_ga($|_)|_gid$|_gat($|_)|_clck$|_clsk$)/.test(name)) return;
      ['', location.hostname, '.' + location.hostname, 'redroadbjj.com', '.redroadbjj.com'].forEach(domain => {
        document.cookie = name + '=; Max-Age=0; path=/; SameSite=Lax' + (domain ? '; domain=' + domain : '');
      });
    });
  }
  function start() {
    if (started || choice !== 'accepted' || !production || privacyPage) return;
    started = true;
    window['ga-disable-G-64ZS7MSHJ0'] = false;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    window.gtag('consent', 'default', {analytics_storage:'granted', ad_storage:'denied', ad_user_data:'denied', ad_personalization:'denied'});
    window.gtag('js', new Date());
    window.gtag('config', 'G-64ZS7MSHJ0', {page_location:location.origin + location.pathname, allow_google_signals:false, allow_ad_personalization_signals:false});
    const google = document.createElement('script');
    google.async = true;
    google.src = 'https://www.googletagmanager.com/gtag/js?id=G-64ZS7MSHJ0';
    document.head.appendChild(google);
    window.clarity = window.clarity || function () { (window.clarity.q = window.clarity.q || []).push(arguments); };
    window.clarity('consentv2', {analytics_Storage:'granted', ad_Storage:'denied'});
    const clarity = document.createElement('script');
    clarity.async = true;
    clarity.src = 'https://www.clarity.ms/tag/yjd9pzgdos';
    document.head.appendChild(clarity);
  }
  const notice = document.createElement('section');
  notice.id = 'rr-cookie-notice';
  notice.setAttribute('role', 'region');
  notice.setAttribute('aria-label', 'Cookie preferences');
  notice.innerHTML = '<p>May we use Google Analytics and Microsoft Clarity cookies to understand visits and interactions, including session recordings? You can use the site either way. <a href="privacy.html">Privacy Policy</a></p><div class="rr-cookie-actions"><button type="button" data-choice="accepted">Accept</button><button type="button" data-choice="declined">Decline</button></div>';
  document.body.appendChild(notice);
  notice.hidden = choice !== null;
  function choose(value, persist = true) {
    choice = value;
    if (persist) { try { localStorage.setItem(key, JSON.stringify({choice, expires:Date.now()+lifetime})); } catch {} }
    notice.hidden = true;
    if (previousFocus) previousFocus.focus();
    if (choice === 'accepted') { start(); return; }
    window['ga-disable-G-64ZS7MSHJ0'] = true;
    if (started) {
      window.gtag('consent','update',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
      window.clarity('consentv2',{analytics_Storage:'denied',ad_Storage:'denied'});
    }
    cleanCookies();
    // Unload running SDKs; the next document will not load them after withdrawal.
    if (started) location.reload();
  }
  notice.querySelectorAll('[data-choice]').forEach(button => button.addEventListener('click', () => choose(button.dataset.choice)));
  document.querySelectorAll('[data-cookie-settings]').forEach(button => {
    button.hidden = false;
    button.addEventListener('click', () => {
      previousFocus = button; notice.hidden = false;
      notice.querySelector('button').focus();
    });
  });
  window.addEventListener('storage', event => {
    if (event.key !== key && event.key !== null) return;
    const updated = readChoice();
    if (updated !== choice) {
      if (updated) choose(updated, false);
      else { choice = null; if (started) choose('declined', false); notice.hidden = false; }
    }
  });
  document.addEventListener('click', event => {
    if (!started || choice !== 'accepted') return;
    const link = event.target.closest?.('a[href]');
    if (!link) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin) return;
    const name = url.pathname === '/waiver.html' && url.searchParams.get('trial') === '1' ? 'trial_click' : url.pathname === '/enroll.html' ? 'enroll_click' : null;
    if (name) { window.gtag('event',name); window.clarity('event',name); }
  });
  if (choice === 'accepted') start(); else cleanCookies();
})();
