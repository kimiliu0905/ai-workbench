const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { randomUUID } = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const { PrismaClient } = require('@prisma/client');
const { chromium } = require('playwright-core');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn) { for (let i=0;i<300;i++) { if (await fn()) return; await sleep(200); } throw new Error('Browser check timed out'); }
(async () => {
  process.chdir(path.resolve(__dirname, '../..'));
  const runId = randomUUID(), dist = `.next-browser-${runId}`, config = `.browser-tsconfig-${runId}.json`;
  fs.copyFileSync('tsconfig.json', config);
  fs.mkdirSync('test-output/provider-browser', { recursive: true });
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mxpage-provider-browser-'));
  const filename = path.join(directory, 'test.db');
  const sqlite = new DatabaseSync(filename);
  for (const folder of fs.readdirSync('prisma/migrations', { withFileTypes: true }).filter(x => x.isDirectory()).sort((a,b)=>a.name.localeCompare(b.name))) sqlite.exec(fs.readFileSync(path.join('prisma/migrations', folder.name, 'migration.sql'), 'utf8'));
  sqlite.close();
  const databaseUrl = `file:${filename.replaceAll('\\', '/')}`;
  const db = new PrismaClient({ datasourceUrl: databaseUrl });
  const port = await new Promise(resolve => { const socket = net.createServer(); socket.listen(0, '127.0.0.1', () => { const n = socket.address().port; socket.close(() => resolve(n)); }); });
  const url = `http://127.0.0.1:${port}`;
  const log = fs.openSync('test-output/provider-browser/server.log', 'w');
  const testEnv = { ...process.env, DATABASE_URL: databaseUrl, STORAGE_ROOT: path.join(directory, 'storage'), NEXT_DIST_DIR: dist, MXPAGE_TEST_TSCONFIG: config, NEXT_TELEMETRY_DISABLED: '1' };
  for (const key of ['LOCK_BASE_URL', 'FORCED_API_BASE', 'FORCED_API_BASE_URL', 'OPENAI_API_KEY']) delete testEnv[key];
  const server = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', String(port)], { windowsHide: true, stdio: ['ignore', log, log], env: testEnv });
  let browser;
  try {
    await until(async () => { try { return (await fetch(`${url}/settings`)).ok; } catch { return false; } });
    browser = await chromium.launch({ ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : fs.existsSync(chromium.executablePath()) ? {} : { channel: 'chrome' }), headless: true, args: ['--no-proxy-server'] });
    const page = await browser.newPage(); page.setDefaultTimeout(30000);
    await page.goto(`${url}/settings`);
    assert.equal(await page.locator('#provider-api-key, input[name="apiKey"]').count(), 0);
    assert.equal(await page.getByLabel('默认文本模型').inputValue(), 'gpt-6-luna');
    await page.getByLabel('默认文本模型').selectOption('gpt-6.2-sol');
    await page.getByRole('button', { name: '保存设置' }).click();
    await page.getByText('已保存。对新的聊天、做图、译图和 Agent 任务生效。').waitFor();
    const stored = await page.evaluate(() => window.localStorage.getItem('mxpage:provider-credentials:v1'));
    assert.equal(stored, null);
    assert.equal(await page.getByText(/API Key|密钥输入/).count(), 0);
    console.log('PASS: settings expose model choices without a renderer API key');
  } finally {
    await browser?.close();
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); else server.kill('SIGTERM');
    await db.$disconnect(); fs.closeSync(log);
    for (const item of [dist, config]) {
      const resolved = path.resolve(item); if (path.dirname(resolved) !== process.cwd() || !item.includes(runId)) throw new Error('Invalid cache cleanup path');
      fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
    if (path.dirname(directory) !== path.resolve(os.tmpdir()) || !path.basename(directory).startsWith('mxpage-provider-browser-')) throw new Error('Invalid fixture cleanup path');
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
