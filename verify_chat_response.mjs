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
  await page.waitForFunction(() => {
    const buttons = Array.from(document.querySelectorAll('button[data-slot="tabs-trigger"], button[role="tab"]'));
    const chatBtn = buttons.find((b) => b.textContent?.includes('Chat'));
    if (chatBtn) {
      chatBtn.click();
      return true;
    }
    return false;
  }, { timeout: 15000 });

  // Wait for textarea to be active and not disabled
  console.log('Waiting for active textarea...');
  await page.waitForSelector('textarea:not([disabled])', { timeout: 15000 });

  console.log('Typing query...');
  await page.type('textarea:not([disabled])', 'wt changes to make');
  await new Promise((r) => setTimeout(r, 500));

  console.log('Submitting query...');
  await page.click('button[type="submit"]');

  console.log('Waiting for AI response to stream in...');
  // Wait until user message appears and AI assistant starts streaming
  await page.waitForFunction(
    () => {
      const text = document.body.innerText;
      return (
        text.includes('index.html') ||
        text.includes('styles.css') ||
        text.includes('Changes') ||
        text.includes('HTML') ||
        text.includes('Spoon-Knife') ||
        text.includes('repository')
      );
    },
    { timeout: 35000 }
  );

  // Allow 5 seconds for streaming tokens to accumulate
  await new Promise((r) => setTimeout(r, 5000));

  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'chat_final_verified.png'), fullPage: false });
  console.log('Saved chat_final_verified.png!');

  await browser.close();
  console.log('Chat verification completed successfully!');
}

run().catch((err) => {
  console.error('Chat verification failed:', err);
  process.exit(1);
});
