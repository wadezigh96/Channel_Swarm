import assert from "node:assert/strict";
import {test} from "node:test";
import {Keypair,PublicKey} from "@solana/web3.js";
import {TOKEN_PROGRAM_ID} from "@solana/spl-token";
import {buildOpenInstruction,buildDistributeInstruction,buildSettleAndSealInstruction,encodeDistributionPreimage} from "./instructions.js";
import {PAYMENT_CHANNELS_PROGRAM_ID,unsupportedToken2022MintExtensions} from "./channel-manager.js";

test("open builder encodes current official recipient preimage",()=>{
 const payer=Keypair.generate().publicKey,payee=Keypair.generate().publicKey,mint=new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),channel=Keypair.generate().publicKey,recipient=Keypair.generate().publicKey;
 const ix=buildOpenInstruction({payer,rentPayer:payer,payee,mint,authorizedSigner:payer,channel,salt:9n,deposit:1000000n,gracePeriod:900,openSlot:123n,recipients:[{recipient,bps:2500}]});
 assert.equal(ix.data[0],1);assert.equal(ix.data.readUInt32LE(29),1);assert.deepEqual(ix.data.subarray(33,65),recipient.toBuffer());assert.equal(ix.data.readUInt16LE(65),2500);assert.equal(ix.keys.length,14);assert.equal(ix.programId.toBase58(),PAYMENT_CHANNELS_PROGRAM_ID.toBase58());
});
test("distribution builder matches official 11-account head plus recipient tail",()=>{
 const payer=Keypair.generate().publicKey,payee=Keypair.generate().publicKey,mint=Keypair.generate().publicKey,channel=Keypair.generate().publicKey,treasury=Keypair.generate().publicKey,recipient=Keypair.generate().publicKey;
 const ix=buildDistributeInstruction({channel,payer,rentPayer:payer,payee,mint,tokenProgram:TOKEN_PROGRAM_ID,treasuryOwner:treasury,recipients:[{recipient,bps:5000}]});
 assert.equal(ix.data[0],7);assert.equal(ix.data.readUInt32LE(1),1);assert.equal(ix.keys.length,12);assert.equal(ix.keys[0].pubkey.toBase58(),channel.toBase58());assert.equal(ix.keys[11].isWritable,true);
});
test("distribution preimage rejects duplicate recipients and invalid totals",()=>{
 const a=Keypair.generate().publicKey;assert.throws(()=>encodeDistributionPreimage([{recipient:a,bps:500},{recipient:a,bps:500}]),/duplicate/);
 assert.throws(()=>encodeDistributionPreimage([{recipient:a,bps:10001}]),/bps/);
});
test("settleAndSeal requires payee signer meta",()=>{
 const payee=Keypair.generate().publicKey,channel=Keypair.generate().publicKey,ix=buildSettleAndSealInstruction(payee,channel,true);
 assert.equal(ix.keys[0].isSigner,true);assert.equal(ix.data[0],4);assert.equal(ix.data[1],1);
});
test("Token-2022 mint parser rejects unsupported permanent delegate extension",()=>{
 const data=new Uint8Array(166+4+32);data[165]=1;data[166]=12;data[167]=0;data[168]=32;data[169]=0;
 assert.deepEqual(unsupportedToken2022MintExtensions(data),[12]);
});
test("Token-2022 mint parser accepts metadata pointer extension id",()=>{
 const data=new Uint8Array(166+4+64);data[165]=1;data[166]=18;data[167]=0;data[168]=64;data[169]=0;
 assert.deepEqual(unsupportedToken2022MintExtensions(data),[]);
});
