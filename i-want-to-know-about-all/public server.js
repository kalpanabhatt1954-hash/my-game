const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3000);
const root = __dirname;
const waiting = new Map();
const tickets = new Map();
const rooms = new Map();

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

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png"
};

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function cleanPlayer(player = {}) {
  return {
    id: String(player.id || crypto.randomUUID()).slice(0, 64),
    name: String(player.name || "Player").replace(/[<>]/g, "").slice(0, 18),
    region: String(player.region || "Online").replace(/[<>]/g, "").slice(0, 28),
    level: Number(player.level || 1),
    rating: Number(player.rating || 0),
    symbol: player.symbol || ""
  };
}

function publicRoom(room) {
  return {
    id: room.id,
    code: room.code,
    board: room.board,
    turn: room.turn,
    status: room.status,
    winner: room.winner,
    line: room.line,
    round: room.round,
    players: room.players,
    updatedAt: room.updatedAt
  };
}

function createRoom(playerX, code = "") {
  const room = {
    id: crypto.randomUUID(),
    code,
    board: Array(9).fill(""),
    turn: "X",
    status: code ? "waiting" : "playing",
    winner: "",
    line: [],
    round: 1,
    players: [{ ...playerX, symbol: "X" }],
    updatedAt: Date.now()
  };
  rooms.set(room.id, room);
  if (code) {
    rooms.set(code, room);
  }
  return room;
}

function joinRoom(room, playerO) {
  if (!room.players.some((player) => player.id === playerO.id)) {
    room.players.push({ ...playerO, symbol: "O" });
  }
  room.status = "playing";
  room.updatedAt = Date.now();
  return room;
}

function getResult(board) {
  for (const line of winningLines) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { status: "won", winner: board[a], line };
    }
  }
  if (board.every(Boolean)) {
    return { status: "draw", winner: "", line: [] };
  }
  return { status: "playing", winner: "", line: [] };
}

function resetRoom(room) {
  room.board = Array(9).fill("");
  room.turn = room.round % 2 === 0 ? "O" : "X";
  room.status = room.players.length < 2 ? "waiting" : "playing";
  room.winner = "";
  room.line = [];
  room.round += 1;
  room.updatedAt = Date.now();
}

async function handleApi(request, response, url) {
  if (request.method === "POST" && url.pathname === "/api/matchmake") {
    const body = await readBody(request);
    const player = cleanPlayer(body.player);
    const waitingEntry = [...waiting.values()].find((entry) => entry.player.id !== player.id);

    if (waitingEntry) {
      waiting.delete(waitingEntry.ticket);
      const room = createRoom(waitingEntry.player);
      joinRoom(room, player);
      tickets.set(waitingEntry.ticket, room.id);
      return sendJson(response, 200, { room: publicRoom(room) });
    }

    const ticket = crypto.randomUUID();
    waiting.set(ticket, { ticket, player, createdAt: Date.now() });
    tickets.set(ticket, "");
    return sendJson(response, 200, { ticket });
  }

  const matchmakeStatus = url.pathname.match(/^\/api\/matchmake\/([^/]+)$/);
  if (request.method === "GET" && matchmakeStatus) {
    const ticket = decodeURIComponent(matchmakeStatus[1]);
    const roomId = tickets.get(ticket);
    return sendJson(response, 200, { room: roomId ? publicRoom(rooms.get(roomId)) : null });
  }

  if (request.method === "POST" && url.pathname === "/api/rooms") {
    const body = await readBody(request);
    const code = crypto.randomBytes(3).toString("hex").toUpperCase();
    const room = createRoom(cleanPlayer(body.player), code);
    return sendJson(response, 200, { room: publicRoom(room) });
  }

  const joinMatch = url.pathname.match(/^\/api\/rooms\/([^/]+)\/join$/);
  if (request.method === "POST" && joinMatch) {
    const body = await readBody(request);
    const room = rooms.get(decodeURIComponent(joinMatch[1]).toUpperCase());
    if (!room) return sendJson(response, 404, { error: "Room not found" });
    if (room.players.length >= 2 && !room.players.some((player) => player.id === body.player?.id)) {
      return sendJson(response, 409, { error: "Room is full" });
    }
    joinRoom(room, cleanPlayer(body.player));
    return sendJson(response, 200, { room: publicRoom(room) });
  }

  const moveMatch = url.pathname.match(/^\/api\/rooms\/([^/]+)\/move$/);
  if (request.method === "POST" && moveMatch) {
    const body = await readBody(request);
    const room = rooms.get(decodeURIComponent(moveMatch[1]));
    if (!room) return sendJson(response, 404, { error: "Room not found" });
    const player = room.players.find((item) => item.id === body.playerId);
    const index = Number(body.index);
    if (!player) return sendJson(response, 403, { error: "Player not in room" });
    if (room.status !== "playing") return sendJson(response, 409, { error: "Round is not active" });
    if (player.symbol !== room.turn) return sendJson(response, 409, { error: "Not your turn" });
    if (!Number.isInteger(index) || index < 0 || index > 8 || room.board[index]) {
      return sendJson(response, 400, { error: "Invalid move" });
    }

    room.board[index] = player.symbol;
    const result = getResult(room.board);
    room.status = result.status;
    room.winner = result.winner;
    room.line = result.line;
    if (room.status === "playing") {
      room.turn = room.turn === "X" ? "O" : "X";
    }
    room.updatedAt = Date.now();
    return sendJson(response, 200, { room: publicRoom(room) });
  }

  const roundMatch = url.pathname.match(/^\/api\/rooms\/([^/]+)\/round$/);
  if (request.method === "POST" && roundMatch) {
    const body = await readBody(request);
    const room = rooms.get(decodeURIComponent(roundMatch[1]));
    if (!room) return sendJson(response, 404, { error: "Room not found" });
    if (!room.players.some((player) => player.id === body.playerId)) {
      return sendJson(response, 403, { error: "Player not in room" });
    }
    resetRoom(room);
    return sendJson(response, 200, { room: publicRoom(room) });
  }

  const roomMatch = url.pathname.match(/^\/api\/rooms\/([^/]+)$/);
  if (request.method === "GET" && roomMatch) {
    const room = rooms.get(decodeURIComponent(roomMatch[1]));
    if (!room) return sendJson(response, 404, { error: "Room not found" });
    return sendJson(response, 200, { room: publicRoom(room) });
  }

  return sendJson(response, 404, { error: "API route not found" });
}

function serveStatic(request, response, url) {
  const relative = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
  const filePath = path.resolve(root, relative);
  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, contents) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream"
    });
    response.end(contents);
  });
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
      return;
    }
    serveStatic(request, response, url);
  } catch (error) {
    sendJson(response, 500, { error: error.message || "Server error" });
  }
});

server.listen(PORT, () => {
  console.log(`XO Nexus online server running at http://localhost:${PORT}`);
});
