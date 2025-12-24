export async function getElectionsCount(contract) {
  return Number(await contract.methods.electionsCount().call());
}

export async function getElectionMeta(contract, electionId) {
  return await contract.methods.getElectionMeta(electionId).call();
}

export async function getElectionLegacy(contract, electionId) {
  return await contract.methods.elections(electionId).call();
}

export async function getCandidate(contract, electionId, candidateId) {
  return await contract.methods.candidates(electionId, candidateId).call();
}

export async function hasVoted(contract, electionId, account) {
  return await contract.methods.hasVoted(electionId, account).call();
}

async function sendWithEstimate(method, from) {
  // MetaMask đôi khi estimate fail -> hiện gas rất cao. Ta estimate trước để set gas chuẩn.
  try {
    const gas = await method.estimateGas({ from });
    const gasNum = typeof gas === "bigint" ? Number(gas) : Number(gas);
    return await method.send({ from, gas: gasNum });
  } catch (e) {
    // Fallback: still try to send so MetaMask can show the real error / allow manual gas.
    return await method.send({ from });
  }
}

export async function createElectionTx(contract, account, title, durationSeconds, useWhitelist) {
  // Prefer V2 signature. If contract at address is not V2, fallback to V1 signature (title only).
  try {
    const m2 = contract.methods.createElection(title, durationSeconds, useWhitelist);
    return await sendWithEstimate(m2, account);
  } catch (err) {
    // Typical symptom: "gas estimation failed" or revert due to selector missing
    const m1 = contract.methods.createElection(title);
    return await sendWithEstimate(m1, account);
  }
}

export async function addCandidateTx(contract, account, electionId, name) {
  const m = contract.methods.addCandidate(electionId, name);
  return await sendWithEstimate(m, account);
}

export async function voteTx(contract, account, electionId, candidateId) {
  const m = contract.methods.vote(electionId, candidateId);
  return await sendWithEstimate(m, account);
}

// --- V2 placeholders (sẽ bật ở bước nâng cấp) ---
export async function getMyVote(contract, electionId, account) {
  return Number(await contract.methods.voteOf(electionId, account).call());
}

export async function isUserEligible(contract, electionId, account) {
  return await contract.methods.isEligible(electionId, account).call();
}

export async function registerVotersTx(contract, account, electionId, votersArray) {
  const m = contract.methods.registerVoters(electionId, votersArray);
  return await sendWithEstimate(m, account);
}

export async function revokeVoteTx(contract, account, electionId) {
  const m = contract.methods.revokeVote(electionId);
  return await sendWithEstimate(m, account);
}


