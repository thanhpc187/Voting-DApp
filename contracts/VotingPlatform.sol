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

    function _requireEligible(uint256 electionId, address voter) internal view {
        if (elections[electionId].useWhitelist) {
            require(isEligible[electionId][voter], "Not whitelisted");
        }
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
            emit VoteCast(electionId, msg.sender, candidateId);
            return;
        }

        // đã vote rồi -> cho đổi phiếu
        require(prev != candidateId, "Already voted this candidate");

        // giảm phiếu ứng viên cũ
        Candidate storage oldC = candidates[electionId][prev];
        require(oldC.voteCount > 0, "Corrupt voteCount");
        oldC.voteCount -= 1;

        // tăng phiếu ứng viên mới
        candidates[electionId][candidateId].voteCount += 1;

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

        voteOf[electionId][msg.sender] = 0;
        emit VoteRevoked(electionId, msg.sender, prev);
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


