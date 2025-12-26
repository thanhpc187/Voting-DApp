// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract VotingPlatform {
    struct Candidate {
        uint256 id;
        string name;
        uint256 voteCount;
    }


    struct Election {
        uint256 id;
        string title;
        address owner;
        uint256 startTime;
        uint256 endTime;
        bool isDeleted;
        bool useWhitelist;
        uint256 candidatesCount;
    }

    uint256 public electionsCount;
    mapping(uint256 => Election) public elections;

    // electionId => candidateId => Candidate
    mapping(uint256 => mapping(uint256 => Candidate)) public candidates;

    // electionId => voter => candidateId (0 = chưa vote)
    mapping(uint256 => mapping(address => uint256)) public voteOf;

    // electionId => voter => isEligible (chỉ dùng khi useWhitelist = true)
    mapping(uint256 => mapping(address => bool)) public isEligible;

    // --- Whitelist request/approval flow ---
    // electionId => voter => requested?
    mapping(uint256 => mapping(address => bool)) public hasRequestedToJoin;
    // electionId => voter => still pending?
    mapping(uint256 => mapping(address => bool)) public isJoinRequestPending;
    // electionId => list of requesters (used for UI; may contain already-approved users too)
    mapping(uint256 => address[]) private joinRequesters;

    // --- Voter list per candidate (for UI transparency) ---
    // electionId => candidateId => voter addresses
    mapping(uint256 => mapping(uint256 => address[])) private votersByCandidate;
    // electionId => candidateId => voter => index+1 in votersByCandidate (0 means not present)
    mapping(uint256 => mapping(uint256 => mapping(address => uint256))) private voterIndexPlus1;

    event ElectionCreated(
        uint256 indexed electionId,
        address indexed owner,
        string title,
        uint256 startTime,
        uint256 endTime,
        bool useWhitelist
    );

    event ElectionDeleted(uint256 indexed electionId);

    event CandidateAdded(uint256 indexed electionId, uint256 indexed candidateId, string name);

    event JoinRequested(uint256 indexed electionId, address indexed voter);
    event JoinApproved(uint256 indexed electionId, address indexed voter, address indexed owner);

    event VoteCast(uint256 indexed electionId, address indexed voter, uint256 indexed candidateId);
    event VoteChanged(
        uint256 indexed electionId,
        address indexed voter,
        uint256 fromCandidateId,
        uint256 toCandidateId
    );
    event VoteRevoked(uint256 indexed electionId, address indexed voter, uint256 candidateId);

    modifier electionExists(uint256 electionId) {
        require(electionId > 0 && electionId <= electionsCount, "Election not found");
        _;
    }

    modifier onlyElectionOwner(uint256 electionId) {
        require(msg.sender == elections[electionId].owner, "Only election owner");
        _;
    }

    modifier electionActive(uint256 electionId) {
        Election storage e = elections[electionId];
        require(!e.isDeleted, "Election deleted");
        require(block.timestamp < e.endTime, "Election ended");
        _;
    }

    function createElection(
        string calldata title,
        uint256 durationSeconds,
        bool useWhitelist
    ) external returns (uint256 electionId) {
        require(bytes(title).length > 0, "Title required");
        require(durationSeconds > 0, "Duration required");

        electionsCount += 1;
        electionId = electionsCount;

        uint256 start = block.timestamp;
        uint256 end = start + durationSeconds;

        elections[electionId] = Election({
            id: electionId,
            title: title,
            owner: msg.sender,
            startTime: start,
            endTime: end,
            isDeleted: false,
            useWhitelist: useWhitelist,
            candidatesCount: 0
        });

        emit ElectionCreated(electionId, msg.sender, title, start, end, useWhitelist);
    }

    function deleteElection(uint256 electionId)
        external
        electionExists(electionId)
        onlyElectionOwner(electionId)
        electionActive(electionId)
    {
        elections[electionId].isDeleted = true;
        emit ElectionDeleted(electionId);
    }

    function addCandidate(uint256 electionId, string calldata name)
        external
        electionExists(electionId)
        onlyElectionOwner(electionId)
        electionActive(electionId)
    {
        require(bytes(name).length > 0, "Name required");

        Election storage e = elections[electionId];
        e.candidatesCount += 1;

        uint256 cid = e.candidatesCount;
        candidates[electionId][cid] = Candidate({ id: cid, name: name, voteCount: 0 });

        emit CandidateAdded(electionId, cid, name);
    }

    // Whitelist voter (nếu useWhitelist = true)
    function registerVoters(uint256 electionId, address[] calldata voters)
        external
        electionExists(electionId)
        onlyElectionOwner(electionId)
        electionActive(electionId)
    {
        require(voters.length > 0, "Empty list");
        for (uint256 i = 0; i < voters.length; i++) {
            address v = voters[i];
            require(v != address(0), "Zero address");
            isEligible[electionId][v] = true;
        }
    }

    // --- New whitelist flow: user requests to join, owner approves ---
    function requestToJoin(uint256 electionId)
        external
        electionExists(electionId)
        electionActive(electionId)
    {
        require(elections[electionId].useWhitelist, "Whitelist disabled");
        require(!isEligible[electionId][msg.sender], "Already eligible");
        require(!isJoinRequestPending[electionId][msg.sender], "Request already pending");

        isJoinRequestPending[electionId][msg.sender] = true;
        if (!hasRequestedToJoin[electionId][msg.sender]) {
            hasRequestedToJoin[electionId][msg.sender] = true;
            joinRequesters[electionId].push(msg.sender);
        }

        emit JoinRequested(electionId, msg.sender);
    }

    function approveJoinRequest(uint256 electionId, address voter)
        external
        electionExists(electionId)
        onlyElectionOwner(electionId)
        electionActive(electionId)
    {
        require(elections[electionId].useWhitelist, "Whitelist disabled");
        require(voter != address(0), "Zero address");
        require(isJoinRequestPending[electionId][voter], "No pending request");

        isJoinRequestPending[electionId][voter] = false;
        isEligible[electionId][voter] = true;

        emit JoinApproved(electionId, voter, msg.sender);
    }

    function getJoinRequests(uint256 electionId)
        external
        view
        electionExists(electionId)
        returns (address[] memory requesters)
    {
        return joinRequesters[electionId];
    }

    function _requireEligible(uint256 electionId, address voter) internal view {
        if (elections[electionId].useWhitelist) {
            require(isEligible[electionId][voter], "Not whitelisted");
        }
    }

    function _addVoterToCandidate(uint256 electionId, uint256 candidateId, address voter) internal {
        if (voterIndexPlus1[electionId][candidateId][voter] != 0) return;
        votersByCandidate[electionId][candidateId].push(voter);
        voterIndexPlus1[electionId][candidateId][voter] = votersByCandidate[electionId][candidateId].length; // index+1
    }

    function _removeVoterFromCandidate(uint256 electionId, uint256 candidateId, address voter) internal {
        uint256 idxPlus1 = voterIndexPlus1[electionId][candidateId][voter];
        if (idxPlus1 == 0) return;
        uint256 idx = idxPlus1 - 1;

        address[] storage arr = votersByCandidate[electionId][candidateId];
        uint256 lastIdx = arr.length - 1;

        if (idx != lastIdx) {
            address lastVoter = arr[lastIdx];
            arr[idx] = lastVoter;
            voterIndexPlus1[electionId][candidateId][lastVoter] = idx + 1;
        }

        arr.pop();
        voterIndexPlus1[electionId][candidateId][voter] = 0;
    }

    // vote() trong V2 vừa là "vote lần đầu" vừa là "doi phieu"
    function vote(uint256 electionId, uint256 candidateId)
        external
        electionExists(electionId)
        electionActive(electionId)
    {
        _requireEligible(electionId, msg.sender);

        Election storage e = elections[electionId];
        require(candidateId > 0 && candidateId <= e.candidatesCount, "Invalid candidate");

        uint256 prev = voteOf[electionId][msg.sender];

        if (prev == 0) {
            // vote lần đầu
            voteOf[electionId][msg.sender] = candidateId;
            candidates[electionId][candidateId].voteCount += 1;
            _addVoterToCandidate(electionId, candidateId, msg.sender);
            emit VoteCast(electionId, msg.sender, candidateId);
            return;
        }

        // đã vote rồi -> cho đổi phiếu
        require(prev != candidateId, "Already voted this candidate");

        // giảm phiếu ứng viên cũ
        Candidate storage oldC = candidates[electionId][prev];
        require(oldC.voteCount > 0, "Corrupt voteCount");
        oldC.voteCount -= 1;
        _removeVoterFromCandidate(electionId, prev, msg.sender);

        // tăng phiếu ứng viên mới
        candidates[electionId][candidateId].voteCount += 1;
        _addVoterToCandidate(electionId, candidateId, msg.sender);

        voteOf[electionId][msg.sender] = candidateId;
        emit VoteChanged(electionId, msg.sender, prev, candidateId);
    }

    function revokeVote(uint256 electionId)
        external
        electionExists(electionId)
        electionActive(electionId)
    {
        _requireEligible(electionId, msg.sender);

        uint256 prev = voteOf[electionId][msg.sender];
        require(prev != 0, "No vote to revoke");

        Candidate storage c = candidates[electionId][prev];
        require(c.voteCount > 0, "Corrupt voteCount");
        c.voteCount -= 1;
        _removeVoterFromCandidate(electionId, prev, msg.sender);

        voteOf[electionId][msg.sender] = 0;
        emit VoteRevoked(electionId, msg.sender, prev);
    }

    function getVotersForCandidate(uint256 electionId, uint256 candidateId)
        external
        view
        electionExists(electionId)
        returns (address[] memory voters)
    {
        require(candidateId > 0 && candidateId <= elections[electionId].candidatesCount, "Invalid candidate");
        return votersByCandidate[electionId][candidateId];
    }

    function getElectionMeta(uint256 electionId)
        external
        view
        electionExists(electionId)
        returns (
            string memory title,
            address owner,
            uint256 startTime,
            uint256 endTime,
            bool isDeleted,
            bool useWhitelist,
            uint256 candidatesCount
        )
    {
        Election storage e = elections[electionId];
        return (e.title, e.owner, e.startTime, e.endTime, e.isDeleted, e.useWhitelist, e.candidatesCount);
    }

    function getResults(uint256 electionId)
        external
        view
        electionExists(electionId)
        returns (Candidate[] memory results)
    {
        Election storage e = elections[electionId];
        results = new Candidate[](e.candidatesCount);

        for (uint256 i = 0; i < e.candidatesCount; i++) {
            uint256 cid = i + 1;
            Candidate storage c = candidates[electionId][cid];
            results[i] = Candidate({ id: c.id, name: c.name, voteCount: c.voteCount });
        }
    }
}


