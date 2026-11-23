const { chromium } = require('playwright-core');
(async () => {
  const fail = (m) => { console.error('FAIL: ' + m); process.exit(1); };
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('dialog', (d) => void d.accept());
  await page.goto('http://localhost:3000/dashboard/cashier', { waitUntil: 'networkidle', timeout: 60000 });
  await page.fill('input[type="email"]', 'demo@local.test');
  await page.fill('input[type="password"]', 'demo1234');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(6000);
  await page.addStyleTag({ content: 'nextjs-portal{display:none} [data-nextjs-toast]{display:none}' });
  const navTo = async (title) => {
    await page.evaluate((t) => {
      const b = [...document.querySelectorAll('button[aria-pressed]')].find((x) => x.textContent.trim().includes(t));
      b.click();
    }, title);
    await page.waitForTimeout(1800);
  };
  await navTo('إدارة المخزون');
  await page.fill('input[placeholder="مثال: لبن كامل الدسم"]', 'سكر خام');
  await page.fill('input[placeholder="مل، جرام، قطعة..."]', 'جرام');
  await page.evaluate(() => { [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'إضافة خامة').click(); });
  await page.waitForTimeout(2000);
  await page.evaluate(() => { [...document.querySelectorAll('button')].find((x) => x.textContent.trim().includes('حفظ الإعدادات والوصفات')).click(); });
  await page.waitForTimeout(2500);
  await navTo('فواتير المشتريات');
  await page.evaluate(() => { [...document.querySelectorAll('button')].find((x) => x.textContent.includes('فاتورة جديدة')).click(); });
  await page.waitForTimeout(600);
  const draftForm = page.locator('form').filter({ hasText: 'فاتورة مشتريات جديدة' });
  await draftForm.locator('label', { hasText: 'المورد' }).locator('input').fill('مورد السكر');
  await draftForm.locator('label', { hasText: 'رقم الفاتورة' }).locator('input').fill('INV-77');
  await page.evaluate(() => {
    const form = [...document.querySelectorAll('form')].find((f) => f.textContent.includes('فاتورة مشتريات جديدة'));
    const sel = [...form.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.textContent.includes('سكر خام')));
    const opt = [...sel.options].find((o) => o.textContent.includes('سكر خام'));
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    setter.call(sel, opt.value);
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await draftForm.locator('label', { hasText: 'الكمية' }).locator('input').fill('1000');
  await draftForm.locator('label', { hasText: 'سعر الوحدة' }).locator('input').fill('0.5');
  await page.selectOption('select[aria-label="طريقة الدفع"]', 'partial');
  await page.fill('input[aria-label="المدفوع الآن"]', '200');
  await page.evaluate(() => { [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'حفظ كمسودة').click(); });
  await page.waitForTimeout(3000);
  await page.evaluate(() => {
    const d = [...document.querySelectorAll('details')].find((x) => x.textContent.includes('INV-77'));
    d.setAttribute('open', '');
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => { [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'اعتماد واستلام').click(); });
  await page.waitForTimeout(3500);
  await page.evaluate(() => {
    const h = [...document.querySelectorAll('h3')].find((x) => x.textContent.trim() === 'المديونيات');
    h.scrollIntoView({ block: 'center' });
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: '/downloads/matcha-e2e/137-settle-open.png' });
  // overpay attempt must be rejected
  await page.fill('input[aria-label="مبلغ التسديد لفاتورة INV-77"]', '9999');
  await page.evaluate(() => { [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'تسديد').click(); });
  await page.waitForTimeout(2000);
  let body = await page.evaluate(() => document.body.innerText);
  if (!body.includes('أكبر من المتبقي')) fail('overpay not rejected');
  // settle the exact remainder
  await page.fill('input[aria-label="مبلغ التسديد لفاتورة INV-77"]', '300');
  await page.evaluate(() => { [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'تسديد').click(); });
  await page.waitForTimeout(3000);
  body = await page.evaluate(() => document.body.innerText);
  const settleInputGone = await page.evaluate(() => !document.querySelector('input[aria-label="مبلغ التسديد لفاتورة INV-77"]'));
  if (!settleInputGone) fail('INV-77 settle input still visible after full settlement');
  if (!body.includes('تم تسجيل الدفعة')) fail('success message missing');
  // invoice history shows تسديد دفعة and fully paid line
  await page.evaluate(() => {
    const d = [...document.querySelectorAll('details')].find((x) => x.textContent.includes('INV-77'));
    d.setAttribute('open', '');
    d.scrollIntoView({ block: 'center' });
  });
  await page.waitForTimeout(500);
  body = await page.evaluate(() => document.body.innerText);
  if (!body.includes('تسديد دفعة')) fail('payment history entry missing');
  await page.screenshot({ path: '/downloads/matcha-e2e/136-settle-paid.png' });
  // persistence after reload
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await navTo('فواتير المشتريات');
  body = await page.evaluate(() => document.body.innerText);
  if (body.includes('إجمالي المديونيات (المتبقي للموردين)')) fail('debt reappeared after reload');
  console.log('PASS: settle 300 on 500/200 invoice, overpay rejected, debt cleared, persisted');
  await browser.close();
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
