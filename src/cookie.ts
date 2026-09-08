import { Connection, PublicKey, Transaction, TransactionInstruction, type ParsedTransactionWithMeta } from "@solana/web3.js";
import { Buffer } from "buffer";

export const RPC_URL = (import.meta.env.VITE_RPC_URL as string) || "https://rpc.cookiescan.io";
export const EXPLORER = "https://cookiescan.io";
export const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
export const TAG = "cookie-receipts:v1";

export const connection = new Connection(RPC_URL, "confirmed");

export interface ReceiptFields {
  merchant: string;
  date: string;      // YYYY-MM-DD
  currency: string;  // ISO code
  amount: string;    // decimal string
  reference: string; // order / invoice id, may be empty
}

/** Canonical text of a receipt: what gets hashed. Stable field order, trimmed, lower-cased currency code upper-cased. */
export function canonical(f: ReceiptFields): string {
  const amt = Number(f.amount.replace(",", ".")).toFixed(2);
  return [f.merchant.trim(), f.date.trim(), f.currency.trim().toUpperCase(), amt, f.reference.trim()].join("|");
}

export async function sha256Hex(text: string | ArrayBuffer): Promise<string> {
  const data = typeof text === "string" ? new TextEncoder().encode(text) : new Uint8Array(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Memo payload: tag, hash, and a short public label (merchant|date|amount currency). No personal data on chain. */
export function memoText(hash: string, f?: ReceiptFields): string {
  const label = f ? `${f.merchant.trim().slice(0, 24)}|${f.date.trim()}|${Number(f.amount.replace(",", ".")).toFixed(2)} ${f.currency.trim().toUpperCase()}` : "";
  return `${TAG}:${hash}:${label}`;
}

export function memoInstruction(signer: PublicKey, text: string): TransactionInstruction {
  return new TransactionInstruction({
    keys: [{ pubkey: signer, isSigner: true, isWritable: false }],
    programId: MEMO_PROGRAM_ID,
    data: Buffer.from(text, "utf8"),
  });
}

export async function buildMemoTx(signer: PublicKey, text: string): Promise<Transaction> {
  const tx = new Transaction().add(memoInstruction(signer, text));
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = signer;
  return tx;
}

export interface Notarization {
  signature: string;
  slot: number;
  time: number | null;
  hash: string;
  label: string;
}

/** Scan the wallet's recent transactions for our memo tag. Bounded to `limit` signatures. */
export async function listNotarizations(owner: PublicKey, limit = 50): Promise<Notarization[]> {
  const sigs = await connection.getSignaturesForAddress(owner, { limit }, "confirmed");
  const out: Notarization[] = [];
  const found = sigs.filter((s) => (s.memo || "").includes(TAG));
  for (const s of found) {
    const m = (s.memo || "").match(/cookie-receipts:v1:([0-9a-f]{64}):(.*)$/);
    if (m) out.push({ signature: s.signature, slot: s.slot, time: s.blockTime ?? null, hash: m[1], label: m[2].replace(/\]$/, "") });
  }
  if (out.length === 0 && sigs.length > 0) {
    // Some RPCs omit the memo field in signature listings; fall back to parsing the transactions.
    const txs = await connection.getParsedTransactions(sigs.map((s) => s.signature), { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    txs.forEach((t: ParsedTransactionWithMeta | null, i: number) => {
      if (!t) return;
      for (const ix of t.transaction.message.instructions as any[]) {
        const text: string | undefined = typeof ix.parsed === "string" ? ix.parsed : ix.parsed?.info?.memo ?? (ix.program === "spl-memo" ? ix.parsed : undefined);
        const m = typeof text === "string" ? text.match(/cookie-receipts:v1:([0-9a-f]{64}):(.*)$/) : null;
        if (m) out.push({ signature: sigs[i].signature, slot: sigs[i].slot, time: sigs[i].blockTime ?? null, hash: m[1], label: m[2] });
      }
    });
  }
  return out;
}

export async function chainStatus(): Promise<{ slot: number; version: string; blockHeight: number }> {
  const [slot, v, blockHeight] = await Promise.all([connection.getSlot("confirmed"), connection.getVersion(), connection.getBlockHeight("confirmed")]);
  return { slot, version: (v as any)["solana-core"] ?? JSON.stringify(v), blockHeight };
}

/** Nightly exposes a network switch for SVM chains; ask it to point at Cookie Chain (the user confirms in the popup). */
export async function ensureNightlyOnCookieChain(): Promise<"switched" | "already" | "unsupported"> {
  const nightly = (window as any).nightly?.solana;
  if (!nightly || typeof nightly.changeNetwork !== "function") return "unsupported";
  const genesis = await connection.getGenesisHash();
  if (nightly.genesisHash === genesis) return "already";
  await nightly.changeNetwork({ genesisHash: genesis, url: RPC_URL });
  return "switched";
}
