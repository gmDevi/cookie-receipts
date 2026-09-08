# Cookie Receipts

A cApp on [Cookie Chain](https://www.cookiechain.wtf) that notarizes receipts: the SHA-256 of a receipt (either
its canonical fields or the raw file) is written on-chain in a memo transaction signed by your wallet; the receipt
itself never leaves your machine. Later, anyone with the receipt can recompute the hash and prove when this wallet
notarized it. Built for expense ledgers: it is the on-chain half of a mailbox-to-ledger workflow, but it works
for any document.

- Wallet connection through the Wallet Standard (Nightly is detected automatically), address and COOK balance shown.
- One transaction per receipt: memo program `MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr`, payload
  `cookie-receipts:v1:<sha256>:<merchant>|<date>|<amount currency>` (label optional; file hashes carry no label).
- Status feedback for every step: signing, sent (with explorer link), confirmed, or the exact error.
- "My notarizations": the wallet's recent transactions filtered for the memo tag, with timestamps and explorer links.
- Verify: recompute a hash and look it up among the wallet's notarizations.
- Chain status footer: slot, block height, core version from the RPC.

No backend, no keys stored, no personal data on chain (the label is merchant, date, amount).

## Run

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # static site in dist/
```

Environment: `VITE_RPC_URL` overrides the RPC (default `https://rpc.cookiescan.io`).

## Deploy

The build is a static site; the live instance is served from GitHub Pages of this repository.

## Addresses

- RPC: `https://rpc.cookiescan.io`
- Explorer: `https://cookiescan.io`
- Memo program: `MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr`

## Roadmap

- Notarize straight from the ledger CSV produced by the Mermail expense-ledger skill (one transaction per row).
- Batch notarization: one memo carrying a Merkle root of many receipts.
- Tip the notary: optional COOK transfer in the same transaction.
