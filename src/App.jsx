import React, { useEffect, useState } from "react";
import Web3 from "web3";
import { Trophy, Users, Plus, Gamepad2, Loader2, Sparkles, Zap, AlertTriangle, CheckCircle2, Lock } from "lucide-react";

const CONTRACT_ADDRESS = "0x147f323bB4328FE9dD54fA87AbEd11CC024Fa179"; 

// --- ABI CẬP NHẬT (THÊM HÀM hasVoted ĐỂ CHECK TRẠNG THÁI) ---
const VOTING_ABI = [
	{"inputs":[{"internalType":"uint256","name":"_electionId","type":"uint256"},{"internalType":"string","name":"_name","type":"string"}],"name":"addCandidate","outputs":[],"stateMutability":"nonpayable","type":"function"},
	{"inputs":[{"internalType":"string","name":"_title","type":"string"}],"name":"createElection","outputs":[],"stateMutability":"nonpayable","type":"function"},
	{"inputs":[{"internalType":"uint256","name":"_electionId","type":"uint256"},{"internalType":"uint256","name":"_candidateId","type":"uint256"}],"name":"vote","outputs":[],"stateMutability":"nonpayable","type":"function"},
	{"inputs":[],"name":"electionsCount","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
	{"inputs":[{"internalType":"uint256","name":"_id","type":"uint256"}],"name":"getElectionMeta","outputs":[{"components":[{"internalType":"uint256","name":"id","type":"uint256"},{"internalType":"string","name":"title","type":"string"},{"internalType":"address","name":"owner","type":"address"},{"internalType":"bool","name":"isOpen","type":"bool"},{"internalType":"uint256","name":"candidatesCount","type":"uint256"}],"internalType":"struct VotingApp.Election","name":"","type":"tuple"}],"stateMutability":"view","type":"function"},
	{"inputs":[{"internalType":"uint256","name":"","type":"uint256"},{"internalType":"uint256","name":"","type":"uint256"}],"name":"candidates","outputs":[{"internalType":"uint256","name":"id","type":"uint256"},{"internalType":"string","name":"name","type":"string"},{"internalType":"uint256","name":"voteCount","type":"uint256"}],"stateMutability":"view","type":"function"},
    // --- DÒNG MỚI QUAN TRỌNG: Check xem đã vote chưa ---
    {"inputs":[{"internalType":"uint256","name":"","type":"uint256"},{"internalType":"address","name":"","type":"address"}],"name":"hasVoted","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"}
];

// Danh sách game mẫu
const GOTY_GAMES = ["Elden Ring", "Dragon's Dogma 2", "Black Myth: Wukong", "Final Fantasy VII", "Helldivers 2"];

export default function App() {
  const [account, setAccount] = useState(null);
  const [contract, setContract] = useState(null);
  const [elections, setElections] = useState([]);
  const [selectedElection, setSelectedElection] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newCandidateName, setNewCandidateName] = useState("");
  
  // --- STATE MỚI: Người dùng đã vote cho sự kiện đang chọn chưa? ---
  const [userHasVoted, setUserHasVoted] = useState(false);

  const [debugLog, setDebugLog] = useState([]);
  const addLog = (msg) => setDebugLog(prev => [msg, ...prev]);

  useEffect(() => {
    const init = async () => {
      if (window.ethereum) {
        try {
          await window.ethereum.request({ method: "eth_requestAccounts" });
          const w3 = new Web3(window.ethereum);
          const accounts = await w3.eth.getAccounts();
          setAccount(accounts[0]);
          const instance = new w3.eth.Contract(VOTING_ABI, CONTRACT_ADDRESS);
          setContract(instance);
          loadData(instance, accounts[0]); // Truyền account vào để check

          window.ethereum.on("accountsChanged", (accs) => window.location.reload());
        } catch (err) { addLog(`LỖI INIT: ${err.message}`); }
      }
    };
    init();
  }, []);

  // Khi chọn sự kiện khác, check lại xem đã vote sự kiện đó chưa
  useEffect(() => {
    if (contract && selectedElection && account) {
        checkUserStatus(selectedElection.id);
    }
  }, [selectedElection, account]);

  const checkUserStatus = async (electionId) => {
      try {
          const status = await contract.methods.hasVoted(electionId, account).call();
          setUserHasVoted(status);
          if(status) console.log(`User ${account} đã vote cho election ${electionId}`);
      } catch (err) {
          console.error("Lỗi check status:", err);
      }
  }

  const loadData = async (contractInstance, currentAccount) => {
    setLoading(true);
    const acc = currentAccount || account;
    try {
      const count = await contractInstance.methods.electionsCount().call();
      const arr = [];
      for (let i = 1; i <= Number(count); i++) {
        try {
            const meta = await contractInstance.methods.getElectionMeta(i).call();
            const safeMeta = {
                id: Number(meta.id),
                title: meta.title,
                owner: meta.owner,
                candidatesCount: Number(meta.candidatesCount)
            };
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
    setIsDeploying(true);
    try {
      await contract.methods.createElection(newTitle).send({ from: account });
      setNewTitle("");
      setShowCreateModal(false);
      await loadData(contract, account);
    } catch (err) { addLog(`LỖI TẠO: ${err.message}`); }
    setIsDeploying(false);
  };

  const handleAddCandidate = async () => {
    if (!newCandidateName) return;
    setIsDeploying(true);
    try {
      await contract.methods.addCandidate(selectedElection.id, newCandidateName).send({ from: account });
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
            await contract.methods.addCandidate(selectedElection.id, game).send({ from: account });
        }
        await loadData(contract, account);
    } catch (err) { addLog(`LỖI AUTO: ${err.message}`); }
    setIsDeploying(false);
  };

  const handleVote = async (candId) => {
    setIsDeploying(true);
    try {
      await contract.methods.vote(selectedElection.id, candId).send({ from: account });
      addLog("Vote thành công!");
      await loadData(contract, account);
      // Cập nhật ngay trạng thái đã vote
      setUserHasVoted(true);
    } catch (err) { addLog(`LỖI VOTE: ${err.message}`); }
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
             <button onClick={() => setShowCreateModal(true)} className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm font-medium hover:bg-white/10">+ New Event</button>
             <div className="px-3 py-2 bg-[#0f172a] border border-white/5 rounded-lg text-xs font-mono text-white/60">
                {account ? `${account.slice(0,6)}...${account.slice(-4)}` : "No Wallet"}
             </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 flex-1 flex flex-col lg:flex-row gap-8 pb-40">
        <aside className="w-full lg:w-72 flex-shrink-0 space-y-4">
          <div className="text-xs font-bold text-white/40 uppercase tracking-widest">Active Events</div>
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
                            {/* --- THÔNG BÁO TRẠNG THÁI ĐÃ VOTE --- */}
                            {userHasVoted ? (
                                <div className="inline-flex items-center gap-2 px-3 py-1 bg-green-500/10 border border-green-500/30 rounded-full text-green-400 text-sm font-bold">
                                    <CheckCircle2 className="w-4 h-4"/>
                                    You have voted in this event
                                </div>
                            ) : (
                                <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/5 border border-white/10 rounded-full text-white/40 text-sm">
                                    <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"></div>
                                    Voting is Open
                                </div>
                            )}
                        </div>

                         {account && selectedElection.owner.toLowerCase() === account.toLowerCase() && (
                            <div className="flex flex-col items-end gap-2">
                                <div className="flex gap-2">
                                    <input value={newCandidateName} onChange={(e) => setNewCandidateName(e.target.value)} placeholder="Add Candidate..." className="bg-black/40 border border-white/5 rounded px-3 py-1 text-sm text-white"/>
                                    <button onClick={handleAddCandidate} disabled={isDeploying} className="bg-white text-black px-3 py-1 rounded text-sm font-bold hover:bg-purple-400">{isDeploying ? "..." : "ADD"}</button>
                                </div>
                                {selectedElection.candidates.length === 0 && (
                                    <button onClick={handleAutoFill} disabled={isDeploying} className="text-xs text-yellow-500 flex items-center gap-1 hover:underline"><Zap className="w-3 h-3"/> Auto Add Games</button>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="grid gap-3">
                        {selectedElection.candidates.map((c, idx) => {
                             const totalVotes = selectedElection.candidates.reduce((sum, item) => sum + Number(item.voteCount), 0);
                             const percent = totalVotes === 0 ? 0 : Math.round((Number(c.voteCount) / totalVotes) * 100);
                             
                             return (
                                <div key={idx} className={`relative p-4 rounded-xl border flex justify-between items-center transition-all overflow-hidden ${userHasVoted ? "bg-[#0f172a] border-white/5 opacity-75" : "bg-[#020617] border-white/5 hover:border-purple-500/50 group"}`}>
                                    <div className="z-10 flex-1">
                                        <div className="flex items-end gap-2 mb-1">
                                            <div className={`font-bold text-lg ${!userHasVoted && "group-hover:text-yellow-400"}`}>{c.name}</div>
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
                                        {userHasVoted ? (
                                            <button disabled className="px-4 py-2 bg-white/5 border border-white/5 rounded-lg font-bold text-white/20 cursor-not-allowed flex items-center gap-2">
                                                <Lock className="w-4 h-4"/> Voted
                                            </button>
                                        ) : (
                                            <button 
                                                onClick={() => handleVote(c.id)} 
                                                disabled={isDeploying} 
                                                className="px-6 py-2 bg-white/10 border border-white/10 rounded-lg font-bold hover:bg-purple-600 hover:text-white hover:border-purple-500 transition-all"
                                            >
                                                VOTE
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