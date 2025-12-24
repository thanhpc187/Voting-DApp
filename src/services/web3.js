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

export async function connectWallet() {
  if (!window.ethereum) throw new Error("MetaMask not found (window.ethereum missing)");

  await window.ethereum.request({ method: "eth_requestAccounts" });
  const web3 = new Web3(window.ethereum);
  const accounts = await web3.eth.getAccounts();
  const account = accounts?.[0] || null;

  const chainIdHex = await window.ethereum.request({ method: "eth_chainId" });
  const chainId = parseChainId(chainIdHex);

  return { web3, account, chainId };
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


