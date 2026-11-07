import { test } from "node:test";
import assert from "node:assert/strict";
import { decideAgentIntent, AiGatewayConfigurationError } from "./gateway.js";

const input = {
  intent: "Summarize recent market data for AAPL",
  availableAgents: [
    { name: "DataOracle", role: "data", reputation: 1.2 },
    { name: "StockHunter", role: "stock", reputation: 1.1 },
  ],
};

test("AI Gateway request returns a validated agent proposal", async () => {
  let requestedUrl = "";
  let requestBody: any;
  const result = await decideAgentIntent(input, {
    apiKey: "test-key",
    model: "test/provider-model",
    fetchImpl: async (url, init) => {
      requestedUrl = String(url);
      requestBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          routeTo: "data",
          action: "analyze_data",
          confidence: 0.91,
          rationale: "The intent requests a market-data summary.",
          requiresHumanApproval: true,
        }) } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });

  assert.equal(requestedUrl, "https://ai-gateway.vercel.sh/v1/chat/completions");
  assert.equal(requestBody.model, "test/provider-model");
  assert.equal(result.routeTo, "data");
  assert.equal(result.requiresHumanApproval, true);
});

test("AI Gateway refuses to proceed without server credentials", async () => {
  await assert.rejects(
    decideAgentIntent(input, { apiKey: "", model: "test/model" }),
    AiGatewayConfigurationError,
  );
});

test("AI Gateway rejects a model proposal that selects an unavailable role", async () => {
  await assert.rejects(
    decideAgentIntent(input, {
      apiKey: "test-key",
      model: "test/model",
      fetchImpl: async () => new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          routeTo: "compute",
          action: "coordinate_task",
          confidence: 0.8,
          rationale: "No compute agent exists.",
          requiresHumanApproval: true,
        }) } }],
      }), { status: 200 }),
    }),
    /unavailable agent role/,
  );
});

test("AI Gateway rejects any proposal that does not require human approval", async () => {
  await assert.rejects(
    decideAgentIntent(input, {
      apiKey: "test-key",
      model: "test/model",
      fetchImpl: async () => new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          routeTo: "data",
          action: "analyze_data",
          confidence: 0.8,
          rationale: "Looks safe.",
          requiresHumanApproval: false,
        }) } }],
      }), { status: 200 }),
    }),
  );
});
