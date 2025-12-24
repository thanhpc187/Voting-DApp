const hre = require("hardhat");

async function main() {
  const accounts = hre.network.config.accounts || [];
  if (!accounts.length) {
    throw new Error(
      "Missing DEPLOYER_PRIVATE_KEY. Set env vars before deploying:\n" +
        '  $env:SEPOLIA_RPC_URL="https://eth-sepolia.g.alchemy.com/v2/<KEY>"\n' +
        '  $env:DEPLOYER_PRIVATE_KEY="0x<YOUR_PRIVATE_KEY>"\n' +
        "Then run: npm run deploy:sepolia"
    );
  }

  const [deployer] = await hre.ethers.getSigners();
  const provider = deployer.provider;
  const net = await provider.getNetwork();
  const rpcUrl = hre.network.config.url || "(unknown rpc url)";
  const bal = await provider.getBalance(deployer.address);

  // Basic sanity check: make sure we're really on Sepolia when using deploy:sepolia
  if (hre.network.name === "sepolia" && net.chainId !== 11155111n) {
    throw new Error(
      `Wrong network: expected Sepolia (11155111) but provider is on chainId=${net.chainId.toString()}\n` +
        `RPC: ${rpcUrl}`
    );
  }

  console.log("Deployer:", deployer.address);
  console.log("Network:", hre.network.name, `(chainId=${net.chainId.toString()})`);
  console.log("RPC:", rpcUrl);
  console.log("Balance (wei):", bal.toString());
  console.log("Balance (ETH):", hre.ethers.formatEther(bal));

  // If balance is tiny, estimate deployment cost and guide user (avoid confusing '0' vs very small).
  if (bal <= 0n) {
    throw new Error(
      "Insufficient funds: deployer balance is 0 SepoliaETH.\n" +
        "Get SepoliaETH from a faucet, then retry deploy."
    );
  }

  const VotingPlatform = await hre.ethers.getContractFactory("VotingPlatform");

  // Quick estimate so user knows if their balance is enough (still simple & readable).
  const deployTx = await VotingPlatform.getDeployTransaction();
  deployTx.from = deployer.address;
  const gasEstimate = await deployer.estimateGas(deployTx);
  const fee = await provider.getFeeData();
  const price = fee.maxFeePerGas ?? fee.gasPrice;
  if (price) {
    const costWei = gasEstimate * price;
    console.log("Estimated deploy gas:", gasEstimate.toString());
    console.log("Estimated gas price (wei):", price.toString());
    console.log("Estimated deploy cost (ETH):", hre.ethers.formatEther(costWei));
    if (bal < costWei) {
      throw new Error(
        `Insufficient funds for deploy. Need ~${hre.ethers.formatEther(costWei)} SepoliaETH, have ${hre.ethers.formatEther(bal)}.\n` +
          "Top up SepoliaETH from a faucet and retry."
      );
    }
  }

  const contract = await VotingPlatform.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("VotingPlatform deployed to:", address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});


