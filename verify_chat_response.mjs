import puppeteer from 'puppeteer-core';
import path from 'path';

const ARTIFACTS_DIR = '/Users/vamshi/.gemini/antigravity-ide/brain/a2c759a4-0618-4e3b-a143-75886b711742';
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function run() {
  console.log('Launching Chrome...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--window-size=1440,960'],
    defaultViewport: { width: 1440, height: 960 },
  });

  const page = await browser.newPage();
  console.log('Navigating to https://repogpt-nine.vercel.app/repo/1...');
  await page.goto('https://repogpt-nine.vercel.app/repo/1', { waitUntil: 'networkidle2' });

  // Click Chat tab
  console.log('Clicking Chat tab...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const chatBtn = buttons.find((b) => b.textContent?.includes('Chat'));
    if (chatBtn) chatBtn.click();
  });

  // Wait for textarea to be active and not disabled
  console.log('Waiting for active textarea...');
  await page.waitForSelector('textarea:not([disabled])', { timeout: 15000 });

  console.log('Typing query...');
  await page.type('textarea:not([disabled])', 'wt changes to make');

  console.log('Submitting query...');
  await page.evaluate(() => {
    const btn = document.querySelector('button[type="submit"]');
    if (btn) btn.click();
  });

  console.log('Waiting for AI response to stream in...');
  // Wait until user message appears and AI assistant starts streaming
  await page.waitForFunction(
    () => {
      const messages = document.querySelectorAll('.rounded-2xl');
      return messages.length >= 2;
    },
    { timeout: 15000 }
  );

  // Allow 6 seconds for streaming tokens to accumulate
  await new Promise((r) => setTimeout(r, 6000));

  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'chat_response_verified.png'), fullPage: false });
  console.log('Saved chat_response_verified.png!');

  await browser.close();
  console.log('Chat verification completed successfully!');
}

run().catch((err) => {
  console.error('Chat verification failed:', err);
  process.exit(1);
});
