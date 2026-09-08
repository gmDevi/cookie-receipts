import React, { useMemo } from "react";
import ReactDOM from "react-dom/client";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { Buffer } from "buffer";
import App from "./App";
import { RPC_URL } from "./cookie";
import "@solana/wallet-adapter-react-ui/styles.css";
import "./index.css";

// web3.js expects a global Buffer in the browser
(window as any).Buffer = (window as any).Buffer || Buffer;

function Root() {
  // No adapters listed on purpose: Nightly (and any other Wallet Standard wallet) is auto-detected.
  const wallets = useMemo(() => [], []);
  return (
    <ConnectionProvider endpoint={RPC_URL} config={{ commitment: "confirmed" }}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <App />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
