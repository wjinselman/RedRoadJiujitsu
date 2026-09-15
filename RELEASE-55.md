# Release 55 — clear enrollment access

The homepage hero and mobile bottom bar each have two actions: Try a Free Class in the dark style, and Sign Up in red. Schedule and Member Login remain available in navigation.

Sign Up opens the existing enrollment flow: account details, signed waiver, then staff activation. It does not mark someone paid or active automatically. Try a Free Class keeps the existing trial-waiver flow without creating a membership account.

This full package includes R54 waiver/enrollment scrolling corrections, R53 Monday–Friday schedule and R52 deletion fix. Upload the full contents to the existing GitHub Pages source and replace matching files. Shared navigation URLs use version 55 to avoid loading the old bottom bar from cache.

No additional Firebase rule changes beyond R49 are needed. No deployment was performed here. Check both calls to action and scroll to the end of each form on a phone after publishing.
