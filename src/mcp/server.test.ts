import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const DEVNET_MINT = "CXk2AMBfi3TwaEL2468s6zP8xq9NxTXjp9gjMgzeUynM";
const MAINNET_MINT = "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo";

function callPyusdInfo(env: Record<string, string | undefined> = {}) {
  const result = spawnSync(
    process.execPath,
    ["node_modules/tsx/dist/cli.mjs", "src/mcp/server.ts"],
    {
      cwd: process.cwd(),
      input: '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"channelswarm_pyusd_info","arguments":{}}}\n',
      encoding: "utf8",
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        ...env,
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  const line = result.stdout.split("\n").find((value) => value.startsWith("{"));
  assert.ok(line, `MCP returned no JSON response: ${result.stdout}`);
  const response = JSON.parse(line) as { result: { content: [{ text: string }] } };
  return JSON.parse(response.result.content[0].text) as { network: string; mint: string };
}

test("MCP default PYUSD network and mint are the same network", () => {
  const info = callPyusdInfo();
  assert.equal(info.network, "devnet");
  assert.equal(info.mint, DEVNET_MINT);
});

test("MCP selects the matching PYUSD mint for explicit mainnet", () => {
  const info = callPyusdInfo({ NETWORK: "mainnet", PYUSD_NETWORK: "mainnet" });
  assert.equal(info.network, "mainnet");
  assert.equal(info.mint, MAINNET_MINT);
});
