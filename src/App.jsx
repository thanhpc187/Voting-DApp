import React, { useEffect, useMemo, useState } from "react";
import { Trophy, Gamepad2, Zap, Lock } from "lucide-react";
import VOTING_ABI from "./abi.json";
import { CONTRACT_ADDRESS } from "./constants/contract";
import { TARGET_CHAIN_ID, TARGET_NETWORK_NAME } from "./constants/contract";
import { connectWallet, createVotingContract, shortAddress } from "./services/web3";

// Danh sách game mẫu
const GOTY_GAMES = ["Elden Ring", "Dragon's Dogma 2", "Black Myth: Wukong", "Final Fantasy VII", "Helldivers 2"];

export default function App() {
  const [account, setAccount] = useState(null);
  const [contract, setContract] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [wrongNetwork, setWrongNetwork] = useState(false);
  const [contractHasCode, setContractHasCode] = useState(true);
  const [elections, setElections] = useState([]);
  const [selectedElection, setSelectedElection] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDurationSeconds, setNewDurationSeconds] = useState("3600");
  const [newUseWhitelist, setNewUseWhitelist] = useState(false);
  const [newCandidateName, setNewCandidateName] = useState("");
  
  // --- V2 STATE: Phiếu hiện tại của user trong election đang chọn (0 = chưa vote) ---
  const [myVote, setMyVote] = useState(0);
  const [legacyHasVoted, setLegacyHasVoted] = useState(false);
  const [supportsV2, setSupportsV2] = useState(true);
  const [isEligible, setIsEligible] = useState(true);
  const [whitelistInput, setWhitelistInput] = useState("");
  const [loadError, setLoadError] = useState("");

  const [debugLog, setDebugLog] = useState([]);
  const addLog = (msg) => setDebugLog(prev => [msg, ...prev]);

  const sendWithEstimate = async (method) => {
    try {
      const gas = await method.estimateGas({ from: account });
      const gasNum = typeof gas === "bigint" ? Number(gas) : Number(gas);
      return await method.send({ from: account, gas: gasNum });
    } catch (e) {
      return await method.send({ from: account });
    }
  };

  useEffect(() => {
    const init = async () => {
      try {
        const { web3, account: acc, chainId: cid } = await connectWallet();
        setAccount(acc);
        setChainId(cid);
        const isWrong = Number(cid) !== TARGET_CHAIN_ID;
        setWrongNetwork(isWrong);

        // Quick sanity check: make sure CONTRACT_ADDRESS is a contract (has bytecode)
        try {
          const code = await web3.eth.getCode(CONTRACT_ADDRESS);
          setContractHasCode(!!code && code !== "0x");
        } catch (e) {
          setContractHasCode(true);
        }

        const signerContract = createVotingContract(web3, VOTING_ABI, CONTRACT_ADDRESS);
        setContract(signerContract);
        if (!isWrong) loadData(signerContract, acc);

        window.ethereum?.on("accountsChanged", () => window.location.reload());
        window.ethereum?.on("chainChanged", () => window.location.reload());
      } catch (err) {
        addLog(`LỖI INIT: ${err.message}`);
      }
    };
    init();
  }, []);

  const electionStatus = useMemo(() => {
    if (!selectedElection) return null;
    const now = Math.floor(Date.now() / 1000);
    const start = Number(selectedElection.startTime || 0);
    const end = Number(selectedElection.endTime || 0);

    const isDeleted = !!selectedElection.isDeleted;
    const legacyClosed = selectedElection.isOpen === false;
    const isEnded = legacyClosed || (end > 0 ? now >= end : false);
    const isActive = !isDeleted && !isEnded && (start > 0 ? now >= start : true);

    return { now, start, end, isDeleted, isEnded, isActive };
  }, [selectedElection]);

  const actionsDisabled = useMemo(() => {
    if (!account) return true;
    if (!selectedElection) return true;
    if (isDeploying) return true;
    if (wrongNetwork) return true;
    if (electionStatus?.isDeleted) return true;
    if (electionStatus?.isEnded) return true;
    if (!supportsV2 && legacyHasVoted) return true;
    if (selectedElection.useWhitelist && !isEligible) return true;
    return false;
  }, [account, selectedElection, isDeploying, wrongNetwork, electionStatus, supportsV2, legacyHasVoted, isEligible]);

  // Khi chọn sự kiện khác, load lại: voteOf + eligible
  useEffect(() => {
    if (contract && selectedElection && account) {
      const run = async () => {
        try {
          // Prefer V2: voteOf() gives candidateId (0 = none). If not supported, fallback to legacy hasVoted().
          try {
            const vote = await contract.methods.voteOf(selectedElection.id, account).call();
            setSupportsV2(true);
            setLegacyHasVoted(false);
            setMyVote(Number(vote) || 0);
          } catch (e) {
            setSupportsV2(false);
            setMyVote(0);
            const hv = await contract.methods.hasVoted(selectedElection.id, account).call();
            setLegacyHasVoted(!!hv);
          }

          if (selectedElection.useWhitelist) {
            const ok = await contract.methods.isEligible(selectedElection.id, account).call();
            setIsEligible(!!ok);
          } else {
            setIsEligible(true);
          }
        } catch (err) {
          console.error("Lỗi load user status:", err);
        }
      };
      run();
    }
  }, [selectedElection, account, contract]);

  const formatTime = (sec) => {
    const n = Number(sec || 0);
    if (!n) return "-";
    return new Date(n * 1000).toLocaleString();
  };

  const parseVoterList = (raw) => {
    const parts = String(raw || "")
      .split(/[\s,\n\r]+/g)
      .map((s) => s.trim())
      .filter(Boolean);

    // Giữ phong cách đơn giản: filter thô, không over-validate
    return Array.from(new Set(parts));
  };

  const loadData = async (contractInstance, currentAccount) => {
    setLoading(true);
    setLoadError("");
    try {
      const count = await contractInstance.methods.electionsCount().call();
      const arr = [];
      for (let i = 1; i <= Number(count); i++) {
        try {
            let safeMeta;

            // Prefer V2 meta; if ABI/contract mismatch, fallback to legacy elections(electionId)
            try {
              const meta = await contractInstance.methods.getElectionMeta(i).call();
              // VotingPlatform.sol: getElectionMeta(electionId) returns (title, owner, startTime, endTime, isDeleted, useWhitelist, candidatesCount)
              safeMeta = {
                id: i,
                title: meta.title ?? meta[0],
                owner: meta.owner ?? meta[1],
                startTime: Number(meta.startTime ?? meta[2] ?? 0),
                endTime: Number(meta.endTime ?? meta[3] ?? 0),
                isDeleted: !!(meta.isDeleted ?? meta[4] ?? false),
                useWhitelist: !!(meta.useWhitelist ?? meta[5] ?? false),
                candidatesCount: Number(meta.candidatesCount ?? meta[6] ?? 0),
              };
            } catch (e) {
              const legacy = await contractInstance.methods.elections(i).call();
              safeMeta = {
                id: Number(legacy.id ?? legacy[0]),
                title: legacy.title ?? legacy[1],
                owner: legacy.owner ?? legacy[2],
                isOpen: legacy.isOpen ?? legacy[3],
                startTime: 0,
                endTime: 0,
                isDeleted: false,
                useWhitelist: false,
                candidatesCount: Number(legacy.candidatesCount ?? legacy[4] ?? 0),
              };
            }

            const candidates = [];
            if (safeMeta.candidatesCount > 0) {
                for (let j = 1; j <= safeMeta.candidatesCount; j++) {
                    const c = await contractInstance.methods.candidates(i, j).call();
                    candidates.push({ id: Number(c.id), name: c.name, voteCount: Number(c.voteCount) });
                }
            }
            arr.push({ ...safeMeta, candidates });
        } catch (e) { console.error(e); }
      }
      const sorted = arr.reverse();
      setElections(sorted);
      
      // Logic chọn mặc định
      if (!selectedElection && sorted.length > 0) {
          setSelectedElection(sorted[0]);
      } else if (selectedElection) {
          const updated = sorted.find(e => e.id === selectedElection.id);
          if(updated) setSelectedElection(updated);
      }
    } catch (err) { addLog(`LỖI LOAD: ${err.message}`); }
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!newTitle) return;
    const duration = Number(newDurationSeconds);
    if (!duration || duration <= 0) return;
    setIsDeploying(true);
    try {
      // V2 signature
      const m = contract.methods.createElection(newTitle, duration, !!newUseWhitelist);
      await sendWithEstimate(m);
      setNewTitle("");
      setNewDurationSeconds("3600");
      setNewUseWhitelist(false);
      setShowCreateModal(false);
      await loadData(contract, account);
    } catch (err) { addLog(`LỖI TẠO: ${err.message}`); }
    setIsDeploying(false);
  };

  const handleAddCandidate = async () => {
    if (!newCandidateName) return;
    setIsDeploying(true);
    try {
      const m = contract.methods.addCandidate(selectedElection.id, newCandidateName);
      await sendWithEstimate(m);
      setNewCandidateName("");
      await loadData(contract, account);
    } catch (err) { addLog(`LỖI THÊM: ${err.message}`); }
    setIsDeploying(false);
  };

  const handleAutoFill = async () => {
    if (!selectedElection) return;
    if (!window.confirm(`Xác nhận thêm ${GOTY_GAMES.length} game? (Sẽ tốn 5 giao dịch)`)) return;
    setIsDeploying(true);
    try {
        for (const game of GOTY_GAMES) {
            const m = contract.methods.addCandidate(selectedElection.id, game);
            await sendWithEstimate(m);
        }
        await loadData(contract, account);
    } catch (err) { addLog(`LỖI AUTO: ${err.message}`); }
    setIsDeploying(false);
  };

  const handleVote = async (candId) => {
    setIsDeploying(true);
    try {
      const m = contract.methods.vote(selectedElection.id, candId);
      await sendWithEstimate(m);
      addLog("Vote thành công!");
      await loadData(contract, account);
      // Reload xong sẽ tự sync lại myVote từ useEffect
    } catch (err) { addLog(`LỖI VOTE: ${err.message}`); }
    setIsDeploying(false);
  };

  const handleRevokeVote = async () => {
    setIsDeploying(true);
    try {
      const m = contract.methods.revokeVote(selectedElection.id);
      await sendWithEstimate(m);
      addLog("Revoke vote thành công!");
      await loadData(contract, account);
    } catch (err) {
      addLog(`LỖI REVOKE: ${err.message}`);
    }
    setIsDeploying(false);
  };

  const handleRegisterVoters = async () => {
    const voters = parseVoterList(whitelistInput);
    if (voters.length === 0) return;

    setIsDeploying(true);
    try {
      const m = contract.methods.registerVoters(selectedElection.id, voters);
      await sendWithEstimate(m);
      addLog(`Whitelist thành công: +${voters.length} voters`);
      setWhitelistInput("");
      await loadData(contract, account);
    } catch (err) {
      addLog(`LỖI WHITELIST: ${err.message}`);
    }
    setIsDeploying(false);
  };

  return (
    <div className="min-h-screen bg-[#020617] text-white font-sans selection:bg-purple-500 selection:text-white flex flex-col relative">
      
      <header className="sticky top-0 z-50 border-b border-white/5 bg-[#020617]/80 backdrop-blur-xl">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setSelectedElection(null)}>
            <div className="w-8 h-8 bg-gradient-to-tr from-yellow-400 to-orange-500 rounded-lg flex items-center justify-center">
              <Trophy className="w-4 h-4 text-black stroke-[3]" />
            </div>
            <span className="text-lg font-bold">VOTE<span className="text-yellow-500">CHAIN</span></span>
          </div>
          <div className="flex items-center gap-3">
             <button
               onClick={() => setShowCreateModal(true)}
               disabled={!account || wrongNetwork || isDeploying || !contractHasCode}
               className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm font-medium hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
             >
               + New Event
             </button>
             <div className="px-3 py-2 bg-[#0f172a] border border-white/5 rounded-lg text-xs font-mono text-white/60">
                {account ? shortAddress(account) : "No Wallet"}
             </div>
          </div>
        </div>
      </header>

      {!contractHasCode && (
        <div className="container mx-auto px-4 mt-4">
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-200">
            <div className="font-bold">Invalid CONTRACT_ADDRESS</div>
            <div className="text-sm text-red-200/80">
              Address has no contract bytecode on this network. Check `src/constants/contract.js` and make sure you are on Sepolia.
            </div>
            <div className="text-xs text-red-200/60 font-mono mt-2">
              Contract: {CONTRACT_ADDRESS}
            </div>
          </div>
        </div>
      )}

      {wrongNetwork && (
        <div className="container mx-auto px-4 mt-4">
          <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-yellow-200 flex items-center justify-between gap-4">
            <div>
              <div className="font-bold">Please switch MetaMask to {TARGET_NETWORK_NAME}</div>
              <div className="text-sm text-yellow-200/80">
                Current chainId: {chainId ?? "unknown"} • Required: {TARGET_CHAIN_ID}
              </div>
            </div>
            <div className="text-xs text-yellow-200/60 font-mono">
              Contract: {shortAddress(CONTRACT_ADDRESS)}
            </div>
          </div>
        </div>
      )}

      <div className="container mx-auto px-4 py-6 flex-1 flex flex-col lg:flex-row gap-8 pb-40">
        <aside className="w-full lg:w-72 flex-shrink-0 space-y-4">
          <div className="text-xs font-bold text-white/40 uppercase tracking-widest">Active Events</div>
          {loading && elections.length === 0 && (
            <div className="text-sm text-white/40 bg-white/5 border border-white/10 rounded-lg p-3">
              Loading events...
            </div>
          )}
          {!loading && elections.length === 0 && !wrongNetwork && (
            <div className="text-sm text-white/40 bg-white/5 border border-white/10 rounded-lg p-3">
              No events found. If you had events before, it may be a contract/ABI mismatch or you switched networks.
            </div>
          )}
          {elections.map((e) => (
            <button key={e.id} onClick={() => setSelectedElection(e)}
              className={`w-full text-left p-3 rounded-lg border transition-all ${selectedElection?.id === e.id ? "bg-purple-500/10 border-purple-500/50 text-white" : "bg-[#0f172a] border-white/5 text-white/70"}`}>
               <span className="text-xs bg-white/10 px-1 rounded mr-2">#{e.id}</span>
               <span className="font-semibold text-sm">{e.title}</span>
            </button>
          ))}
        </aside>

        <main className="flex-1 bg-[#0f172a]/50 border border-white/5 rounded-2xl p-6 min-h-[500px]">
            {selectedElection ? (
                <div className="animate-in fade-in">
                    <div className="mb-6 border-b border-white/5 pb-4 flex flex-col md:flex-row justify-between items-start gap-4">
                        <div>
                            <h1 className="text-3xl font-black uppercase mb-2">{selectedElection.title}</h1>

                            <div className="flex flex-wrap items-center gap-2">
                              <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/5 border border-white/10 rounded-full text-white/60 text-sm">
                                <span className="text-white/40">Start:</span> {formatTime(selectedElection.startTime)}
                              </div>
                              <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/5 border border-white/10 rounded-full text-white/60 text-sm">
                                <span className="text-white/40">End:</span> {formatTime(selectedElection.endTime)}
                              </div>
                              <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/5 border border-white/10 rounded-full text-white/60 text-sm">
                                <span className="text-white/40">Whitelist:</span> {selectedElection.useWhitelist ? "On" : "Off"}
                              </div>
                              <div className={`inline-flex items-center gap-2 px-3 py-1 border rounded-full text-sm font-bold ${
                                electionStatus?.isDeleted
                                  ? "bg-red-500/10 border-red-500/30 text-red-400"
                                  : electionStatus?.isEnded
                                    ? "bg-white/5 border-white/10 text-white/40"
                                    : "bg-green-500/10 border-green-500/30 text-green-400"
                              }`}>
                                {electionStatus?.isDeleted ? "Deleted" : electionStatus?.isEnded ? "Ended" : "Active"}
                              </div>

                              {!supportsV2 && (
                                <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/5 border border-white/10 rounded-full text-white/50 text-sm">
                                  Contract mode: Legacy
                                </div>
                              )}
                            </div>

                            {selectedElection.useWhitelist && !isEligible && (
                              <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 bg-yellow-500/10 border border-yellow-500/30 rounded-full text-yellow-300 text-sm font-bold">
                                Not whitelisted
                              </div>
                            )}

                            {!supportsV2 && legacyHasVoted && (
                              <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 bg-green-500/10 border border-green-500/30 rounded-full text-green-400 text-sm font-bold">
                                You have voted in this event
                              </div>
                            )}
                        </div>

                         {account && selectedElection.owner.toLowerCase() === account.toLowerCase() && (
                            <div className="flex flex-col items-end gap-2">
                                <div className="flex gap-2">
                                    <input value={newCandidateName} onChange={(e) => setNewCandidateName(e.target.value)} placeholder="Add Candidate..." className="bg-black/40 border border-white/5 rounded px-3 py-1 text-sm text-white"/>
                                    <button onClick={handleAddCandidate} disabled={isDeploying || electionStatus?.isEnded || electionStatus?.isDeleted} className="bg-white text-black px-3 py-1 rounded text-sm font-bold hover:bg-purple-400">{isDeploying ? "..." : "ADD"}</button>
                                </div>
                                {selectedElection.candidates.length === 0 && (
                                    <button onClick={handleAutoFill} disabled={isDeploying || electionStatus?.isEnded || electionStatus?.isDeleted} className="text-xs text-yellow-500 flex items-center gap-1 hover:underline"><Zap className="w-3 h-3"/> Auto Add Games</button>
                                )}

                                {selectedElection.useWhitelist && (
                                  <div className="mt-2 w-full max-w-md">
                                    <textarea
                                      value={whitelistInput}
                                      onChange={(e) => setWhitelistInput(e.target.value)}
                                      placeholder="Whitelist addresses (comma / newline separated)"
                                      className="w-full min-h-[80px] bg-black/40 border border-white/5 rounded px-3 py-2 text-sm text-white"
                                    />
                                    <div className="flex justify-end mt-2">
                                      <button
                                        onClick={handleRegisterVoters}
                                        disabled={isDeploying || electionStatus?.isEnded || electionStatus?.isDeleted}
                                        className="px-4 py-2 bg-white/10 border border-white/10 rounded-lg text-sm font-bold hover:bg-white/15"
                                      >
                                        Add to whitelist
                                      </button>
                                    </div>
                                  </div>
                                )}
                            </div>
                        )}
                    </div>

                    {myVote !== 0 && (
                      <div className="mb-4 flex justify-end">
                        <button
                          onClick={handleRevokeVote}
                          disabled={actionsDisabled}
                          className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm font-bold hover:bg-white/10"
                        >
                          Revoke vote
                        </button>
                      </div>
                    )}

                    <div className="grid gap-3">
                        {selectedElection.candidates.map((c, idx) => {
                             const totalVotes = selectedElection.candidates.reduce((sum, item) => sum + Number(item.voteCount), 0);
                             const percent = totalVotes === 0 ? 0 : Math.round((Number(c.voteCount) / totalVotes) * 100);
                             
                             const isMyVote = myVote === Number(c.id);
                             const voteLabel = isMyVote ? "Voted" : myVote === 0 ? "VOTE" : "CHANGE VOTE";

                             return (
                                <div key={idx} className={`relative p-4 rounded-xl border flex justify-between items-center transition-all overflow-hidden ${actionsDisabled ? "bg-[#0f172a] border-white/5 opacity-75" : "bg-[#020617] border-white/5 hover:border-purple-500/50 group"}`}>
                                    <div className="z-10 flex-1">
                                        <div className="flex items-end gap-2 mb-1">
                                            <div className={`font-bold text-lg ${!actionsDisabled && "group-hover:text-yellow-400"}`}>{c.name}</div>
                                            {isMyVote && <div className="text-xs text-yellow-400 font-bold">(Your vote)</div>}
                                        </div>
                                        <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden max-w-md">
                                            <div className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 transition-all duration-500" style={{ width: `${percent}%` }}></div>
                                        </div>
                                    </div>
                                    
                                    <div className="z-10 flex items-center gap-4">
                                        <div className="text-right">
                                            <div className="text-xl font-bold">{Number(c.voteCount)}</div>
                                            <div className="text-xs text-white/40">votes</div>
                                        </div>
                                        
                                        {/* --- NÚT VOTE THÔNG MINH --- */}
                                        {isMyVote ? (
                                            <button disabled className="px-4 py-2 bg-white/5 border border-white/5 rounded-lg font-bold text-white/20 cursor-not-allowed flex items-center gap-2">
                                                <Lock className="w-4 h-4"/> Voted
                                            </button>
                                        ) : (
                                            <button 
                                                onClick={() => handleVote(c.id)} 
                                                disabled={actionsDisabled} 
                                                className="px-6 py-2 bg-white/10 border border-white/10 rounded-lg font-bold hover:bg-purple-600 hover:text-white hover:border-purple-500 transition-all"
                                            >
                                                {voteLabel}
                                            </button>
                                        )}
                                    </div>
                                </div>
                             )
                        })}
                    </div>
                </div>
            ) : (
                <div className="h-full flex flex-col items-center justify-center text-white/30">
                    <Gamepad2 className="w-12 h-12 mb-4 opacity-50"/>
                    <p>Chọn một sự kiện để xem.</p>
                </div>
            )}
        </main>
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4">
            <div className="bg-[#0f172a] border border-white/10 p-6 rounded-2xl w-full max-w-md">
                <h3 className="font-bold mb-4">Create Event</h3>
                <input autoFocus value={newTitle} onChange={e => setNewTitle(e.target.value)} className="w-full bg-black/50 border border-white/10 rounded p-3 mb-4 text-white" placeholder="Title..."/>
                <div className="grid grid-cols-1 gap-3 mb-4">
                  <input
                    value={newDurationSeconds}
                    onChange={(e) => setNewDurationSeconds(e.target.value)}
                    className="w-full bg-black/50 border border-white/10 rounded p-3 text-white"
                    placeholder="Duration (seconds)"
                    inputMode="numeric"
                  />
                  <label className="flex items-center gap-2 text-sm text-white/70">
                    <input
                      type="checkbox"
                      checked={newUseWhitelist}
                      onChange={(e) => setNewUseWhitelist(e.target.checked)}
                    />
                    Enable whitelist
                  </label>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setShowCreateModal(false)} className="flex-1 py-2 bg-white/10 rounded">Cancel</button>
                    <button onClick={handleCreate} className="flex-1 py-2 bg-purple-600 rounded text-white font-bold">Create</button>
                </div>
            </div>
        </div>
      )}

      {/* DEBUG LOG */}
      <div className="fixed bottom-0 left-0 right-0 bg-black/90 border-t border-red-500/30 p-2 h-32 overflow-y-auto font-mono text-xs z-[100] hidden">
        {debugLog.map((log, i) => <div key={i} className="text-white/50 border-b border-white/5">{log}</div>)}
      </div>
    </div>
  );
}