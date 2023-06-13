import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "simplebar-react/dist/simplebar.min.css";
import "flatpickr/dist/themes/light.css";
import "react-svg-map/lib/index.css";
import "../src/assets/scss/app.scss";
import { BrowserRouter } from "react-router-dom";
import "react-toastify/dist/ReactToastify.css";
import { Provider } from "react-redux";
import store from "./store";
import "react-toastify/dist/ReactToastify.css";

import '@rainbow-me/rainbowkit/styles.css';

import {
  darkTheme,
  getDefaultWallets,
  lightTheme,
  RainbowKitProvider,
} from '@rainbow-me/rainbowkit';
import { configureChains, createClient, WagmiConfig } from 'wagmi';
import { gnosisChiado, optimismGoerli, polygonZkEvmTestnet } from 'wagmi/chains';
import { alchemyProvider } from 'wagmi/providers/alchemy';
import { publicProvider } from 'wagmi/providers/public';

const hederaTestnet = {
  id: 296,
  name: 'Hedera Testnet',
  network: 'hedera-testnet',
  nativeCurrency: {
    name: 'HBAR',
    symbol: 'HBAR',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://hashgraph.arkhia.io/hedera/testnet/json-rpc/v1/nT1M9788al140405M1A284I1379To1N5"],
    },
    public: {
      http: ["https://hashgraph.arkhia.io/hedera/testnet/json-rpc/v1/nT1M9788al140405M1A284I1379To1N5"],
    }
  },
  blockExplorers: {
    default: {
      name: "BlocksScan",
      url: "https://hashscan.io/testnet/dashboard",
    }
  },
  contracts: {
    // multicall3: {
    //   address: "0xca11bde05977b3631167028862be2a173976ca11",
    //   blockCreated: 49461,
    // },
  },
  testnet: true,
}

const { chains, provider } = configureChains(
  [hederaTestnet],
  [
    // alchemyProvider({ apiKey: process.env.ALCHEMY_ID }),
    publicProvider(),
  ]
);

const { connectors } = getDefaultWallets({
  appName: 'RainbowKit',
  projectId: 'e414f6259908f028552b4de5604d4807',
  chains
});

const wagmiClient = createClient({
  autoConnect: true,
  connectors,
  provider
})

ReactDOM.createRoot(document.getElementById("root")).render(
  <>
    <BrowserRouter>
      <WagmiConfig client={wagmiClient}>
        <RainbowKitProvider chains={chains} theme={lightTheme({
          accentColor: "black",
        })}>
          <Provider store={store}>
            <App />
          </Provider>
        </RainbowKitProvider>
      </WagmiConfig>
    </BrowserRouter>
  </>
);
