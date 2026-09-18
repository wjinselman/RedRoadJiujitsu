# Third-party assets

These modules are self-hosted, loaded only when a signed PDF is requested, and do not send waiver contents to their upstream projects.

- `pdf-lib.esm.min.js`: pdf-lib 1.17.1, Andrew Dillon, MIT. Original notice: `PDF-LIB-LICENSE.md`. Source: https://github.com/Hopding/pdf-lib
- `fontkit.es.min.js`: @pdf-lib/fontkit 1.1.1, Andrew Dillon with contributor Devon Govett, MIT. Source and package attribution: https://github.com/Hopding/fontkit and its package.json/README. Browser-bundled with esbuild; includes pako 1.0.11. Preserved bundled license comments are included at the end of the module.
- pako: Copyright (C) 2014–2017 by Vitaly Puzrin and Andrei Tuputcyn, MIT for pako and Zlib for its zlib port. See `PAKO-LICENSE.txt` and preserved source notices.
- `../assets/fonts/DejaVuSans.ttf`: DejaVu Sans; see `../assets/fonts/DEJAVU-LICENSE.txt`.
- `../assets/fonts/barlow-condensed-latin-800-normal.woff2`: Barlow Condensed via @fontsource/barlow-condensed 5.3.0; see `../assets/fonts/BARLOW-LICENSE.txt`.

## MIT terms for fontkit

Copyright: Andrew Dillon, Devon Govett and the upstream fontkit contributors.

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
