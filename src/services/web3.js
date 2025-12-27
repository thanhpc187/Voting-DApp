import Web3 from "web3";

function parseChainId(chainIdHex) {
  if (!chainIdHex) return null;
  if (typeof chainIdHex === "number") return chainIdHex;
  if (typeof chainIdHex === "string") {
    if (chainIdHex.startsWith("0x")) return Number.parseInt(chainIdHex, 16);
    return Number(chainIdHex);
  }
  return null;
}

export function getEthereum() {
  return window.ethereum;
}

export function hasWalletProvider() {
  return !!getEthereum();
}

export function getWeb3() {
  const eth = getEthereum();
  if (!eth) throw new Error("MetaMask not found (window.ethereum missing)");
  return new Web3(eth);
}

export async function getChainId() {
  const eth = getEthereum();
  if (!eth) return null;
  const chainIdHex = await eth.request({ method: "eth_chainId" });
  return parseChainId(chainIdHex);
}

export async function getConnectedAccount() {
  // Silent check (does NOT trigger MetaMask popup)
  const eth = getEthereum();
  if (!eth) return null;
  const accounts = await eth.request({ method: "eth_accounts" });
  return accounts?.[0] || null;
}

export async function requestConnectWallet() {
  // Explicit connect (WILL trigger MetaMask popup)
  const eth = getEthereum();
  if (!eth) throw new Error("MetaMask not found (window.ethereum missing)");
  const accounts = await eth.request({ method: "eth_requestAccounts" });
  return accounts?.[0] || null;
}

export function createReadOnlyWeb3() {
  // Optional: use Alchemy (or any HTTP RPC) for read-only calls.
  // Set in .env.local: VITE_ALCHEMY_SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/...
  const rpcUrl = import.meta?.env?.VITE_ALCHEMY_SEPOLIA_RPC_URL;
  if (!rpcUrl) return null;
  return new Web3(rpcUrl);
}

export function createVotingContract(web3, abi, address) {
  return new web3.eth.Contract(abi, address);
}

export function shortAddress(addr) {
  if (!addr) return "";
  const s = String(addr);
  if (s.length <= 12) return s;
  return `${s.slice(0, 6)}...${s.slice(-4)}`;
}

export async function switchToSepolia() {
  const eth = getEthereum();
  if (!eth) throw new Error("MetaMask not found (window.ethereum missing)");

  const chainIdHex = "0xaa36a7"; // 11155111

  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainIdHex }],
    });
    return true;
  } catch (err) {
    // 4902 = chain not added
    if (err?.code !== 4902) throw err;
  }

  // Add chain then switch
  await eth.request({
    method: "wallet_addEthereumChain",
    params: [
      {
        chainId: chainIdHex,
        chainName: "Sepolia",
        nativeCurrency: { name: "SepoliaETH", symbol: "ETH", decimals: 18 },
        rpcUrls: ["https://rpc.ankr.com/eth_sepolia"],
        blockExplorerUrls: ["https://sepolia.etherscan.io"],
      },
    ],
  });

  await eth.request({
    method: "wallet_switchEthereumChain",
    params: [{ chainId: chainIdHex }],
  });

  return true;
}


