const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { once } = require("node:events");
const { _electron } = require("playwright-core");
const sharp = require("sharp");

const root = path.resolve(__dirname, "../..");
const executable = process.argv[2] || path.join(root, "dist-desktop", process.platform === "darwin"
  ? "mac-arm64/YezijianWorkbench.app/Contents/MacOS/YezijianWorkbench"
  : "win-unpacked/YezijianWorkbench.exe");
const evidence = path.join(root, "test-output", "workbench");
const fakeKey = "isolated-fixture-key-never-sent-to-openai";

async function png(color, text, size = 176) {
  const guide = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect inset="0" x="5" y="5" width="${size - 10}" height="${size - 10}" fill="none" stroke="#fff" stroke-width="3"/><text x="50%" y="54%" text-anchor="middle" fill="white" font-size="22" font-family="sans-serif">${text}</text></svg>`);
  return sharp({ create: { width: size, height: size, channels: 3, background: color } }).composite([{ input: guide }]).png().toBuffer();
}

async function startFixture() {
  const outputs = [await png("#587967", "Mock 01", 480), await png("#456d88", "Mock 02", 480), await png("#895e50", "Mock 03", 480)];
  const calls = { chat: [], images: [], attempts: [] };
  const server = http.createServer(async (req, res) => {
    const json = (status, data) => res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(data));
    try {
      calls.attempts.push(req.url);
      if (req.headers.authorization !== `Bearer ${fakeKey}`) return json(401, { error: { message: "Fixture invalid key", code: "invalid_api_key" } });
      if (req.url.startsWith("/v1/models/")) return json(200, { id: req.url.split("/").at(-1), object: "model" });
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const bytes = Buffer.concat(chunks);
      if (req.url === "/v1/chat/completions") {
        const body = JSON.parse(bytes.toString());
        calls.chat.push(body);
        const messages = body.messages;
        const last = JSON.stringify(messages.at(-1).content);
        if (last.includes("模拟超时")) return;
        const images = messages.flatMap(message => Array.isArray(message.content) ? message.content.filter(part => part.type === "image_url") : []);
        const words = last.includes("关键词是什么") && messages.some(message => JSON.stringify(message.content).includes("薄荷")) ? ["还记得", " **薄荷**"] :
          images.length ? ["图片里有", " **绿色框**。"] : ["收到，", " 我记得关键词。"];
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        for (const text of words) {
          res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: text } }] })}\n\n`);
          await new Promise(resolve => setTimeout(resolve, 450));
        }
        return res.end("data: [DONE]\n\n");
      }
      if (req.url === "/v1/images/edits") {
        const form = await (new Response(bytes, { headers: { "Content-Type": req.headers["content-type"] } })).formData();
        const files = await Promise.all([...form.values()].filter(value => value instanceof File).map(async file => Buffer.from(await file.arrayBuffer())));
        calls.images.push({ prompt: form.get("prompt"), model: form.get("model"), size: form.get("size"), files });
        await new Promise(resolve => setTimeout(resolve, 700));
        return json(200, { data: [{ b64_json: outputs[calls.images.length - 1].toString("base64") }] });
      }
      return json(404, { error: { message: "Unknown fixture route" } });
    } catch (error) {
      return json(500, { error: { message: error.message } });
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return { server, calls, url: `http://127.0.0.1:${server.address().port}/v1` };
}

async function visible(locator, timeout = 15000) {
  await locator.waitFor({ state: "visible", timeout });
}

async function downloadImage(app, page, fileName) {
  const target = path.join(evidence, fileName);
  await app.evaluate(({ session }, target) => {
    global.workbenchDownload = new Promise(resolve => {
      const finish = result => { clearTimeout(timer); resolve(result); };
      const onDownload = (_event, item) => {
        item.setSavePath(target);
        item.once("done", (_downloadEvent, state) => finish({ state, name: item.getFilename() }));
      };
      const timer = setTimeout(() => {
        session.defaultSession.removeListener("will-download", onDownload);
        resolve({ state: "timed out waiting for Electron download" });
      }, 15000);
      session.defaultSession.once("will-download", onDownload);
    });
  }, target);
  await page.getByRole("link", { name: "下载 PNG" }).click();
  const result = await app.evaluate(() => global.workbenchDownload);
  assert.equal(result.state, "completed", JSON.stringify(result));
  assert.match(result.name, /^compose-873x947-.*\.png$/);
  return fs.readFile(target);
}

async function asset(page, label, filename) {
  await page.locator(".wb-studio-editor fieldset:not([disabled])").waitFor();
  await page.getByLabel(`上传${label}`, { exact: true }).setInputFiles(filename);
  const image = page.getByRole("img", { name: label, exact: true });
  await visible(image);
  await image.evaluate(element => element.decode());
  assert.ok(await image.evaluate(element => element.naturalWidth > 0));
  return image;
}

async function main() {
  await fs.mkdir(evidence, { recursive: true });
  await fs.access(executable);
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "yezijian-gui-"));
  const scratchCwd = path.join(temp, "cwd");
  await fs.mkdir(scratchCwd);
  const userData = path.join(temp, "椰子酱测试数据");
  const inputs = Object.fromEntries(await Promise.all([
    ["frame", "#527a5c", "Frame"], ["product", "#4f7a92", "Product"], ["reference", "#987149", "Reference"], ["replacement", "#765291", "New item"],
  ].map(async ([name, color, label]) => {
    const file = path.join(temp, `${name}.png`);
    await fs.writeFile(file, await png(color, label));
    return [name, file];
  })));
  const fixture = await startFixture();
  let app;
  async function launch() {
    const env = { ...process.env, APP_USER_DATA_DIR: userData, WORKBENCH_TEST_API_URL: fixture.url };
    for (const name of ["OPENAI_API_KEY", "WORKBENCH_SECRETS_PATH", "WORKBENCH_REQUIRE_AUTH", "ELECTRON_RUN_AS_NODE", "NODE_PATH"]) delete env[name];
    app = await _electron.launch({ executablePath: executable, cwd: scratchCwd, env, timeout: 60000 });
    const deadline = Date.now() + 45000;
    for (;;) {
      const page = app.windows().find(window => /^http:\/\/127\.0\.0\.1:/.test(window.url()));
      if (page) {
        await visible(page.getByRole("navigation", { name: "主导航" }));
        return page;
      }
      if (Date.now() > deadline) throw new Error("打包应用没有打开主窗口");
      await new Promise(resolve => setTimeout(resolve, 150));
    }
  }

  let page;
  try {
    page = await launch();
    await visible(page.getByRole("heading", { name: "今天聊点什么？" }));
    assert.equal((await fetch(page.url())).status, 403, "The bundled server must reject a browser outside its own window");
    await visible(page.getByRole("link", { name: "配置 API Key" }));
    await page.screenshot({ path: path.join(evidence, "mac-or-win-first-start.png") });
    await page.getByRole("link", { name: "配置 API Key" }).click();
    await page.getByLabel("OpenAI API Key", { exact: true }).fill("an-invalid-fixture-key");
    await page.getByRole("button", { name: "验证并保存" }).click();
    await visible(page.getByRole("alert").filter({ hasText: "拒绝了这个 Key" }));
    await page.getByLabel("OpenAI API Key", { exact: true }).fill(fakeKey);
    await page.getByRole("button", { name: "验证并保存" }).click();
    await visible(page.getByText("已验证并保存。", { exact: false }));
    assert.equal(await page.getByLabel("OpenAI API Key", { exact: true }).inputValue(), "");
    assert.ok(!(await fs.readFile(path.join(userData, "config", "secrets.json"), "utf8")).includes(fakeKey));
    await page.screenshot({ path: path.join(evidence, "settings-configured.png") });
    await page.getByRole("link", { name: "返回聊天" }).click();

    async function question(text) {
      await page.getByRole("textbox", { name: "消息", exact: true }).fill(text);
      await page.getByRole("button", { name: "发送", exact: true }).click();
    }
    await question("请记住关键词：薄荷。");
    await visible(page.getByText("收到，", { exact: true }));
    await page.screenshot({ path: path.join(evidence, "chat-streaming.png") });
    await visible(page.getByText("我记得关键词。", { exact: false }));
    await question("关键词是什么？");
    await visible(page.locator(".wb-assistant strong").getByText("薄荷", { exact: true }));
    await page.getByLabel("聊天附图").setInputFiles(inputs.frame);
    await visible(page.getByRole("img", { name: "待发送图片" }));
    await question("图里是什么？");
    await visible(page.getByRole("img", { name: "聊天图片" }));
    await visible(page.locator(".wb-assistant strong").getByText("绿色框", { exact: true }));
    await question("之前那张图是什么颜色？");
    await visible(page.locator(".wb-assistant strong").getByText("绿色框", { exact: true }).nth(1));
    const lastChat = fixture.calls.chat.at(-1);
    assert.equal(lastChat.stream, true);
    assert.ok(Array.isArray(lastChat.messages.at(-3).content));
    assert.equal(typeof lastChat.messages.at(-1).content, "string");
    await page.getByRole("button", { name: "重命名对话" }).click();
    await page.getByLabel("对话名称").fill("看图与翻译");
    await page.getByRole("button", { name: "保存名称" }).click();
    await visible(page.getByRole("button", { name: "看图与翻译" }));
    await page.screenshot({ path: path.join(evidence, "chat-history.png") });
    await question("模拟超时");
    await visible(page.getByRole("alert").filter({ hasText: "响应超时" }));
    assert.equal(fixture.calls.chat.length, 5);
    await page.screenshot({ path: path.join(evidence, "chat-timeout.png") });

    await page.getByRole("link", { name: "做图", exact: true }).click();
    await asset(page, "主图框", inputs.frame);
    await asset(page, "产品图", inputs.product);
    await asset(page, "参考图", inputs.reference);
    await page.getByLabel("制作要求").fill("保留主框边界，产品放在中央，参考图用于摆放。");
    await page.getByLabel("宽度", { exact: true }).fill("873");
    await page.getByLabel("高度", { exact: true }).fill("947");
    await page.getByLabel("参考图用途").selectOption("layout");
    await page.getByRole("button", { name: "生成图片" }).click();
    await visible(page.getByText("正在生成图片…", { exact: true }));
    await page.screenshot({ path: path.join(evidence, "compose-generating.png") });
    await visible(page.getByRole("button", { name: "第 1 版", exact: true }));
    let first = await downloadImage(app, page, "mock-output-873x947.png");
    let info = await sharp(first).metadata();
    assert.deepEqual([info.width, info.height, info.format], [873, 947, "png"]);
    assert.match(fixture.calls.images[0].prompt, /873×947/);
    assert.match(fixture.calls.images[0].prompt, /第三|第 3 张输入图：参考图。参考这张图的构图和摆放/);
    for (const [index, slot] of ["frame", "product", "reference"].entries()) {
      const original = await sharp(await fs.readFile(inputs[slot])).raw().toBuffer();
      const sent = await sharp(fixture.calls.images[0].files[index]).raw().toBuffer();
      assert.deepEqual(sent, original);
    }
    await page.getByRole("button", { name: "生成图片" }).click();
    await visible(page.getByRole("button", { name: "第 2 版", exact: true }));
    await page.getByRole("button", { name: "第 1 版", exact: true }).click();
    assert.deepEqual(await downloadImage(app, page, "selected-first-version.png"), first);
    await page.getByRole("button", { name: "存入素材库" }).click();
    await visible(page.getByText("第 1 版已存入素材库。", { exact: true }));
    const library = await page.evaluate(async () => (await (await fetch("/api/library")).json()).data);
    assert.ok(library.some(item => item.width === 873 && item.height === 947));
    const saved = library.find(item => item.width === 873 && item.height === 947);
    const savedBytes = await page.evaluate(async id => Array.from(new Uint8Array(await (await fetch(`/api/library/${id}/file`)).arrayBuffer())), saved.id);
    assert.deepEqual(Buffer.from(savedBytes), first);
    await page.getByLabel("修改第 1 版").fill("把背景改浅，保留产品位置。");
    await page.getByRole("button", { name: "继续修改" }).click();
    await visible(page.getByRole("button", { name: "第 3 版", exact: true }));
    assert.deepEqual(fixture.calls.images[2].files[0], first);
    assert.match(fixture.calls.images[2].prompt, /第 1 张输入图：选中的上一版原图/);
    const oldJobId = new URL(page.url()).searchParams.get("job");
    await page.getByRole("button", { name: "查看大图", exact: true }).click();
    await visible(page.getByRole("dialog"));
    await page.keyboard.press("Escape");
    const image = page.getByRole("img", { name: "第 3 版生成结果" });
    await image.evaluate(element => element.decode());
    await page.screenshot({ path: path.join(evidence, "compose-result.png") });
    const mainWindow = await app.browserWindow(page);
    await mainWindow.evaluate(win => win.setSize(900, 650));
    await page.waitForFunction(() => window.innerWidth <= 910);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const bounds = await image.evaluate(element => {
      const picture = element.getBoundingClientRect();
      const canvas = element.closest(".wb-canvas").getBoundingClientRect();
      return { imageTop: picture.top, imageBottom: picture.bottom, canvasTop: canvas.top, canvasBottom: canvas.bottom };
    });
    assert.ok(bounds.imageTop >= bounds.canvasTop && bounds.imageBottom <= bounds.canvasBottom, JSON.stringify(bounds));
    await page.screenshot({ path: path.join(evidence, "compose-900x650.png") });

    await page.getByRole("button", { name: "存为模板" }).click();
    await page.getByLabel("模板名称").fill("主图框与常用要求");
    await page.getByRole("button", { name: "保存模板" }).click();
    await visible(page.getByText("模板已保存。", { exact: false }));
    await page.getByRole("button", { name: "新建任务" }).click();
    await page.getByLabel("套用模板").selectOption({ label: "主图框与常用要求" });
    await visible(page.getByRole("img", { name: "主图框", exact: true }));
    assert.equal(await page.getByLabel("宽度", { exact: true }).inputValue(), "873");
    assert.equal(await page.getByLabel("高度", { exact: true }).inputValue(), "947");
    assert.match(await page.getByLabel("制作要求").inputValue(), /保留主框边界/);
    assert.equal(await page.getByRole("img", { name: "产品图", exact: true }).count(), 0);
    await asset(page, "产品图", inputs.replacement);

    await app.close();
    app = null;
    page = await launch();
    await visible(page.getByRole("button", { name: "看图与翻译" }));
    await visible(page.getByRole("img", { name: "聊天图片" }));
    await page.getByRole("link", { name: "设置", exact: true }).click();
    await visible(page.getByText("已配置", { exact: true }));
    await page.getByRole("link", { name: "做图", exact: true }).click();
    const restored = page.getByRole("button", { name: /保留主框边界/ });
    await visible(restored.first());
    await restored.first().click();
    await visible(page.getByRole("img", { name: "产品图", exact: true }));
    if (new URL(page.url()).searchParams.get("job") !== oldJobId) await restored.nth(1).click();
    await visible(page.getByRole("button", { name: "第 3 版" }));
    await visible(page.getByRole("img", { name: "参考图", exact: true }));
    assert.equal(fixture.calls.images.length, 3, "Only the three explicit image calls may run");
    console.log(`PASS ${process.platform}/${process.arch} bundled GUI: model setup, streaming, picture follow-up, timeout, three-input compose, exact PNG download, historical edit/save, template reuse, restart.`);
  } catch (error) {
    if (page) await page.screenshot({ path: path.join(evidence, "failure.png") }).catch(() => {});
    throw error;
  } finally {
    if (app) await app.close().catch(() => {});
    fixture.server.closeAllConnections();
    await new Promise(resolve => fixture.server.close(resolve));
    if (path.basename(temp).startsWith("yezijian-gui-")) await fs.rm(temp, { recursive: true, force: true, maxRetries: 5 });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
