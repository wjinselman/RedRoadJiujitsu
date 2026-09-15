# R60 — initial dashboard data loading

The staff dashboard previously became visible before its first roster query completed. If that query failed while restoring sign-in, the error was silently ignored and the default zero counts remained until Refresh.

This patch displays Loading your dashboard and pending dashes until the underlying lists load. A transient unavailable/deadline/network error on the initial roster query is retried once, immediately. Permission failures are not retried automatically. Persistent errors remain visible beside the dashboard header; other sections can still load. Concurrent initial authorization attempts share one load. Refresh clears the initial error after a successful reload.

This fixes the silent-error/false-zero behavior found in code; the underlying Firebase error on the user's phone has not been observed directly. If loading still fails, report the now-visible error rather than treating missing data as an empty roster.

Apply over R57/R58/R59: upload all included HTML and JavaScript files, replacing matching files. The package also includes the previously requested My Account button helper; no CSS/layout/scroll changes are included. No new rules deployment is required if R49 rules are already published. No live data, permissions or accounts were modified.

The initial load has at most one retry, not polling or a live database listener. Isolated tests cover delayed success, shared loads, one-time recovery, persistent failure and denied access. Verify the first dashboard load on the deployed site after publication.
