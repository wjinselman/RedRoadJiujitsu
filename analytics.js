/* Automatic cookieless analytics on public marketing pages only. */
(() => {
  const publicPages = new Set(["/","/index.html","/jiu-jitsu-ardmore-ok.html","/jiu-jitsu-davis-ok.html","/jiu-jitsu-dickson-ok.html","/jiu-jitsu-healdton-ok.html","/jiu-jitsu-lone-grove-ok.html","/jiu-jitsu-madill-ok.html","/jiu-jitsu-marietta-ok.html","/jiu-jitsu-pauls-valley-ok.html","/jiu-jitsu-ringling-ok.html","/jiu-jitsu-sulphur-ok.html","/jiu-jitsu-thackerville-ok.html","/jiu-jitsu-wilson-ok.html","/jiu-jitsu-wynnewood-ok.html","/story.html"]);
  const privacyPage = location.pathname === '/privacy.html';
  if ((!publicPages.has(location.pathname) && !privacyPage) || window.redRoadConsentReady) return;
  window.redRoadConsentReady = true;

  const production = ['redroadbjj.com', 'www.redroadbjj.com'].includes(location.hostname);
  let declined = false;
  try { declined = JSON.parse(localStorage.getItem('rr-analytics-consent-v1'))?.choice === 'declined'; } catch {}
  const excluded = declined || navigator.globalPrivacyControl === true || navigator.doNotTrack === '1' || navigator.webdriver === true || !production || privacyPage;
  document.querySelectorAll('[data-cookie-settings]').forEach(button => { button.hidden = true; });
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
    if (excluded) return;
    window['ga-disable-G-64ZS7MSHJ0'] = false;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    window.gtag('consent', 'default', {analytics_storage:'denied', ad_storage:'denied', ad_user_data:'denied', ad_personalization:'denied'});
    window.gtag('js', new Date());
    window.gtag('config', 'G-64ZS7MSHJ0', {page_location:location.origin + location.pathname, allow_google_signals:false, allow_ad_personalization_signals:false});
    const google = document.createElement('script');
    google.async = true;
    google.src = 'https://www.googletagmanager.com/gtag/js?id=G-64ZS7MSHJ0';
    document.head.appendChild(google);
    window.clarity = window.clarity || function () { (window.clarity.q = window.clarity.q || []).push(arguments); };
    window.clarity('consentv2', {analytics_Storage:'denied', ad_Storage:'denied'});
    const clarity = document.createElement('script');
    clarity.async = true;
    clarity.src = 'https://www.clarity.ms/tag/yjd9pzgdos';
    document.head.appendChild(clarity);
  }
  document.addEventListener('click', event => {
    if (excluded) return;
    const link = event.target.closest?.('a[href]');
    if (!link) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin) return;
    const name = url.pathname === '/waiver.html' && url.searchParams.get('trial') === '1' ? 'trial_click' : url.pathname === '/enroll.html' ? 'enroll_click' : null;
    if (name) { window.gtag('event',name); window.clarity('event',name); }
  });
  cleanCookies();
  start();
})();
