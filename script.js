const winningLines = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6]
];

const streakRewards = [50, 75, 100, 150, 250];
const missionTemplates = [
  { id: "play3", title: "Play 3 rounds", target: 3, reward: 80, stat: "rounds" },
  { id: "draw2", title: "Force 2 draws vs AI", target: 2, reward: 120, stat: "draws" },
  { id: "center4", title: "Claim center 4 times", target: 4, reward: 90, stat: "centers" }
];

const cells = [...document.querySelectorAll(".cell")];
const ambientCanvas = document.querySelector("#ambient-canvas");
const statusText = document.querySelector("#status");
const turnDisplay = document.querySelector("#turn-display");
const xScore = document.querySelector("#x-score");
const oScore = document.querySelector("#o-score");
const drawScore = document.querySelector("#draw-score");
const xLabel = document.querySelector("#x-label");
const oLabel = document.querySelector("#o-label");
const nextRoundButton = document.querySelector("#next-round");
const newGameButton = document.querySelector("#new-game");
const modeButtons = [...document.querySelectorAll("[data-mode]")];
const coinCount = document.querySelector("#coin-count");
const xpCount = document.querySelector("#xp-count");
const levelLabel = document.querySelector("#level-label");
const claimLoginButton = document.querySelector("#claim-login");
const streakTrack = document.querySelector("#streak-track");
const missionList = document.querySelector("#mission-list");
const leaderboard = document.querySelector("#leaderboard");
const missionReset = document.querySelector("#mission-reset");
const bossTitle = document.querySelector("#boss-title");
const bossCopy = document.querySelector("#boss-copy");
const bossPressure = document.querySelector("#boss-pressure");
const onlinePanel = document.querySelector("#online-panel");
const onlineOpponentLabel = document.querySelector("#online-opponent");
const matchmakeButton = document.querySelector("#matchmake");
const createRoomButton = document.querySelector("#create-room");
const joinRoomButton = document.querySelector("#join-room");
const roomCode = document.querySelector("#room-code");
const joinCode = document.querySelector("#join-code");
const playerNameInput = document.querySelector("#player-name");
const playerRegionInput = document.querySelector("#player-region");

const playerId = localStorage.getItem("xo-nexus-player-id") || crypto.randomUUID();
localStorage.setItem("xo-nexus-player-id", playerId);

const defaultProgress = {
  coins: 125,
  xp: 0,
  streak: 0,
  lastLoginDate: "",
  lastClaimDate: "",
  dailyDate: "",
  missionStats: { rounds: 0, draws: 0, centers: 0 },
  claimedMissions: [],
  aiRounds: 0,
  aiWins: 0,
  humanAiWins: 0,
  masterDefeated: false,
  headmasterDefeated: false
};

let board = Array(9).fill("");
let currentPlayer = "X";
let mode = "ai";
let roundOver = false;
let scores = { X: 0, O: 0, draw: 0 };
let progress = loadProgress();
const rewardedOnlineRounds = new Set();
let onlineSession = {
  roomId: "",
  ticket: "",
  symbol: "",
  opponent: null,
  connected: false,
  waiting: false,
  roomCode: ""
};
let pollTimer = 0;

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function loadProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem("xo-nexus-progress"));
    return normalizeProgress(saved);
  } catch {
    return normalizeProgress();
  }
}

function normalizeProgress(saved = {}) {
  const merged = {
    ...defaultProgress,
    ...saved,
    missionStats: { ...defaultProgress.missionStats, ...(saved.missionStats || {}) },
    claimedMissions: Array.isArray(saved.claimedMissions) ? saved.claimedMissions : []
  };

  if (merged.dailyDate !== todayKey()) {
    merged.dailyDate = todayKey();
    merged.missionStats = { rounds: 0, draws: 0, centers: 0 };
    merged.claimedMissions = [];
  }

  return merged;
}

function saveProgress() {
  localStorage.setItem("xo-nexus-progress", JSON.stringify(progress));
}

function render() {
  cells.forEach((cell, index) => {
    const value = board[index];
    cell.replaceChildren();
    if (value) {
      const piece = document.createElement("span");
      piece.className = `piece ${value.toLowerCase()}`;
      piece.setAttribute("aria-hidden", "true");
      cell.append(piece);
    }
    cell.classList.toggle("x", value === "X");
    cell.classList.toggle("o", value === "O");
    const onlineNotReady = mode === "online" && !onlineSession.connected;
    const waitingForRemote = mode === "online" && onlineSession.connected && currentPlayer !== onlineSession.symbol;
    const localOpponentTurn = mode === "online" && !onlineSession.connected && currentPlayer === "O";
    cell.disabled = Boolean(value) || roundOver || onlineNotReady || (mode === "ai" && currentPlayer === "O") || waitingForRemote || localOpponentTurn;
    cell.setAttribute("aria-label", `${cellLabel(index)} ${value || "empty"}`);
  });

 if (xScore) xScore.textContent = scores.X;
 if(oScore)oScore.textContent = scores.O;
  if(drawScore)drawScore.textContent = scores.draw;
  if(xLabel)xLabel.textContent = mode === "online" && onlineSession.symbol === "O" ? getOpponentLabel() : ["ai", "online"].includes(mode) ? "You" : "Player X";
  if(oLabel)oLabel.textContent = mode === "online" && onlineSession.symbol === "O" ? "You" : getOpponentLabel();
  if(turnDisplay)turnDisplay.textContent = getTurnText();
  onlinePanel.classList.toggle("active", mode === "online");
  onlineOpponentLabel.textContent = getOnlineStatus();

  renderProgress();
}

function renderProgress() {
  if(coinCount)coinCount.textContent = progress.coins;
  if(xpCount)xpCount.textContent = progress.xp;
  if(levelLable)levelLabel.textContent = `${getLevel(progress.xp)}/100`;
  if(missionReset)missionReset.textContent = `Resets ${todayKey()}`;
  if(bossPressure)bossPressure.textContent = `${Math.min(progress.aiRounds, 100)}/100`;

  if (progress.headmasterDefeated) {
    bossTitle.textContent = "Headmaster cleared";
    bossCopy.textContent = "You broke the final grid boss. Keep climbing the level 100 ladder.";
  } else if (progress.masterDefeated) {
    bossTitle.textContent = "Beat AI Headmaster";
    bossCopy.textContent = "The Headmaster plays tighter. Win once for another 1000 XP boss reward.";
  } else {
    bossTitle.textContent = "Beat AI Master";
    bossCopy.textContent = "Win against the AI and claim 1000 XP. At 100 pressure, the Master must reveal a crack.";
  }

  claimLoginButton.disabled = progress.lastClaimDate === todayKey();
  claimLoginButton.textContent = claimLoginButton.disabled ? "Claimed" : "Claim";

  streakTrack.replaceChildren();
  streakRewards.forEach((reward, index) => {
    const day = document.createElement("div");
    day.className = `day-reward ${index < progress.streak ? "claimed" : ""}`;
    day.innerHTML = `<span>Day ${index + 1}</span><strong>+${reward}</strong>`;
    streakTrack.append(day);
  });

  missionList.replaceChildren();
  missionTemplates.forEach((mission) => {
    const value = Math.min(progress.missionStats[mission.stat], mission.target);
    const claimed = progress.claimedMissions.includes(mission.id);
    const complete = value >= mission.target;
    const item = document.createElement("div");
    item.className = `mission ${claimed ? "done" : ""}`;
    item.innerHTML = `
      <div class="mission-top">
        <div>${mission.title}<span>Reward +${mission.reward} coins</span></div>
        <strong>${claimed ? "Done" : `${value}/${mission.target}`}</strong>
      </div>
      <div class="progress-bar"><i style="width: ${(value / mission.target) * 100}%"></i></div>
    `;
    if (complete && !claimed) {
      item.addEventListener("click", () => claimMission(mission));
      item.title = "Click to claim";
    }
    missionList.append(item);
  });

  renderLeaderboard();
}

function getLevel(xp) {
  return Math.min(100, Math.floor(xp / 1000) + 1);
}

function getRank(xp) {
  const level = getLevel(xp);
  if (level >= 80) return "Nexus";
  if (level >= 50) return "Headmaster";
  if (level >= 25) return "Master";
  if (level >= 10) return "Gold";
  if (level >= 4) return "Silver";
  return "Rookie";
}

function renderLeaderboard() {
  const playerScore = progress.xp + progress.coins + scores.X * 60 + scores.draw * 20;
  const rows = [
    { name: "Nova X", score: 2140 },
    { name: "Grid King", score: 1730 },
    { name: "Mira XO", score: 1195 },
    { name: "Corner Ace", score: 720 },
    { name: "Line Hunter", score: 510 },
    { name: "You", score: playerScore, you: true },
  ].sort((a, b) => b.score - a.score).slice(0, 5);

  leaderboard.replaceChildren();
  rows.forEach((row, index) => {
    const item = document.createElement("li");
    item.className = row.you ? "you" : "";
    item.innerHTML = `<strong>#${index + 1}</strong><b>${row.name}<small>${row.you ? getRank(progress.xp) : "League rival"}</small></b><strong>${row.score}</strong>`;
    leaderboard.append(item);
  });
}

function cellLabel(index) {
  const row = Math.floor(index / 3) + 1;
  const column = (index % 3) + 1;
  return `Row ${row} column ${column}`;
}

function handleCellClick(event) {
  const index = Number(event.currentTarget.dataset.cell);
  if (roundOver || board[index]) return;
  if (mode === "online" && onlineSession.connected) {
    submitOnlineMove(index);
    return;
  }

  if (index === 4 && currentPlayer === "X") {
    progress.missionStats.centers += 1;
    saveProgress();
  }

  playMove(index, currentPlayer);

  if (!roundOver && (mode === "ai" || (mode === "online" && !onlineSession.connected)) && currentPlayer === "O") {
    statusText.textContent = mode === "online" ? "Run the online server to play a real opponent." : "AI is calculating the safest move.";
    window.setTimeout(() => playMove(mode === "online" ? bestAiMove() : bestAiMove(), "O"), mode === "online" ? 620 : 260);
  }
}

function playMove(index, player) {
  board[index] = player;
  const result = getResult(board);

  if (result.winner) {
    roundOver = true;
    scores[result.winner] += 1;
    markWinningCells(result.line);
    const rewardMessage = finishRound(result.winner);
    statusText.textContent = rewardMessage || (result.winner === "X"
      ? mode === "human" ? "Player X wins." : `You beat ${getOpponentLabel()}.`
      : mode === "human" ? "Player O wins." : `${getOpponentLabel()} wins this round.`);
  } else if (result.draw) {
    roundOver = true;
    scores.draw += 1;
    finishRound("draw");
    statusText.textContent = mode !== "human"
      ? "Draw secured. +35 coins for holding the grid."
      : "Draw. Both players held the grid.";
  } else {
    currentPlayer = player === "X" ? "O" : "X";
    statusText.textContent = mode !== "human"
      ? currentPlayer === "X" ? "Your move. Look for a fork." : `${getOpponentLabel()} is up.`
      : `Player ${currentPlayer}, choose a square.`;
  }

  render();
}

function finishRound(winner) {
  let rewardMessage = "";
  progress.missionStats.rounds += 1;
  if (mode === "ai") {
    progress.aiRounds += 1;
  }

  if (winner === "X") {
    if (mode === "ai") {
      progress.humanAiWins += 1;
      rewardMessage = claimBossReward();
    } else if (mode === "online") {
      addReward(onlineSession.roomCode ? 220 : 160, onlineSession.roomCode ? 260 : 180);
      rewardMessage = onlineSession.roomCode
        ? "Friend room win. Reward: +260 XP and +220 coins."
        : `Online win vs ${getOpponentLabel()}. Reward: +180 XP and +160 coins.`;
    } else {
      addReward(90, 60);
    }
  } else if (winner === "draw") {
    progress.missionStats.draws += ["ai", "online"].includes(mode) ? 1 : 0;
    addReward(35, 35);
  } else {
    if (["ai", "online"].includes(mode)) {
      progress.aiWins += 1;
    }
    addReward(15, 18);
  }

  autoClaimCompletedMissions();
  saveProgress();
  return rewardMessage;
}

function addReward(coins, xp) {
  progress.coins += coins;
  progress.xp = Math.min(99000, progress.xp + xp);
}

function claimBossReward() {
  if (!progress.masterDefeated) {
    progress.masterDefeated = true;
    addReward(500, 1000);
    return "AI Master defeated. Boss reward: +1000 XP and +500 coins.";
  }

  if (!progress.headmasterDefeated && getLevel(progress.xp) >= 5) {
    progress.headmasterDefeated = true;
    addReward(750, 1000);
    return "AI Headmaster defeated. Boss reward: +1000 XP and +750 coins.";
  }

  addReward(180, 220);
  return "AI beaten again. Reward: +220 XP and +180 coins.";
}

function claimLoginReward() {
  if (progress.lastClaimDate === todayKey()) return;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = yesterday.toISOString().slice(0, 10);
  progress.streak = progress.lastLoginDate === yesterdayKey ? Math.min(progress.streak + 1, 5) : 1;
  progress.lastLoginDate = todayKey();
  progress.lastClaimDate = todayKey();
  addReward(streakRewards[progress.streak - 1], 25);
  saveProgress();
  statusText.textContent = `Daily reward claimed. Day ${progress.streak} bonus added.`;
  render();
}

function autoClaimCompletedMissions() {
  missionTemplates.forEach((mission) => {
    const complete = progress.missionStats[mission.stat] >= mission.target;
    if (complete && !progress.claimedMissions.includes(mission.id)) {
      progress.claimedMissions.push(mission.id);
      addReward(mission.reward, 40);
    }
  });
}

function claimMission(mission) {
  if (progress.claimedMissions.includes(mission.id)) return;
  if (progress.missionStats[mission.stat] < mission.target) return;

  progress.claimedMissions.push(mission.id);
  addReward(mission.reward, 40);
  saveProgress();
  statusText.textContent = `${mission.title} complete. Reward claimed.`;
  render();
}

function markWinningCells(line) {
  line.forEach((index) => cells[index].classList.add("win"));
}

function clearWinningCells() {
  cells.forEach((cell) => cell.classList.remove("win"));
}

function getResult(candidateBoard) {
  for (const line of winningLines) {
    const [a, b, c] = line;
    if (candidateBoard[a] && candidateBoard[a] === candidateBoard[b] && candidateBoard[a] === candidateBoard[c]) {
      return { winner: candidateBoard[a], line, draw: false };
    }
  }

  return { winner: "", line: [], draw: candidateBoard.every(Boolean) };
}

function bestAiMove() {
  const moves = scoreAiMoves();
  const pressureBreak = mode === "ai" && progress.aiRounds > 0 && progress.aiRounds % 100 === 99;
  const masterDefeated = progress.masterDefeated;
  const mistakeChance = masterDefeated ? 0.08 : 0.16;

  if (pressureBreak || Math.random() < mistakeChance) {
    const beatable = moves.filter((move) => move.score < moves[0].score && move.score > -10);
    if (beatable.length) {
      return beatable[Math.floor(Math.random() * beatable.length)].index;
    }
  }

  return moves[0].index;
}

function scoreAiMoves() {
  const moves = [];

  for (const index of availableMoves(board)) {
    board[index] = "O";
    const score = minimax(board, false, 0);
    board[index] = "";
    moves.push({ index, score });
  }

  return moves.sort((a, b) => b.score - a.score);
}

function minimax(candidateBoard, isMaximizing, depth) {
  const result = getResult(candidateBoard);
  if (result.winner === "O") return 10 - depth;
  if (result.winner === "X") return depth - 10;
  if (result.draw) return 0;

  if (isMaximizing) {
    let bestScore = -Infinity;
    for (const index of availableMoves(candidateBoard)) {
      candidateBoard[index] = "O";
      bestScore = Math.max(bestScore, minimax(candidateBoard, false, depth + 1));
      candidateBoard[index] = "";
    }
    return bestScore;
  }

  let bestScore = Infinity;
  for (const index of availableMoves(candidateBoard)) {
    candidateBoard[index] = "X";
    bestScore = Math.min(bestScore, minimax(candidateBoard, true, depth + 1));
    candidateBoard[index] = "";
  }
  return bestScore;
}

function availableMoves(candidateBoard) {
  return candidateBoard
    .map((value, index) => value ? null : index)
    .filter((index) => index !== null);
}

function startRound(keepScores = true) {
  board = Array(9).fill("");
  currentPlayer = "X";
  roundOver = false;
  clearWinningCells();
  if (statusText) statusText.textContent  = mode === "ai"
    ? "Your move. Take the center if you can."
    : mode === "online" ? onlineSession.connected ? `Online match ready against ${getOpponentLabel()}.` : "Tap Matchmake or create a friend room to start real online play."
      : "Player X starts.";

  if (!keepScores) {
    scores = { X: 0, O: 0, draw: 0 };
  }

  render();
if (xScore) xScore.textContent = scores.X;
if (oScore) oScore.textContent = scores.O;
if (drawScore) drawScore.textContent = scores.draw;

if (xLabel) {
  xLabel.textContent =
    mode === "online" && onlineSession.symbol === "O"
      ? getOpponentLabel()
      : ["ai", "online"].includes(mode)
      ? "You"
      : "Player X";
}

if (oLabel) {
  oLabel.textContent =
    mode === "online" && onlineSession.symbol === "O"
      ? "You"
      : getOpponentLabel();
}

if (turnDisplay) {
  turnDisplay.textContent = getTurnText();
}

if (onlinePanel) {
  onlinePanel.classList.toggle("active", mode === "online");
}

if (onlineOpponentLabel) {
  onlineOpponentLabel.textContent = getOnlineStatus();
}

function getOpponentLabel() {
  if (mode === "ai") return progress.masterDefeated ? "Headmaster" : "AI Master";
  if (mode === "online") return onlineSession.opponent ? onlineSession.opponent.name : "Opponent";
  return "Player O";
}

function getTurnText() {
  if (mode === "human") return `Player ${currentPlayer}`;
  if (mode === "online" && onlineSession.connected) {
    return currentPlayer === onlineSession.symbol ? "Your turn" : `${getOpponentLabel()} - ${currentPlayer}`;
  }
  return currentPlayer === "X" ? "You - X" : `${getOpponentLabel()} - O`;
}

function getOnlineStatus() {
  if (onlineSession.connected && onlineSession.opponent) return `${onlineSession.opponent.name} - ${onlineSession.opponent.region}`;
  if (onlineSession.waiting) return "Searching for a real player";
  if (!isHttpApp()) return "Server required";
  return "Tap Matchmake";
}

function isHttpApp() {
  return location.protocol === "http:" || location.protocol === "https:";
}
function loadPlayerProfile() {
  const saved = JSON.parse(localStorage.getItem("xo-nexus-profile") || "{}");

  const fallbackName = `Player${playerId.slice(0, 4).toUpperCase()}`;

  const fallbackRegion =
    Intl.DateTimeFormat().resolvedOptions().timeZone || "Online";

  if (playerNameInput) {
    playerNameInput.value = saved.name || fallbackName;
  }

  if (playerRegionInput) {
    playerRegionInput.value = saved.region || fallbackRegion;
  }
}

function getPlayerProfile() {
  const profile = {
    id: playerId,
    name: playerNameInput.value.trim() || `Player${playerId.slice(0, 4).toUpperCase()}`,
    region: playerRegionInput.value.trim() || "Online",
    level: getLevel(progress.xp),
    rating: progress.xp + progress.coins
  };
  localStorage.setItem("xo-nexus-profile", JSON.stringify(profile));
  return profile;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Network error" }));
    throw new Error(error.error || "Network error");
  }

  return response.json();
}

async function matchmakeOnline() {
  setMode("online");
  if (!isHttpApp()) {
    statusText.textContent = "Real online matchmaking needs the included server.";
    return;
  }

  try {
    stopOnlinePolling();
    const result = await api("/api/matchmake", { method: "POST", body: { player: getPlayerProfile() } });
    onlineSession.ticket = result.ticket || "";
    onlineSession.waiting = !result.room;
    statusText.textContent = onlineSession.waiting
      ? "Searching for a real online opponent..."
      : "Opponent found.";
    if (result.room) {
      applyOnlineRoom(result.room);
    } else {
      pollTimer = window.setInterval(pollMatchmaking, 1200);
    }
    render();
  } catch (error) {
    statusText.textContent = error.message;
  }
}

async function pollMatchmaking() {
  if (!onlineSession.ticket) return;

  try {
    const result = await api(`/api/matchmake/${onlineSession.ticket}?playerId=${encodeURIComponent(playerId)}`);
    if (result.room) {
      stopOnlinePolling();
      applyOnlineRoom(result.room);
      statusText.textContent = `Matched with ${getOpponentLabel()}.`;
      startRoomPolling();
    }
  } catch (error) {
    stopOnlinePolling();
    statusText.textContent = error.message;
  }
}

async function createFriendRoom() {
  setMode("online");
  if (!isHttpApp()) {
    statusText.textContent = "Friend rooms need the included server.";
    return;
  }

  try {
    stopOnlinePolling();
    const result = await api("/api/rooms", { method: "POST", body: { player: getPlayerProfile() } });
    applyOnlineRoom(result.room);
    roomCode.textContent = result.room.code;
    statusText.textContent = `Real friend room created. Share code ${result.room.code}.`;
    startRoomPolling();
  } catch (error) {
    statusText.textContent = error.message;
  }
}

async function joinFriendRoom() {
  const code = joinCode.value.trim().toUpperCase();
  if (code.length < 4) {
    statusText.textContent = "Enter a valid friend room code.";
    return;
  }

  setMode("online");
  if (!isHttpApp()) {
    statusText.textContent = "Friend rooms need the included server.";
    return;
  }

  try {
    stopOnlinePolling();
    const result = await api(`/api/rooms/${encodeURIComponent(code)}/join`, { method: "POST", body: { player: getPlayerProfile() } });
    applyOnlineRoom(result.room);
    joinCode.value = "";
    roomCode.textContent = code;
    statusText.textContent = `Joined real friend room ${code}.`;
    startRoomPolling();
  } catch (error) {
    statusText.textContent = error.message;
  }
}

function applyOnlineRoom(room) {
  const me = room.players.find((player) => player.id === playerId);
  const opponent = room.players.find((player) => player.id !== playerId);
  onlineSession = {
    roomId: room.id,
    ticket: "",
    symbol: me ? me.symbol : "X",
    opponent: opponent || null,
    connected: Boolean(opponent),
    waiting: !opponent,
    roomCode: room.code || ""
  };
  roomCode.textContent = room.code || "MATCH";
  applyOnlineState(room);
}

function applyOnlineState(room) {
  board = [...room.board];
  currentPlayer = room.turn;
  roundOver = room.status !== "playing";
  clearWinningCells();
  if (room.line && room.line.length) {
    markWinningCells(room.line);
  }

  if (room.status === "waiting") {
    statusText.textContent = `Room ${room.code} is waiting for a real opponent.`;
  } else if (room.status === "draw") {
    statusText.textContent = "Online round ended in a draw.";
    const rewardKey = `${room.id}:${room.round}`;
    if (!rewardedOnlineRounds.has(rewardKey)) {
      rewardedOnlineRounds.add(rewardKey);
      scores.draw += 1;
      finishRound("draw");
    }
  } else if (room.status === "won") {
    const youWon = room.winner === onlineSession.symbol;
    statusText.textContent = youWon ? `You beat ${getOpponentLabel()} online.` : `${getOpponentLabel()} won online.`;
    const rewardKey = `${room.id}:${room.round}`;
    if (!rewardedOnlineRounds.has(rewardKey)) {
      rewardedOnlineRounds.add(rewardKey);
      if (youWon) {
        scores.X += 1;
        finishRound("X");
      } else {
        scores.O += 1;
        finishRound("O");
      }
    }
  } else {
    statusText.textContent = currentPlayer === onlineSession.symbol ? "Your online turn." : `Waiting for ${getOpponentLabel()}.`;
  }

  render();
}

function startRoomPolling() {
  stopOnlinePolling();
  pollTimer = window.setInterval(pollRoom, 900);
}

function stopOnlinePolling() {
  if (pollTimer) {
    window.clearInterval(pollTimer);
    pollTimer = 0;
  }
}

async function pollRoom() {
  if (!onlineSession.roomId) return;

  try {
    const result = await api(`/api/rooms/${encodeURIComponent(onlineSession.roomId)}?playerId=${encodeURIComponent(playerId)}`);
    if (result.room) {
      applyOnlineRoom(result.room);
    }
  } catch (error) {
    stopOnlinePolling();
    statusText.textContent = error.message;
  }
}

async function submitOnlineMove(index) {
  if (!onlineSession.roomId || currentPlayer !== onlineSession.symbol) return;

  try {
    const result = await api(`/api/rooms/${encodeURIComponent(onlineSession.roomId)}/move`, {
      method: "POST",
      body: { playerId, index }
    });
    applyOnlineRoom(result.room);
  } catch (error) {
    statusText.textContent = error.message;
  }
}

async function requestOnlineRound() {
  try {
    const result = await api(`/api/rooms/${encodeURIComponent(onlineSession.roomId)}/round`, {
      method: "POST",
      body: { playerId }
    });
    applyOnlineRoom(result.room);
  } catch (error) {
    statusText.textContent = error.message;
  }
}

function startAmbientCanvas() {
  if (!ambientCanvas) return;

  const ctx = ambientCanvas.getContext("2d");
  const sparks = Array.from({ length: 70 }, (_, index) => ({
    x: Math.random(),
    y: Math.random(),
    speed: 0.0014 + Math.random() * 0.0024,
    size: 1 + Math.random() * 2.2,
    hue: index % 3 === 0 ? 176 : index % 3 === 1 ? 12 : 43
  }));

  function resize() {
    const scale = window.devicePixelRatio || 1;
    ambientCanvas.width = window.innerWidth * scale;
    ambientCanvas.height = window.innerHeight * scale;
    ambientCanvas.style.width = `${window.innerWidth}px`;
    ambientCanvas.style.height = `${window.innerHeight}px`;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
  }

  function draw() {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    ctx.globalCompositeOperation = "lighter";

    for (const spark of sparks) {
      spark.y -= spark.speed;
      spark.x += Math.sin((spark.y + spark.speed) * 9) * 0.0008;

      if (spark.y < -0.04) {
        spark.y = 1.04;
        spark.x = Math.random();
      }

      const x = spark.x * window.innerWidth;
      const y = spark.y * window.innerHeight;
      ctx.fillStyle = `hsla(${spark.hue}, 92%, 66%, 0.42)`;
      ctx.fillRect(x, y, spark.size * 7, spark.size);
    }

    ctx.globalCompositeOperation = "source-over";
    window.requestAnimationFrame(draw);
  }

  resize();
  window.addEventListener("resize", resize);
  draw();
}
  cells.forEach((cell) => {
  cell.addEventListener("click", handleCellClick);
});

if (nextRoundButton) {
  nextRoundButton.addEventListener("click", () => {
    if (mode === "online" && onlineSession.roomId) {
      requestOnlineRound();
      return;
    }
    startRound(true);
  });
}

if (newGameButton) {
  newGameButton.addEventListener("click", () => {
    if (mode === "online" && onlineSession.roomId) {
      requestOnlineRound();
      return;
    }
    startRound(false);
  });
}

if (claimLoginButton) {
  claimLoginButton.addEventListener("click", claimLoginReward);
}

if (matchmakeButton) {
  matchmakeButton.addEventListener("click", matchmakeOnline);
}

if (createRoomButton) {
  createRoomButton.addEventListener("click", createFriendRoom);
}

if (joinRoomButton) {
  joinRoomButton.addEventListener("click", joinFriendRoom);
}

if (playerNameInput) {
  playerNameInput.addEventListener("change", getPlayerProfile);
}

if (playerRegionInput) {
  playerRegionInput.addEventListener("change", getPlayerProfile);
}

modeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setMode(button.dataset.mode);
  });
});

loadPlayerProfile();
setMode("ai");
startAmbientCanvas();

console.log("XO Nexus loaded");
claimLoginButton.addEventListener("click", claimLoginReward);
matchmakeButton.addEventListener("click", matchmakeOnline);
createRoomButton.addEventListener("click", createFriendRoom);
joinRoomButton.addEventListener("click", joinFriendRoom);
playerNameInput.addEventListener("change", getPlayerProfile);
playerRegionInput.addEventListener("change", getPlayerProfile);
modeButtons.forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode));
});

loadPlayerProfile();
setMode("ai");
startAmbientCanvas();
