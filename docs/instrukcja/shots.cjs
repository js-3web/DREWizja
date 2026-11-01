// Zrzuty ekranu do instrukcji obsługi DREWizji.
const { chromium, devices } = require('playwright');
const fs = require('fs');
const SP = process.argv[2];
const OUT = process.argv[3];
let sample = fs.readFileSync(SP + '/sample.txt', 'utf8');
// Jedna nieczytelna szerokość — żeby pokazać, jak uzupełnia się braki.
sample = sample.replace('{ "type": "base", "width_cm": 45, "fronts": { "kind": "drawers", "count": 3 }, "confidence": 0.8 }', '{ "type": "base", "width_cm": null, "fronts": { "kind": "drawers", "count": 3 }, "confidence": 0.4 }');
// Bez rozbieżności 0,5 cm (narożna 86,5) — instrukcja ma pokazać czysty przypadek.
sample = sample.replace('"width_cm": "87"', '"width_cm": 86.5').replace('{ "type": "wall", "width_cm": 87,', '{ "type": "wall", "width_cm": 86.5,');

const MARK = `
.__mark { outline: 4px solid #e11d48 !important; outline-offset: 3px !important; border-radius: 8px; position: relative; z-index: 50; }
.__badge { position: fixed; z-index: 9999; background: #e11d48; color: #fff; font: 700 18px system-ui; width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; box-shadow: 0 2px 6px rgba(0,0,0,.35); pointer-events: none; }`;

async function mark(page, items) {
  // items: [[locator, number], ...] — czerwona ramka + numerek przy elemencie
  for (const [loc, n] of items) {
    const h = await loc.elementHandle();
    await h.evaluate((el, n) => {
      el.classList.add('__mark');
      const r = el.getBoundingClientRect();
      const b = document.createElement('div');
      b.className = '__badge';
      b.textContent = n;
      b.style.left = Math.max(2, r.left - 16) + 'px';
      b.style.top = Math.max(2, r.top - 16) + 'px';
      document.body.appendChild(b);
    }, n);
  }
}
async function unmark(page) {
  await page.evaluate(() => {
    document.querySelectorAll('.__mark').forEach((e) => e.classList.remove('__mark'));
    document.querySelectorAll('.__badge').forEach((e) => e.remove());
  });
}
async function shot(page, name, items = [], clip) {
  await mark(page, items);
  await page.waitForTimeout(150);
  // Okienka (kreator, ustawienia): przycinamy zrzut do samego okienka — czytelniejszy tekst.
  if (!clip && (await page.locator('.modal').count())) {
    const bb = await page.locator('.modal').boundingBox();
    clip = { x: Math.max(0, bb.x - 24), y: Math.max(0, bb.y - 24), width: Math.min(1280, bb.width + 48), height: Math.min(800, bb.height + 48) };
  }
  await page.screenshot({ path: `${OUT}/${name}.png`, clip });
  await unmark(page);
}

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
  const p = await ctx.newPage();
  await p.addInitScript((css) => {
    document.addEventListener('DOMContentLoaded', () => {
      const s = document.createElement('style');
      s.textContent = css;
      document.head.appendChild(s);
    });
  }, MARK);
  await p.goto('http://localhost:4173/');
  await p.waitForSelector('canvas');
  await p.waitForTimeout(2500);
  const btn = (name) => p.getByRole('button', { name, exact: true });

  // 1. Ekran główny
  await shot(p, '01-ekran-glowny', [
    [btn('📷 Ze szkicu'), 1],
    [p.locator('select[aria-label="Projekt"]'), 2],
    [btn('📄 PDF'), 3],
    [btn('⚙'), 4],
    [p.locator('a[title="Instrukcja obsługi (PDF)"]'), 7],
    [p.locator('.tabs'), 5],
    [p.locator('.status'), 6],
  ]);

  // 2. Ustawienia
  await btn('⚙').click();
  await p.locator('.modal label.field', { hasText: 'Nazwa warsztatu' }).locator('input').fill('Stolarnia Przykład');
  await p.locator('.modal label.field', { hasText: 'Kontakt' }).locator('input').fill('tel. 600 000 000');
  await shot(p, '02-ustawienia', [
    [p.locator('.modal label.field', { hasText: 'Nazwa warsztatu' }), 1],
    [p.locator('.modal textarea').first(), 2],
    [btn('Zapisz'), 3],
  ]);
  await btn('Zapisz').click();

  // 3. Kreator — krok 1
  await btn('📷 Ze szkicu').click();
  const f = (label) => p.locator('.modal label.field', { hasText: label }).locator('input,textarea').first();
  await f('Nazwa projektu').fill('Kuchnia Kowalscy');
  await f('Klient').fill('Anna Kowalska');
  await f('Szerokość (ściana A)').fill('386,5');
  await f('Głębokość (ściana B)').fill('300');
  await f('Uwagi dla AI').fill('zabudowa w L na ścianach A i B, lodówka w zabudowie');
  await shot(p, '03-kreator-dane', [
    [p.locator('.modal label.field', { hasText: 'Szerokość (ściana A)' }), 1],
    [p.locator('.modal label.field', { hasText: 'Głębokość (ściana B)' }), 2],
    [p.locator('.modal label.field', { hasText: 'Wysokość' }), 3],
    [btn('Dalej →'), 4],
  ]);
  await btn('Dalej →').click();

  // 4. Krok 2 — prompt
  await shot(p, '04-kreator-prompt', [[btn('Kopiuj prompt'), 1], [btn('Mam odpowiedź →'), 2]]);
  await btn('Kopiuj prompt').click();
  await btn('Mam odpowiedź →').click();

  // 5. Krok 3 — wklejenie odpowiedzi
  await p.locator('.modal textarea.prompt').fill(sample);
  await p.locator('.modal textarea.prompt').evaluate((e) => (e.scrollTop = 0));
  await shot(p, '05-kreator-odpowiedz', [[btn('Wklej ze schowka'), 1], [p.locator('.modal textarea.prompt'), 2], [btn('Sprawdź odczyt →'), 3]]);
  await btn('Sprawdź odczyt →').click();
  await p.waitForTimeout(300);

  // 6. Krok 4 — weryfikacja
  await shot(p, '06-weryfikacja-gora', [[p.locator('.box.err'), 1], [p.locator('.box.warn').first(), 2]]);
  const bad = p.locator('input[aria-invalid="true"]').first();
  await bad.scrollIntoViewIfNeeded();
  await p.locator('.modal-body').evaluate((e) => (e.scrollTop += 120));
  await p.locator('.toast').evaluateAll((els) => els.forEach((e) => e.remove()));
  await shot(p, '07-weryfikacja-tabela', [[bad, 1]]);
  await bad.fill('45');
  await bad.blur();
  await p.waitForTimeout(200);
  await p.locator('.modal-body').evaluate((e) => (e.scrollTop = e.scrollHeight));
  await p.locator('.modal textarea').last().fill('kreskowanie nad zmywarką to półka otwarta');
  await shot(p, '08-weryfikacja-dol', [[p.locator('.modal textarea').last(), 1], [btn('Kopiuj prompt korekty'), 2], [btn('Utwórz projekt 3D ✓'), 3]]);
  await p.locator('.modal textarea').last().fill('');
  await btn('Utwórz projekt 3D ✓').click();
  await p.waitForTimeout(2000);
  await p.locator('.toast').click().catch(() => {});

  // 9. Projekt 3D + zaznaczona szafka
  await p.locator('select[aria-label="Widok kamery"]').selectOption('front-A');
  await p.waitForTimeout(1200);
  const canvas = await p.locator('canvas').boundingBox();
  let hit = false;
  for (let fy = 0.55; fy <= 0.9 && !hit; fy += 0.05)
    for (let fx = 0.3; fx <= 0.7 && !hit; fx += 0.1) {
      await p.mouse.click(canvas.x + canvas.width * fx, canvas.y + canvas.height * fy);
      await p.waitForTimeout(250);
      hit = (await p.locator('.side .grid4').count()) > 0 && (await p.locator('.side p b').first().innerText()).includes('-d');
    }
  console.log('selected:', hit, await p.locator('.side p').first().innerText().catch(() => ''));
  await shot(p, '09-szafka-zaznaczona', [[p.locator('.side .grid4').first(), 1], [p.locator('.side .row.wrap').first(), 2]]);

  // 10. Materiały
  await p.locator('.matpanel select').first().selectOption('all');
  await p.locator('.matpanel .chips button', { hasText: 'Drewno lite' }).click();
  await p.locator('.swatch', { hasText: 'Dąb naturalny' }).click();
  await p.locator('.matpanel .chips button', { hasText: 'ramiakowy' }).click();
  await p.locator('.swatch', { hasText: 'Blat konglomerat' }).click();
  await p.waitForTimeout(1500);
  await p.locator('.matpanel select').first().scrollIntoViewIfNeeded();
  await shot(p, '10-materialy', [
    [p.locator('.matpanel label.field').first(), 1],
    [p.locator('.matpanel .chips').nth(0), 2],
    [p.locator('.matpanel .chips').nth(1), 3],
    [p.locator('.matpanel .swatches').first(), 4],
  ]);

  // 11. Kontrola
  await p.locator('.tabs button', { hasText: 'Kontrola' }).click();
  await shot(p, '11-kontrola', [[p.locator('.issues'), 1]]);

  // 12. Projekt (pytania)
  await p.locator('.tabs button', { hasText: 'Projekt' }).click();
  await shot(p, '12-zakladka-projekt', [[p.locator('.side .grid4').first(), 1], [p.locator('.questions').first(), 2]]);

  // 13. PDF
  await btn('📄 PDF').click();
  await p.waitForSelector('.toast.pdf', { timeout: 90000 });
  await shot(p, '13-pdf-gotowy', [[p.locator('.toast.pdf button', { hasText: 'Pobierz' }), 1]]);
  const [dl] = await Promise.all([p.waitForEvent('download'), p.locator('.toast.pdf button', { hasText: 'Pobierz' }).click()]);
  await dl.saveAs(OUT + '/przyklad.pdf');
  await p.locator('.toast.pdf button.link').click();

  // 14. Widok, kopia, eksport
  await shot(p, '14-pasek-narzedzi', [
    [btn('⧉ Kopia'), 1],
    [p.locator('select[aria-label="Widok kamery"]'), 2],
    [btn('⭳ Eksport'), 3],
    [btn('⭱ Import'), 4],
    [btn('↶'), 5],
  ], { x: 0, y: 0, width: 1280, height: 110 });

  // 15. iPhone
  const ip = await b.newContext({ ...devices['iPhone 13'] });
  const q = await ip.newPage();
  await q.goto('http://localhost:4173/');
  await q.waitForSelector('canvas');
  await q.waitForTimeout(2500);
  await q.screenshot({ path: `${OUT}/15-iphone.png` });
  await b.close();
})().catch((e) => {
  console.error('FAIL', e.message);
  process.exit(1);
});
