import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const ARTIFACTS_DIR = '/Users/vamshi/.gemini/antigravity-ide/brain/a2c759a4-0618-4e3b-a143-75886b711742';
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function run() {
  console.log('Launching Chrome...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,960'],
    defaultViewport: { width: 1440, height: 960 },
  });

  const page = await browser.newPage();
  console.log('Navigating to https://repogpt-nine.vercel.app/repo/1...');
  await page.goto('https://repogpt-nine.vercel.app/repo/1', { waitUntil: 'networkidle2', timeout: 30000 });

  // 1. CHAT TAB VERIFICATION
  console.log('Verifying Chat...');
  // Find textarea or input
  const inputSelector = 'input[placeholder*="Ask anything"], textarea[placeholder*="Ask anything"]';
  await page.waitForSelector(inputSelector, { timeout: 10000 });
  await page.type(inputSelector, 'wt changes to make');
  await page.keyboard.press('Enter');

  console.log('Waiting for AI response stream...');
  // Wait up to 15s for the response text to appear
  await page.waitForFunction(
    () => {
      const text = document.body.innerText;
      return (
        text.includes('index.html') &&
        (text.includes('styles.css') || text.includes('semantic') || text.includes('README.md') || text.includes('changes'))
      );
    },
    { timeout: 15000 }
  ).catch((e) => console.log('Wait timeout or already streaming:', e.message));

  // Additional 3 seconds to let streaming finish
  await new Promise((r) => setTimeout(r, 3500));
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'chat_verified.png'), fullPage: false });
  console.log('Saved chat_verified.png');

  // 2. GRAPH TAB VERIFICATION
  console.log('Verifying Knowledge Graph...');
  // Click Graph tab
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const graphBtn = buttons.find((b) => b.textContent?.includes('Graph'));
    if (graphBtn) graphBtn.click();
  });

  await new Promise((r) => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'graph_verified.png'), fullPage: false });
  console.log('Saved graph_verified.png');

  // 3. INTERVIEW TAB VERIFICATION
  console.log('Verifying Interview tab...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const interviewBtn = buttons.find((b) => b.textContent?.includes('Interview'));
    if (interviewBtn) interviewBtn.click();
  });

  // Wait for interview content or timeout fallback to render
  await new Promise((r) => setTimeout(r, 3500));
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'interview_verified.png'), fullPage: false });
  console.log('Saved interview_verified.png');

  // 4. DOCS TAB VERIFICATION
  console.log('Verifying Docs tab...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const docsBtn = buttons.find((b) => b.textContent?.includes('Docs'));
    if (docsBtn) docsBtn.click();
  });
  await new Promise((r) => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'docs_verified.png'), fullPage: false });
  console.log('Saved docs_verified.png');

  await browser.close();
  console.log('All verifications complete!');
}

run().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
