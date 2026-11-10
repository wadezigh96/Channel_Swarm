/**
 * Solana Foundation Payment Channels instruction builders.
 * Account order and wire encodings mirror the official generated TypeScript client.
 */
import { PublicKey, SystemProgram, TransactionInstruction, Ed25519Program, SYSVAR_INSTRUCTIONS_PUBKEY, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PAYMENT_CHANNELS_PROGRAM_ID } from "./channel-manager.js";
export const EVENT_AUTHORITY_SEED=Buffer.from("__event_authority");
export interface DistributionEntry { recipient:PublicKey; bps:number }
export function eventAuthorityPda(programId:PublicKey=PAYMENT_CHANNELS_PROGRAM_ID):PublicKey {
 return PublicKey.findProgramAddressSync([EVENT_AUTHORITY_SEED],programId)[0];
}
export function encodeDistributionPreimage(entries:DistributionEntry[]):Buffer {
 if(entries.length>32) throw new Error("distribution_recipient_limit_exceeded");
 const seen=new Set<string>(); let sum=0;
 for(const e of entries){const k=e.recipient.toBase58();if(seen.has(k))throw new Error("duplicate_distribution_recipient");seen.add(k);if(!Number.isInteger(e.bps)||e.bps<1||e.bps>10000)throw new Error("invalid_distribution_bps");sum+=e.bps;}
 if(sum>10000)throw new Error("distribution_bps_exceeds_10000");
 const out=Buffer.alloc(4+entries.length*34);out.writeUInt32LE(entries.length,0);let o=4;
 for(const e of entries){e.recipient.toBuffer().copy(out,o);o+=32;out.writeUInt16LE(e.bps,o);o+=2;}return out;
}
export interface OpenIxParams {
 payer:PublicKey;rentPayer:PublicKey;payee:PublicKey;mint:PublicKey;authorizedSigner:PublicKey;channel:PublicKey;
 salt:bigint;deposit:bigint;gracePeriod:number;openSlot:bigint;recipients?:DistributionEntry[];programId?:PublicKey;tokenProgram?:PublicKey;
}
export function buildOpenInstruction(p:OpenIxParams):TransactionInstruction {
 const programId=p.programId??PAYMENT_CHANNELS_PROGRAM_ID,tokenProgram=p.tokenProgram??TOKEN_PROGRAM_ID;
 if(!tokenProgram.equals(TOKEN_PROGRAM_ID)&&!tokenProgram.equals(TOKEN_2022_PROGRAM_ID))throw new Error("unsupported_token_program");
 const splits=encodeDistributionPreimage(p.recipients??[]);
 const data=Buffer.alloc(1+8+8+4+8+splits.length);let o=0;
 data.writeUInt8(1,o++);data.writeBigUInt64LE(p.salt,o);o+=8;data.writeBigUInt64LE(p.deposit,o);o+=8;data.writeUInt32LE(p.gracePeriod,o);o+=4;data.writeBigUInt64LE(p.openSlot,o);o+=8;splits.copy(data,o);
 const payerAta=getAssociatedTokenAddressSync(p.mint,p.payer,false,tokenProgram),channelAta=getAssociatedTokenAddressSync(p.mint,p.channel,true,tokenProgram);
 return new TransactionInstruction({programId,data,keys:[
 {pubkey:p.payer,isSigner:true,isWritable:true},{pubkey:p.rentPayer,isSigner:true,isWritable:true},
 {pubkey:p.payee,isSigner:false,isWritable:false},{pubkey:p.mint,isSigner:false,isWritable:false},
 {pubkey:p.authorizedSigner,isSigner:false,isWritable:false},{pubkey:p.channel,isSigner:false,isWritable:true},
 {pubkey:payerAta,isSigner:false,isWritable:true},{pubkey:channelAta,isSigner:false,isWritable:true},
 {pubkey:tokenProgram,isSigner:false,isWritable:false},{pubkey:SystemProgram.programId,isSigner:false,isWritable:false},
 {pubkey:SYSVAR_RENT_PUBKEY,isSigner:false,isWritable:false},{pubkey:ASSOCIATED_TOKEN_PROGRAM_ID,isSigner:false,isWritable:false},
 {pubkey:eventAuthorityPda(programId),isSigner:false,isWritable:false},{pubkey:programId,isSigner:false,isWritable:false},
 ]});
}
export function encodeOpenData(a:{salt:bigint;deposit:bigint;gracePeriod:number;openSlot:bigint;recipients:DistributionEntry[]}):Buffer {
 const splits=encodeDistributionPreimage(a.recipients),d=Buffer.alloc(29+splits.length);let o=0;d.writeUInt8(1,o++);d.writeBigUInt64LE(a.salt,o);o+=8;d.writeBigUInt64LE(a.deposit,o);o+=8;d.writeUInt32LE(a.gracePeriod,o);o+=4;d.writeBigUInt64LE(a.openSlot,o);o+=8;splits.copy(d,o);return d;
}
export function buildSettleInstruction(channel:PublicKey,programId:PublicKey=PAYMENT_CHANNELS_PROGRAM_ID):TransactionInstruction {
 return new TransactionInstruction({programId,keys:[{pubkey:channel,isSigner:false,isWritable:true},{pubkey:SYSVAR_INSTRUCTIONS_PUBKEY,isSigner:false,isWritable:false}],data:Buffer.from([2])});
}
export function buildSettleAndSealInstruction(payee:PublicKey,channel:PublicKey,hasVoucher:boolean,programId:PublicKey=PAYMENT_CHANNELS_PROGRAM_ID):TransactionInstruction {
 return new TransactionInstruction({programId,keys:[{pubkey:payee,isSigner:true,isWritable:false},{pubkey:channel,isSigner:false,isWritable:true},{pubkey:SYSVAR_INSTRUCTIONS_PUBKEY,isSigner:false,isWritable:false}],data:Buffer.from([4,hasVoucher?1:0])});
}
export function buildRequestCloseInstruction(payer:PublicKey,channel:PublicKey,programId:PublicKey=PAYMENT_CHANNELS_PROGRAM_ID):TransactionInstruction {
 return new TransactionInstruction({programId,keys:[{pubkey:payer,isSigner:true,isWritable:false},{pubkey:channel,isSigner:false,isWritable:true}],data:Buffer.from([5])});
}
export function buildSealInstruction(channel:PublicKey,programId:PublicKey=PAYMENT_CHANNELS_PROGRAM_ID):TransactionInstruction {
 return new TransactionInstruction({programId,keys:[{pubkey:channel,isSigner:false,isWritable:true}],data:Buffer.from([6])});
}
export interface DistributeIxParams {
 channel:PublicKey;payer:PublicKey;rentPayer:PublicKey;payee:PublicKey;mint:PublicKey;tokenProgram:PublicKey;treasuryOwner:PublicKey;recipients?:DistributionEntry[];programId?:PublicKey;
}
export function buildDistributeInstruction(p:DistributeIxParams):TransactionInstruction {
 const programId=p.programId??PAYMENT_CHANNELS_PROGRAM_ID,entries=p.recipients??[],data=Buffer.concat([Buffer.from([7]),encodeDistributionPreimage(entries)]);
 const ata=(owner:PublicKey)=>getAssociatedTokenAddressSync(p.mint,owner,true,p.tokenProgram);
 const recipientAtas=entries.map(e=>ata(e.recipient));
 return new TransactionInstruction({programId,data,keys:[
 {pubkey:p.channel,isSigner:false,isWritable:true},{pubkey:p.payer,isSigner:false,isWritable:true},{pubkey:p.rentPayer,isSigner:false,isWritable:true},
 {pubkey:ata(p.channel),isSigner:false,isWritable:true},{pubkey:ata(p.payer),isSigner:false,isWritable:true},
 {pubkey:ata(p.payee),isSigner:false,isWritable:true},{pubkey:ata(p.treasuryOwner),isSigner:false,isWritable:true},
 {pubkey:p.mint,isSigner:false,isWritable:false},{pubkey:p.tokenProgram,isSigner:false,isWritable:false},
 {pubkey:eventAuthorityPda(programId),isSigner:false,isWritable:false},{pubkey:programId,isSigner:false,isWritable:false},
 ...recipientAtas.map(pubkey=>({pubkey,isSigner:false,isWritable:true})),
 ]});
}
export function buildReclaimInstruction(channel:PublicKey,rentPayer:PublicKey,programId:PublicKey=PAYMENT_CHANNELS_PROGRAM_ID):TransactionInstruction {
 return new TransactionInstruction({programId,keys:[{pubkey:channel,isSigner:false,isWritable:true},{pubkey:rentPayer,isSigner:false,isWritable:true}],data:Buffer.from([9])});
}
export function buildEd25519VoucherIx(signer:PublicKey,message:Uint8Array,signature:Uint8Array):TransactionInstruction {
 return Ed25519Program.createInstructionWithPublicKey({publicKey:signer.toBytes(),message,signature});
}
