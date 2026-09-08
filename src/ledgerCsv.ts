// Drop-in for prize/bounties/cookie/app/src/ledgerCsv.ts: import a ledger.csv written by the mermail-expense-ledger
// skill (columns: email_id, mailbox_id, date, merchant, sender, currency, amount, tax, order_id, payment_hint, ...)
// and turn each row into the ReceiptFields the app already hashes and notarizes. Pure functions, no I/O.
import type { ReceiptFields } from "./cookie";

export interface LedgerRow extends ReceiptFields { emailId: string; }

/** Minimal RFC 4180 parser: quoted fields, doubled quotes, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim().length));
}

/** Rows with an amount become receipts; the order_id is the reference. Returns [] for a file without the expected header. */
export function ledgerToReceipts(text: string): LedgerRow[] {
  const [header, ...body] = parseCsv(text);
  if (!header) return [];
  const idx = (name: string) => header.indexOf(name);
  const need = ["date", "merchant", "currency", "amount"].map(idx);
  if (need.some((i) => i < 0)) return [];
  const [iDate, iMerchant, iCur, iAmt] = need; const iRef = idx("order_id"); const iId = idx("email_id");
  return body
    .filter((r) => (r[iAmt] || "").trim().length)
    .map((r) => ({ emailId: iId >= 0 ? r[iId] : "", merchant: r[iMerchant], date: r[iDate], currency: r[iCur], amount: r[iAmt], reference: iRef >= 0 ? r[iRef] || "" : "" }));
}
