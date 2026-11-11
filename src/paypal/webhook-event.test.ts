import assert from "node:assert/strict";
import {test} from "node:test";
import {extractPayPalOrderId} from "./webhook-event.js";
test("capture events resolve to related order ID, not capture resource ID",()=>{
 assert.equal(extractPayPalOrderId("PAYMENT.CAPTURE.COMPLETED",{id:"CAPTURE-1",supplementary_data:{related_ids:{order_id:"ORDER-1"}}}),"ORDER-1");
});
test("capture event without related order ID is not misfiled under capture ID",()=>{
 assert.equal(extractPayPalOrderId("PAYMENT.CAPTURE.COMPLETED",{id:"CAPTURE-1"}),"");
});
test("checkout order events resolve from resource ID",()=>{
 assert.equal(extractPayPalOrderId("CHECKOUT.ORDER.APPROVED",{id:"ORDER-2"}),"ORDER-2");
});
