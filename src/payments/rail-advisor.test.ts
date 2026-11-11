import test from "node:test";
import assert from "node:assert/strict";
import { parseRailAdvice, recommendRailByRules } from "./rail-advisor.js";

test("rule advisor routes small agent micropayments to Solana channels", () => {
  assert.equal(recommendRailByRules(0.25, "Agent API call micropayment").rail, "solana");
});

test("rule advisor routes customer checkout to PayPal", () => {
  assert.equal(recommendRailByRules(15, "Customer checkout").rail, "paypal");
});

test("rule advisor requires manual review for payment disputes", () => {
  assert.equal(recommendRailByRules(5, "Refund a disputed payment").rail, "manual_review");
});

test("AI output parser accepts strict JSON and rejects unsafe or invalid rail values", () => {
  assert.deepEqual(parseRailAdvice('{"rail":"paypal","reason":"Customer requested checkout."}'), {
    rail: "paypal",
    reason: "Customer requested checkout.",
  });
  assert.equal(parseRailAdvice('{"rail":"execute_transaction","reason":"send"}'), null);
  assert.equal(parseRailAdvice("not json"), null);
});
