const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto('http://localhost:3001');
    // Fill login form (assuming selectors exist)
    await page.fill('#email', 'admin@vidlik.gov.ua');
    await page.fill('#password', 'SecurePass123!');
    // Try to click the login button by text
    await page.click('text=Увійти');
    // Wait for navigation to dashboard
    await page.waitForNavigation({ url: /dashboard/, timeout: 15000 }).catch(() => {});
    const url = page.url();
    console.log('Dashboard URL after login:', url);
  } catch (e) {
    console.error('Playwright test failed:', e);
    process.exit(2);
  } finally {
    await browser.close();
  }
})();
