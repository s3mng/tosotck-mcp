import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";

function startServer() {
  const child = spawn(process.execPath, ["dist/index.js"], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      TOSS_CLIENT_ID: "",
      TOSS_CLIENT_SECRET: "",
      TOSS_ACCOUNT_SEQ: "",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  let nextId = 1;
  let buffer = "";
  const pending = new Map();

  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    for (;;) {
      const index = buffer.indexOf("\n");
      if (index === -1) break;

      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 1);
      if (!line) continue;

      const message = JSON.parse(line);
      const resolver = pending.get(message.id);
      if (resolver) {
        pending.delete(message.id);
        resolver(message);
      }
    }
  });

  function request(method, params = {}) {
    const id = nextId++;
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`MCP request timed out: ${method}`));
      }, 5_000);

      pending.set(id, (message) => {
        clearTimeout(timer);
        resolve(message);
      });
    });
  }

  function notify(method, params = {}) {
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
  }

  async function initialize() {
    const init = await request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "smoke-test", version: "0.0.0" },
    });
    assert.equal(init.result.serverInfo.name, "toss-securities");
    notify("notifications/initialized");
  }

  async function close() {
    child.stdin.end();
    child.kill();
    await new Promise((resolve) => child.once("close", resolve));
  }

  return { request, initialize, close };
}

async function callTool(server, name, args = {}) {
  const response = await server.request("tools/call", {
    name,
    arguments: args,
  });
  assert.equal(response.error, undefined);
  return response.result;
}

function parseToolText(result) {
  assert.equal(result.content[0].type, "text");
  return JSON.parse(result.content[0].text);
}

test("lists low-level and composite tools", async () => {
  const server = startServer();
  try {
    await server.initialize();
    const response = await server.request("tools/list");
    const names = response.result.tools.map((tool) => tool.name);

    for (const name of [
      "get_accounts",
      "get_prices",
      "place_order",
      "get_market_snapshot",
      "get_symbol_summary",
      "get_account_overview",
      "check_order_readiness",
      "validate_order",
      "get_api_coverage",
    ]) {
      assert.ok(names.includes(name), `missing tool ${name}`);
    }
  } finally {
    await server.close();
  }
});

test("allows status and local order validation without credentials", async () => {
  const server = startServer();
  try {
    await server.initialize();

    const status = parseToolText(await callTool(server, "get_server_status"));
    assert.equal(status.env.TOSS_CLIENT_ID, false);
    assert.equal(status.env.TOSS_CLIENT_SECRET, false);

    const validation = parseToolText(await callTool(server, "validate_order", {
      symbol: "005930",
      side: "BUY",
      order_type: "LIMIT",
      quantity: 1,
      price: 70000,
      client_order_id: "smoke-001",
    }));
    assert.equal(validation.valid, true);
    assert.equal(validation.requestBody.symbol, "005930");
    assert.equal(validation.requestBody.price, "70000");
  } finally {
    await server.close();
  }
});

test("rejects credentialed API calls when credentials are missing", async () => {
  const server = startServer();
  try {
    await server.initialize();
    const result = await callTool(server, "get_price", { symbol: "005930" });
    assert.match(result.content[0].text, /TOSS_CLIENT_ID/);
  } finally {
    await server.close();
  }
});
