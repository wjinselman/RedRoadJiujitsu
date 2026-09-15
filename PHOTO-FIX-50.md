# Photo fix 50

Upload the contents of `RedRoad-Photo-Fix-R50.zip` into the existing site root, keeping the `assets` folder structure. Replace `index.html` and `premium.css` and include the two supplied PNGs. This patch is for the Mobile Premium R49 release.

The adult gallery photo, kids gallery photo and kids-program background now use their original PNG assets with fresh URLs. The homepage also requests a fresh stylesheet URL. Both original PNGs decoded successfully locally and returned HTTP 200 from the live site when checked. Both WebP files were also available during inspection, so the earlier browser failure's exact cause could not be reproduced.

After GitHub Pages finishes publishing, reload the page using Ctrl+Shift+R. Check the Built on the Mats gallery and the kids-program card. No Firebase rules deployment is needed for this photo-only patch.

This patch has not been pushed live. A browser/device visual check remains necessary. The rest of the R49 site and waiver features are retained.
