# redroadbjj.com launch — prepared, not activated

This package includes the gallery and coach fixes. Search/social URLs and the sitemap now use https://redroadbjj.com/. The supplied CNAME already named this domain. Relative navigation and the existing Firebase project are preserved.

Do not upload this domain-ready package until you own the domain and are ready for the switch. The previous gallery-and-coach ZIP remains unchanged. Nothing has been deployed or changed in DNS, GitHub, or Firebase.

## Hosting assumption

These instructions use the existing GitHub Pages site shown in your screenshot: wjinselman.github.io/RedRoadJiujitsu/. If you intend to switch to Firebase Hosting instead, stop and use its custom-domain wizard rather than these GitHub DNS records. Do not mix providers' records.

## Launch checklist

1. Purchase redroadbjj.com. No additional website-hosting purchase is needed for this GitHub Pages setup.
2. Verify domain ownership in your GitHub account's Pages settings, using the exact TXT record GitHub supplies. Keep that verification record.
3. In Firebase project red-road-jiujitsu, Authentication > Settings > Authorized domains, add redroadbjj.com and www.redroadbjj.com. Keep existing authorized domains. Do not change firebase-config.js authDomain: it remains red-road-jiujitsu.firebaseapp.com. Existing accounts and records stay in the same project.
4. When ready to switch, upload the site files to the existing Pages publishing source. In repository Settings > Pages, set Custom domain to redroadbjj.com. The package's CNAME belongs at the publishing root.
5. At your DNS provider, configure the records below. Replace conflicting parking/web-host records for @ or www only; preserve email MX, email TXT, and domain verification records. Do not add a wildcard record or URL forwarding.

| Type | Name | Value |
| --- | --- | --- |
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |
| CNAME | www | wjinselman.github.io |

The www target has no https:// prefix and no /RedRoadJiujitsu path. This table uses IPv4; do not leave conflicting old AAAA records for the website names.

6. Wait for DNS and GitHub's certificate, then enable Enforce HTTPS. DNS and certificate readiness can each take up to 24 hours. With both names configured, GitHub redirects www to the chosen root domain.
7. Test root and www, all images, member and owner login, a password-reset email, waiver/enrollment, and a fresh attendance QR session. Users may need to sign in again because this is a new browser origin. Generate new attendance QR codes from the new domain; do not rely on old printed links during the cutover. Do not interrupt a member mid-enrollment.
8. Submit https://redroadbjj.com/sitemap.xml in Google Search Console after the domain works.

No Firestore rules changes, Cloud Functions, Blaze plan, or database migration are introduced. Live DNS, HTTPS, authentication, and QR checks still require the purchased/configured domain.

References:
- https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site
- https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/verifying-your-custom-domain-for-github-pages
- https://firebase.google.com/docs/auth/web/email-link-auth
