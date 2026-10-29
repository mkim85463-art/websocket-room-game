const $ = id => document.getElementById(id);
const lobby = $("lobby"), game = $("game");
let socket = null, myId = null, currentRoom = null, players = [];

function connect() {
  if (socket && socket.readyState === WebSocket.OPEN) return Promise.resolve();
  if (socket && socket.readyState === WebSocket.CONNECTING) {
    return new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
  }
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  socket = new WebSocket(`${protocol}//${location.host}`);
  return new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
    socket.addEventListener("message", event => {
      let data;
      try { data = JSON.parse(event.data); } catch { return; }
      handleMessage(data);
    });
    socket.addEventListener("close", () => {
      if (currentRoom) {
        appendChat("system", "연결이 끊겼습니다. 페이지를 새로고침해 다시 접속하세요.");
        currentRoom = null;
        game.classList.add("hidden");
        lobby.classList.remove("hidden");
      }
    });
  });
}
function send(data) {
  if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(data));
}
async function enter(type) {
  $("lobbyError").textContent = "";
  try {
    await connect();
    const name = $("playerName").value.trim() || "Player";
    if (type === "createRoom") send({ type, name });
    else {
      const roomId = $("roomCode").value.trim().toUpperCase();
      if (!roomId) { $("lobbyError").textContent = "방 코드를 입력해주세요."; return; }
      send({ type, name, roomId });
    }
  } catch {
    $("lobbyError").textContent = "서버에 연결할 수 없습니다. 서버가 실행 중인지 확인해주세요.";
  }
}
$("createBtn").addEventListener("click", () => enter("createRoom"));
$("joinBtn").addEventListener("click", () => enter("joinRoom"));
$("roomCode").addEventListener("keydown", e => { if (e.key === "Enter") enter("joinRoom"); });
$("roomCode").addEventListener("input", e => e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""));
$("copyCode").addEventListener("click", async () => {
  if (!currentRoom) return;
  try { await navigator.clipboard.writeText(currentRoom); $("copyCode").textContent = "복사됨"; }
  catch { $("copyCode").textContent = currentRoom; }
  setTimeout(() => $("copyCode").textContent = "복사", 1400);
});
$("leaveBtn").addEventListener("click", () => {
  send({ type: "leaveRoom" });
  currentRoom = null; players = [];
  game.classList.add("hidden"); lobby.classList.remove("hidden");
  $("lobbyError").textContent = "";
});
$("chatForm").addEventListener("submit", e => {
  e.preventDefault();
  const input = $("chatInput"), text = input.value.trim();
  if (text) { send({ type: "chat", text }); input.value = ""; }
});
document.querySelectorAll("[data-move]").forEach(btn => btn.addEventListener("click", () => {
  const [dx, dy] = btn.dataset.move.split(",").map(Number);
  send({ type: "move", dx, dy });
}));
document.addEventListener("keydown", e => {
  if (game.classList.contains("hidden") || ["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) return;
  const key = e.key.toLowerCase();
  const moves = { arrowup: [0,-1], w: [0,-1], arrowdown: [0,1], s: [0,1], arrowleft: [-1,0], a: [-1,0], arrowright: [1,0], d: [1,0] };
  if (moves[key]) { e.preventDefault(); const [dx, dy] = moves[key]; send({ type: "move", dx, dy }); }
});
function handleMessage(msg) {
  if (msg.type === "error") { $("lobbyError").textContent = msg.message; return; }
  if (msg.type === "joined") {
    currentRoom = msg.roomId; myId = msg.playerId;
    $("roomLabel").textContent = currentRoom;
    lobby.classList.add("hidden"); game.classList.remove("hidden");
    $("chatLog").innerHTML = '<div class="chat-note">방에 입장했습니다. 다른 플레이어와 채팅해보세요 👋</div>';
  } else if (msg.type === "state") {
    players = msg.players || [];
    renderPlayers(); renderField();
  } else if (msg.type === "chat") {
    appendChat("chat", msg.text, msg.name);
  } else if (msg.type === "system") {
    appendChat("system", msg.text);
  } else if (msg.type === "left") {
    currentRoom = null; game.classList.add("hidden"); lobby.classList.remove("hidden");
  }
}
function renderField() {
  const field = $("field");
  field.innerHTML = "";
  const tiles = [];
  for (let y = 0; y < 8; y++) for (let x = 0; x < 10; x++) {
    const tile = document.createElement("div"); tile.className = "tile";
    const at = players.filter(p => p.x === x && p.y === y);
    at.forEach(p => {
      const avatar = document.createElement("div");
      avatar.className = "avatar" + (p.id === myId ? " me" : "");
      avatar.style.background = p.color;
      avatar.textContent = (p.name || "?").slice(0, 1).toUpperCase();
      avatar.title = p.name + (p.id === myId ? " (나)" : "");
      tile.appendChild(avatar);
    });
    tiles.push(tile);
  }
  tiles.forEach(tile => field.appendChild(tile));
}
function renderPlayers() {
  $("playerCount").textContent = players.length;
  const list = $("playersList"); list.innerHTML = "";
  players.forEach(p => {
    const row = document.createElement("div"); row.className = "player-row";
    const dot = document.createElement("span"); dot.className = "player-dot"; dot.style.background = p.color;
    const name = document.createElement("span"); name.textContent = p.name + (p.id === myId ? " (나)" : "");
    const pos = document.createElement("small"); pos.textContent = `${p.x + 1}, ${p.y + 1}`;
    row.append(dot, name, pos); list.appendChild(row);
  });
}
function appendChat(kind, text, name) {
  const log = $("chatLog");
  const item = document.createElement("div"); item.className = "chat-item" + (kind === "system" ? " system" : "");
  if (kind === "chat") {
    const who = document.createElement("strong"); who.textContent = name || "Player";
    item.append(who, document.createTextNode(text));
  } else item.textContent = text;
  log.appendChild(item); log.scrollTop = log.scrollHeight;
}
