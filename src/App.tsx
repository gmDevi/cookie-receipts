import { useCallback, useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { EXPLORER, RPC_URL, buildMemoTx, canonical, chainStatus, ensureNightlyOnCookieChain, listNotarizations, memoText, sha256Hex, type Notarization, type ReceiptFields } from "./cookie";

type TxState = { phase: "idle" } | { phase: "signing" } | { phase: "sent"; sig: string } | { phase: "confirmed"; sig: string } | { phase: "error"; message: string };

const EMPTY: ReceiptFields = { merchant: "", date: new Date().toISOString().slice(0, 10), currency: "EUR", amount: "", reference: "" };

export default function App() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, signTransaction, connected } = useWallet();
  const [fields, setFields] = useState<ReceiptFields>(EMPTY);
  const [hash, setHash] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const [tx, setTx] = useState<TxState>({ phase: "idle" });
  const [balance, setBalance] = useState<number | null>(null);
  const [items, setItems] = useState<Notarization[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [status, setStatus] = useState<{ slot: number; version: string; blockHeight: number } | null>(null);
  const [verify, setVerify] = useState<{ hash: string; hit: Notarization | null } | null>(null);
  const [net, setNet] = useState<string>("");

  async function switchNetwork() {
    try {
      const r = await ensureNightlyOnCookieChain();
      setNet(r === "switched" ? "Nightly asked to switch to Cookie Chain; confirm in the popup." : r === "already" ? "Nightly is on Cookie Chain." : "This wallet has no network switch; set the RPC to " + RPC_URL + " in its settings.");
    } catch (e: any) { setNet("switch failed: " + (e?.message ?? String(e))); }
  }

  // Hash follows the fields (or the uploaded file) so the user always sees what will be written.
  useEffect(() => {
    let alive = true;
    if (fileName) return; // file hash is set by the upload handler
    if (!fields.merchant || !fields.amount) { setHash(""); return; }
    sha256Hex(canonical(fields)).then((h) => alive && setHash(h));
    return () => { alive = false; };
  }, [fields, fileName]);

  const refresh = useCallback(async () => {
    if (!publicKey) { setItems([]); setBalance(null); return; }
    setLoadingList(true);
    try {
      const [lamports, list] = await Promise.all([connection.getBalance(publicKey, "confirmed"), listNotarizations(publicKey, 50)]);
      setBalance(lamports / LAMPORTS_PER_SOL);
      setItems(list);
    } catch (e: any) {
      setTx({ phase: "error", message: "read failed: " + (e?.message ?? String(e)) });
    } finally { setLoadingList(false); }
  }, [connection, publicKey]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { chainStatus().then(setStatus).catch(() => setStatus(null)); const t = setInterval(() => chainStatus().then(setStatus).catch(() => {}), 15000); return () => clearInterval(t); }, []);

  async function onFile(ev: React.ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0];
    if (!f) { setFileName(""); return; }
    setFileName(f.name);
    setHash(await sha256Hex(await f.arrayBuffer()));
  }

  async function notarize() {
    if (!publicKey || !hash) return;
    setTx({ phase: "signing" });
    try {
      const text = memoText(hash, fileName ? undefined : fields);
      const t = await buildMemoTx(publicKey, text);
      // Sign in the wallet, submit through the Cookie Chain RPC ourselves: a wallet whose own RPC points at Solana
      // mainnet would otherwise send the transaction to the wrong chain. Fall back to sendTransaction if the wallet
      // cannot sign-only.
      let sig: string;
      if (signTransaction) {
        const signed = await signTransaction(t);
        sig = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false, preflightCommitment: "confirmed" });
      } else {
        sig = await sendTransaction(t, connection);
      }
      setTx({ phase: "sent", sig });
      await connection.confirmTransaction({ signature: sig, blockhash: t.recentBlockhash!, lastValidBlockHeight: t.lastValidBlockHeight! }, "confirmed");
      setTx({ phase: "confirmed", sig });
      await refresh();
    } catch (e: any) {
      setTx({ phase: "error", message: e?.message ?? String(e) });
    }
  }

  async function runVerify() {
    const h = hash;
    if (!h) return;
    const hit = items.find((n) => n.hash === h) ?? null;
    setVerify({ hash: h, hit });
  }

  const set = (k: keyof ReceiptFields) => (e: React.ChangeEvent<HTMLInputElement>) => { setFileName(""); setFields({ ...fields, [k]: e.target.value }); };

  return (
    <div className="wrap">
      <header>
        <div>
          <h1>Cookie Receipts</h1>
          <p className="sub">Notarize a receipt on Cookie Chain: the SHA-256 of the receipt goes on-chain in a memo, the receipt stays with you. Verify any receipt later against the chain.</p>
        </div>
        <WalletMultiButton />
      </header>

      <section className="grid">
        <div className="card">
          <h2>1. Receipt</h2>
          <label>Merchant <input value={fields.merchant} onChange={set("merchant")} placeholder="Trenitalia" /></label>
          <label>Date <input type="date" value={fields.date} onChange={set("date")} /></label>
          <div className="row">
            <label>Currency <input value={fields.currency} onChange={set("currency")} maxLength={5} /></label>
            <label>Amount <input value={fields.amount} onChange={set("amount")} placeholder="29.90" inputMode="decimal" /></label>
          </div>
          <label>Reference <input value={fields.reference} onChange={set("reference")} placeholder="order / invoice id (optional)" /></label>
          <div className="or">or hash a file instead (PDF, image, CSV row export): <input type="file" onChange={onFile} /></div>
          <div className="hash">
            <span>SHA-256</span>
            <code>{hash || "fill the fields or choose a file"}</code>
            {fileName && <small>file: {fileName}</small>}
            {!fileName && hash && <small>canonical text: <code>{canonical(fields)}</code></small>}
          </div>
        </div>

        <div className="card">
          <h2>2. Notarize on Cookie Chain</h2>
          <p>Wallet: {publicKey ? <code>{publicKey.toBase58()}</code> : <em>not connected (Nightly is detected automatically)</em>}</p>
          <p>Balance: {balance === null ? "–" : `${balance.toFixed(4)} COOK`}</p>
          <p><button className="ghost" onClick={switchNetwork} disabled={!connected}>Point Nightly at Cookie Chain</button> {net && <small> {net}</small>}</p>
          <button disabled={!connected || !hash || tx.phase === "signing" || tx.phase === "sent"} onClick={notarize}>
            {tx.phase === "signing" ? "waiting for signature…" : tx.phase === "sent" ? "confirming…" : "Write memo transaction"}
          </button>
          <div className={"status " + tx.phase}>
            {tx.phase === "idle" && "Fee: one memo transaction, a fraction of a cent in COOK."}
            {tx.phase === "signing" && "Approve the transaction in your wallet."}
            {tx.phase === "sent" && <>Sent <a href={`${EXPLORER}/tx/${tx.sig}`} target="_blank" rel="noreferrer">{tx.sig.slice(0, 16)}…</a>, waiting for confirmation.</>}
            {tx.phase === "confirmed" && <>Confirmed: <a href={`${EXPLORER}/tx/${tx.sig}`} target="_blank" rel="noreferrer">{tx.sig.slice(0, 16)}…</a></>}
            {tx.phase === "error" && <>Error: {tx.message}</>}
          </div>
        </div>

        <div className="card">
          <h2>3. Verify</h2>
          <p>Enter the receipt (or choose the file) in step 1, then check whether this wallet already notarized it.</p>
          <button disabled={!hash || !connected} onClick={runVerify}>Verify against my notarizations</button>
          {verify && (verify.hit
            ? <div className="status confirmed">Match: notarized in <a href={`${EXPLORER}/tx/${verify.hit.signature}`} target="_blank" rel="noreferrer">{verify.hit.signature.slice(0, 16)}…</a> {verify.hit.time ? "at " + new Date(verify.hit.time * 1000).toISOString() : ""}</div>
            : <div className="status error">No notarization with hash {verify.hash.slice(0, 12)}… in the last 50 transactions of this wallet.</div>)}
        </div>
      </section>

      <section className="card">
        <div className="between">
          <h2>My notarizations</h2>
          <button className="ghost" onClick={refresh} disabled={!connected || loadingList}>{loadingList ? "loading…" : "refresh"}</button>
        </div>
        {items.length === 0 ? <p><em>{connected ? "none found in the last 50 transactions" : "connect a wallet"}</em></p> : (
          <div className="tablewrap"><table>
            <thead><tr><th>when</th><th>label</th><th>hash</th><th>transaction</th></tr></thead>
            <tbody>{items.map((n) => (
              <tr key={n.signature}>
                <td>{n.time ? new Date(n.time * 1000).toISOString().replace("T", " ").slice(0, 16) : `slot ${n.slot}`}</td>
                <td>{n.label}</td>
                <td><code>{n.hash.slice(0, 16)}…</code></td>
                <td><a href={`${EXPLORER}/tx/${n.signature}`} target="_blank" rel="noreferrer">{n.signature.slice(0, 12)}…</a></td>
              </tr>))}
            </tbody>
          </table></div>
        )}
      </section>

      <footer>
        <span>RPC {RPC_URL}</span>
        <span>{status ? `slot ${status.slot} · block ${status.blockHeight} · core ${status.version}` : "chain status unavailable"}</span>
        <span>Memo program <code>MemoSq4g…fcHr</code></span>
        <a href="https://github.com/gmDevi/cookie-receipts" target="_blank" rel="noreferrer">source</a>
      </footer>
    </div>
  );
}
