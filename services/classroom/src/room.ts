import type { RoomClaims } from "./token.ts"

// Safe JSON for embedding in a <script> — prevents a "</script>" in any value
// from breaking out of the tag.
const embed = (value: unknown): string =>
  JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e")

/**
 * The classroom page: a self-contained full-screen 1:1 video room with a shared
 * whiteboard. The server verified the token and passes the claims; the browser
 * gets local media, opens the signaling WebSocket, negotiates a peer connection
 * (perfect-negotiation, so either side can arrive first), and syncs the
 * whiteboard peer-to-peer over an RTCDataChannel — no server round-trip for ink.
 */
export function roomPage(claims: RoomClaims, token: string): string {
  const boot = { token, self: { uid: claims.uid, name: claims.name, leader: claims.leader }, room: claims.room }
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="robots" content="noindex" />
<title>${escapeHtml(claims.room || "Classroom")}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; margin: 0; }
  html, body { height: 100%; background: #0b0d10; color: #e7eaee;
    font: 15px/1.5 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; overflow: hidden; touch-action: none; }
  #stage { position: fixed; inset: 0; display: grid; gap: 10px; padding: 10px 10px 88px;
    grid-template-columns: 1fr 1fr; }
  @media (max-width: 820px) { #stage { grid-template-columns: 1fr; grid-template-rows: 1fr 1fr; } }
  .tile { position: relative; background: #14181d; border-radius: 16px; overflow: hidden;
    display: flex; align-items: center; justify-content: center; min-height: 0; }
  .tile video { width: 100%; height: 100%; object-fit: cover; background: #14181d; }
  .tile .label { position: absolute; left: 12px; bottom: 12px; padding: 3px 10px; font-size: 13px;
    background: rgba(0,0,0,.55); border-radius: 999px; backdrop-filter: blur(6px); }
  .tile.local video { transform: scaleX(-1); }
  .tile .avatar { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    font-size: 44px; font-weight: 600; color: #6b7280; }

  /* Whiteboard overlays the stage; when inactive it ignores pointer events so the
     video + controls stay usable. When active, video shrinks to a corner strip. */
  #boardWrap { position: fixed; inset: 0; padding: 10px 10px 88px; display: none; }
  #boardWrap.on { display: block; }
  body.board #stage { grid-template-columns: 1fr; padding: 10px; gap: 8px;
    position: fixed; right: 10px; top: 10px; left: auto; bottom: auto; width: 200px; height: 300px; }
  #board { width: 100%; height: 100%; background: #fbfbf7; border-radius: 16px; touch-action: none; cursor: crosshair; }
  #boardbar { position: fixed; left: 18px; top: 50%; transform: translateY(-50%); display: none;
    flex-direction: column; gap: 8px; padding: 10px; background: rgba(20,24,29,.92); border: 1px solid #232a31;
    border-radius: 16px; backdrop-filter: blur(10px); }
  body.board #boardbar { display: flex; }
  .swatch { width: 30px; height: 30px; border-radius: 999px; border: 2px solid transparent; cursor: pointer; }
  .swatch.sel { border-color: #e7eaee; }
  #boardbar button { width: 40px; height: 40px; border-radius: 10px; border: 0; cursor: pointer;
    background: #2a323a; color: #e7eaee; font-size: 17px; }
  #boardbar button:hover { background: #343d47; }

  #bar { position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%); display: flex; gap: 10px;
    padding: 10px; background: rgba(20,24,29,.9); border: 1px solid #232a31; border-radius: 999px;
    backdrop-filter: blur(10px); z-index: 5; }
  button.ctl { width: 52px; height: 52px; border-radius: 999px; border: 0; cursor: pointer;
    background: #2a323a; color: #e7eaee; font-size: 20px; display: grid; place-items: center; transition: .12s; }
  button.ctl:hover { background: #343d47; }
  button.ctl.off { background: #b0413a; }
  button.ctl.on { background: #3a7bd5; }
  button.ctl.leave { background: #b0413a; }
  button.ctl.leave:hover { background: #c4483f; }
  #status { position: fixed; top: 14px; left: 50%; transform: translateX(-50%); padding: 6px 14px;
    background: rgba(20,24,29,.9); border: 1px solid #232a31; border-radius: 999px; font-size: 13px; color: #9aa4af; z-index: 5; }
  #status.hide { display: none; }
</style>
</head>
<body>
<div id="status">Connecting…</div>
<div id="stage">
  <div class="tile local" id="localTile">
    <div class="avatar" id="localAvatar"></div>
    <video id="localVideo" autoplay playsinline muted></video>
    <span class="label" id="localLabel">You</span>
  </div>
  <div class="tile" id="remoteTile">
    <div class="avatar" id="remoteAvatar">…</div>
    <video id="remoteVideo" autoplay playsinline></video>
    <span class="label" id="remoteLabel">Waiting…</span>
  </div>
</div>
<div id="boardWrap"><canvas id="board"></canvas></div>
<div id="boardbar">
  <div class="swatch sel" data-color="#1b1e23" style="background:#1b1e23"></div>
  <div class="swatch" data-color="#d64545" style="background:#d64545"></div>
  <div class="swatch" data-color="#2f7d4f" style="background:#2f7d4f"></div>
  <div class="swatch" data-color="#2f6fd6" style="background:#2f6fd6"></div>
  <button id="eraserBtn" title="Eraser">⌫</button>
  <button id="clearBtn" title="Clear board">🗑️</button>
</div>
<div id="bar">
  <button class="ctl" id="micBtn" title="Mute">🎤</button>
  <button class="ctl" id="camBtn" title="Camera">🎥</button>
  <button class="ctl" id="shareBtn" title="Share screen">🖥️</button>
  <button class="ctl" id="boardBtn" title="Whiteboard">✏️</button>
  <button class="ctl leave" id="leaveBtn" title="Leave">✕</button>
</div>
<script>
const BOOT = ${embed(boot)};
${CLIENT_JS}
</script>
</body>
</html>`
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c)
}

// The WebRTC client. Kept as a plain string so the whole room is one self-contained
// document — no bundler, no external asset. Uses the MDN "perfect negotiation"
// pattern so either participant can join first without an offer/offer glare, and
// an RTCDataChannel to sync the whiteboard peer-to-peer.
const CLIENT_JS = String.raw`
const $ = (id) => document.getElementById(id);
const statusEl = $("status");
const setStatus = (t) => { if (t) { statusEl.textContent = t; statusEl.classList.remove("hide"); } else statusEl.classList.add("hide"); };

$("localAvatar").textContent = (BOOT.self.name || "?").charAt(0).toUpperCase();
$("localLabel").textContent = BOOT.self.name + (BOOT.self.leader ? " (host)" : "");

let pc, ws, localStream, camTrack, screenTrack;
let makingOffer = false, ignoreOffer = false, polite = false;
let remoteUid = null;
let board = null; // { channel, strokes, ... }

async function start() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  } catch (e) {
    setStatus("Camera/mic blocked — allow access and reload");
    return;
  }
  $("localVideo").srcObject = localStream;
  camTrack = localStream.getVideoTracks()[0];
  setupBoard();
  connect();
}

function connect() {
  const url = location.origin.replace(/^http/, "ws") + "/ws?token=" + encodeURIComponent(BOOT.token);
  ws = new WebSocket(url);
  ws.onmessage = onMessage;
  ws.onclose = () => setStatus("Disconnected");
  ws.onerror = () => setStatus("Connection error");
}

function send(msg) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); }

function makePeer(iceServers) {
  pc = new RTCPeerConnection({ iceServers });
  for (const track of localStream.getTracks()) pc.addTrack(track, localStream);
  pc.ontrack = ({ streams }) => {
    $("remoteVideo").srcObject = streams[0];
    $("remoteAvatar").style.display = "none";
    setStatus(null);
  };
  pc.ondatachannel = ({ channel }) => { if (channel.label === "board") attachBoard(channel); };
  pc.onicecandidate = ({ candidate }) => { if (candidate) send({ type: "signal", data: { candidate } }); };
  pc.onnegotiationneeded = async () => {
    try {
      makingOffer = true;
      await pc.setLocalDescription();
      send({ type: "signal", data: { description: pc.localDescription } });
    } catch (e) { console.error(e); } finally { makingOffer = false; }
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "connected") setStatus(null);
    if (pc.connectionState === "failed") { setStatus("Reconnecting…"); pc.restartIce(); }
  };
}

// One side creates the data channel; the other receives it via ondatachannel.
// The impolite peer (deterministic by uid) creates it — independent of who joins first.
function maybeCreateBoardChannel() {
  if (!pc || board.channel || polite) return;
  attachBoard(pc.createDataChannel("board"));
}

async function onMessage(ev) {
  const msg = JSON.parse(ev.data);
  if (msg.type === "welcome") {
    makePeer(msg.iceServers || []);
    const other = (msg.peers || [])[0];
    if (other) { remoteUid = other.uid; setRemoteLabel(other); }
    polite = BOOT.self.uid < (remoteUid || BOOT.self.uid);
    maybeCreateBoardChannel();
    return;
  }
  if (msg.type === "peer-joined") {
    remoteUid = msg.peer.uid; setRemoteLabel(msg.peer);
    polite = BOOT.self.uid < remoteUid;
    maybeCreateBoardChannel();
    setStatus("Connecting…");
    return;
  }
  if (msg.type === "peer-left") {
    $("remoteVideo").srcObject = null;
    $("remoteAvatar").style.display = "";
    $("remoteLabel").textContent = "Waiting…";
    setStatus("The other participant left");
    return;
  }
  if (msg.type === "signal") { await onSignal(msg.data); }
}

function setRemoteLabel(peer) {
  $("remoteLabel").textContent = peer.name + (peer.leader ? " (host)" : "");
  $("remoteAvatar").textContent = (peer.name || "?").charAt(0).toUpperCase();
}

async function onSignal({ description, candidate }) {
  try {
    if (description) {
      const offerCollision = description.type === "offer" && (makingOffer || pc.signalingState !== "stable");
      ignoreOffer = !polite && offerCollision;
      if (ignoreOffer) return;
      await pc.setRemoteDescription(description);
      if (description.type === "offer") {
        await pc.setLocalDescription();
        send({ type: "signal", data: { description: pc.localDescription } });
      }
    } else if (candidate) {
      try { await pc.addIceCandidate(candidate); } catch (e) { if (!ignoreOffer) throw e; }
    }
  } catch (e) { console.error(e); }
}

/* ---------- Whiteboard (peer-to-peer over the data channel) ---------- */
function setupBoard() {
  const canvas = $("board");
  const ctx = canvas.getContext("2d");
  board = { canvas, ctx, channel: null, strokes: [], color: "#1b1e23", erasing: false, drawing: false, last: null };

  const resize = () => {
    const r = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = r.width * dpr; canvas.height = r.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    redraw();
  };
  const redraw = () => {
    const r = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, r.width, r.height);
    for (const s of board.strokes) paint(s, r);
  };
  board.redraw = redraw;

  const paint = (s, r) => {
    ctx.strokeStyle = s.erase ? "#fbfbf7" : s.c;
    ctx.lineWidth = (s.erase ? 18 : 3);
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(s.x0 * r.width, s.y0 * r.height);
    ctx.lineTo(s.x1 * r.width, s.y1 * r.height);
    ctx.stroke();
  };
  board.paint = paint;

  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, r };
  };
  const addSeg = (seg, local) => {
    board.strokes.push(seg);
    board.paint(seg, canvas.getBoundingClientRect());
    if (local && board.channel && board.channel.readyState === "open")
      board.channel.send(JSON.stringify({ op: "seg", seg }));
  };
  board.addSeg = addSeg;

  canvas.addEventListener("pointerdown", (e) => {
    if (!document.body.classList.contains("board")) return;
    board.drawing = true; const p = pos(e); board.last = { x: p.x, y: p.y }; canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!board.drawing) return; const p = pos(e);
    addSeg({ x0: board.last.x, y0: board.last.y, x1: p.x, y1: p.y, c: board.color, erase: board.erasing }, true);
    board.last = { x: p.x, y: p.y };
  });
  const end = () => { board.drawing = false; };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  window.addEventListener("resize", resize);
  resize();
}

function attachBoard(channel) {
  board.channel = channel;
  channel.onopen = () => {
    // Replay existing ink so a peer who joins after drawing started sees the board.
    if (board.strokes.length) channel.send(JSON.stringify({ op: "history", strokes: board.strokes }));
  };
  channel.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.op === "seg") { board.strokes.push(m.seg); board.paint(m.seg, board.canvas.getBoundingClientRect()); }
    else if (m.op === "history") { for (const s of m.strokes) if (!board.strokes.includes(s)) board.strokes.push(s); board.redraw(); }
    else if (m.op === "clear") { board.strokes = []; board.redraw(); }
  };
}

/* ---------- Controls ---------- */
$("micBtn").onclick = () => {
  const t = localStream.getAudioTracks()[0]; if (!t) return;
  t.enabled = !t.enabled; $("micBtn").classList.toggle("off", !t.enabled);
};
$("camBtn").onclick = () => {
  const t = localStream.getVideoTracks()[0]; if (!t) return;
  t.enabled = !t.enabled; $("camBtn").classList.toggle("off", !t.enabled);
};
$("shareBtn").onclick = async () => {
  const sender = pc && pc.getSenders().find((s) => s.track && s.track.kind === "video");
  if (!sender) return;
  if (screenTrack) {
    screenTrack.stop(); screenTrack = null;
    await sender.replaceTrack(camTrack);
    $("localVideo").srcObject = localStream;
    $("shareBtn").classList.remove("off");
    return;
  }
  try {
    const display = await navigator.mediaDevices.getDisplayMedia({ video: true });
    screenTrack = display.getVideoTracks()[0];
    screenTrack.onended = () => $("shareBtn").onclick();
    await sender.replaceTrack(screenTrack);
    $("localVideo").srcObject = display;
    $("shareBtn").classList.add("off");
  } catch (e) { /* user cancelled */ }
};
$("boardBtn").onclick = () => {
  const on = document.body.classList.toggle("board");
  $("boardWrap").classList.toggle("on", on);
  $("boardBtn").classList.toggle("on", on);
  if (on && board) board.redraw();
};
document.querySelectorAll(".swatch").forEach((el) => {
  el.onclick = () => {
    document.querySelectorAll(".swatch").forEach((s) => s.classList.remove("sel"));
    el.classList.add("sel");
    board.color = el.dataset.color; board.erasing = false;
    $("eraserBtn").classList.remove("on");
  };
});
$("eraserBtn").onclick = () => { board.erasing = !board.erasing; $("eraserBtn").classList.toggle("on", board.erasing); };
$("clearBtn").onclick = () => {
  board.strokes = []; board.redraw();
  if (board.channel && board.channel.readyState === "open") board.channel.send(JSON.stringify({ op: "clear" }));
};
$("leaveBtn").onclick = () => {
  try { if (pc) pc.close(); if (ws) ws.close(); } catch (e) {}
  for (const t of (localStream ? localStream.getTracks() : [])) t.stop();
  document.body.innerHTML = '<div style="display:grid;place-items:center;height:100%;color:#9aa4af">You left the classroom. You can close this tab.</div>';
};

start();
`
