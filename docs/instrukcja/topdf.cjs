const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto('file://' + process.argv[2], { waitUntil: 'load' });
  await p.pdf({ path: process.argv[3], format: 'A4', printBackground: true, preferCSSPageSize: true,
    displayHeaderFooter: true, headerTemplate: '<span></span>',
    footerTemplate: '<div style="font-size:8pt;color:#888;width:100%;text-align:center">DREWizja — instrukcja obsługi · strona <span class="pageNumber"></span>/<span class="totalPages"></span></div>' });
  await b.close();
})();
