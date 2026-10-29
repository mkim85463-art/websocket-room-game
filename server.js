const express = require("express");
const http = require("http");
const path = require("path");
const { WebSocketServer, WebSocket } = require("ws");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const PORT = process.env.PORT || 3000;
const rooms = new Map();

app.use(express.static(path.join(__dirname, "public")));
app.get("/health", (_req, res) => res.json({ ok: true, rooms: rooms.size }));

function makeId() {
  return crypto.randomBytes(3).toString("hex").toUpperCase();
}
function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}
function roomSnapshot(room) {
  return {
    type: "state",
    roomId: room.id,
    players: [...room.players.values()].map(p => ({
      id: p.id, name: p.name, x: p.x, y: p.y, color: p.color
    }))
  };
}
function broadcast(room, data) {
  for (const player of room.players.values()) send(player.ws, data);
}
function broadcastState(room) {
  broadcast(room, roomSnapshot(room));
}
function leaveRoom(ws) {
  const roomId = ws.roomId;
  if (!roomId) return;
  const room = rooms.get(roomId);
  ws.roomId = null;
  if (!room) return;
  const player = room.players.get(ws.playerId);
  room.players.delete(ws.playerId);
  if (player) broadcast(room, { type: "system", text: `${player.name} left the room.` });
  if (room.players.size === 0) rooms.delete(roomId);
  else broadcastState(room);
}

wss.on("connection", ws => {
  ws.id = crypto.randomUUID();
  ws.on("message", raw => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return send(ws, { type: "error", message: "Invalid message." }); }

    if (msg.type === "createRoom") {
      leaveRoom(ws);
      let id = makeId();
      while (rooms.has(id)) id = makeId();
      const room = { id, players: new Map() };
      rooms.set(id, room);
      joinRoom(ws, room, msg.name);
      return;
    }

    if (msg.type === "joinRoom") {
      const id = String(msg.roomId || "").trim().toUpperCase();
      const room = rooms.get(id);
      if (!room) return send(ws, { type: "error", message: "Room not found. Check the room code." });
      leaveRoom(ws);
      joinRoom(ws, room, msg.name);
      return;
    }

    const room = ws.roomId && rooms.get(ws.roomId);
    const player = room && room.players.get(ws.playerId);
    if (!room || !player) return;

    if (msg.type === "move") {
      const dx = Number(msg.dx) || 0;
      const dy = Number(msg.dy) || 0;
      player.x = Math.max(0, Math.min(9, player.x + Math.sign(dx)));
      player.y = Math.max(0, Math.min(7, player.y + Math.sign(dy)));
      broadcastState(room);
    } else if (msg.type === "chat") {
      const text = String(msg.text || "").trim().slice(0, 180);
      if (text) broadcast(room, { type: "chat", name: player.name, text, at: Date.now() });
    } else if (msg.type === "leaveRoom") {
      leaveRoom(ws);
      send(ws, { type: "left" });
    }
  });

  ws.on("close", () => leaveRoom(ws));
});

function joinRoom(ws, room, rawName) {
  const name = String(rawName || "Player").trim().slice(0, 18) || "Player";
  const colors = ["#5eead4", "#f9a8d4", "#fcd34d", "#a5b4fc", "#fdba74", "#86efac"];
  const player = {
    id: ws.id, ws, name,
    x: Math.floor(Math.random() * 10),
    y: Math.floor(Math.random() * 8),
    color: colors[room.players.size % colors.length]
  };
  room.players.set(player.id, player);
  ws.roomId = room.id;
  ws.playerId = player.id;
  send(ws, { type: "joined", roomId: room.id, playerId: player.id });
  broadcast(room, { type: "system", text: `${name} joined the room.` });
  broadcastState(room);
}

server.listen(PORT, () => console.log(`Room game running at http://localhost:${PORT}`));
