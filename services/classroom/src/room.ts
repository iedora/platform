import type { RoomClaims } from "./token.ts"

// Safe JSON for embedding in a <script> — prevents a "</script>" in any value
// from breaking out of the tag.
const embed = (value: unknown): string =>
  JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e")

/**
 * The classroom page: a self-contained full-screen 1:1 video room. The server
 * verified the token and passes the claims; the browser gets local media, opens
 * the signaling WebSocket, and negotiates a peer connection (perfect-negotiation
 * pattern, so either side can arrive first without glare). ICE servers arrive in
 * the WS "welcome" so the server stays authoritative over them.
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
    font: 15px/1.5 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; overflow: hidden; }
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
  #bar { position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%); display: flex; gap: 10px;
    padding: 10px; background: rgba(20,24,29,.9); border: 1px solid #232a31; border-radius: 999px;
    backdrop-filter: blur(10px); }
  button.ctl { width: 52px; height: 52px; border-radius: 999px; border: 0; cursor: pointer;
    background: #2a323a; color: #e7eaee; font-size: 20px; display: grid; place-items: center; transition: .12s; }
  button.ctl:hover { background: #343d47; }
  button.ctl.off { background: #b0413a; }
  button.ctl.leave { background: #b0413a; }
  button.ctl.leave:hover { background: #c4483f; }
  #status { position: fixed; top: 14px; left: 50%; transform: translateX(-50%); padding: 6px 14px;
    background: rgba(20,24,29,.9); border: 1px solid #232a31; border-radius: 999px; font-size: 13px; color: #9aa4af; }
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
<div id="bar">
  <button class="ctl" id="micBtn" title="Mute">🎤</button>
  <button class="ctl" id="camBtn" title="Camera">🎥</button>
  <button class="ctl" id="shareBtn" title="Share screen">🖥️</button>
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
// pattern so either participant can join first without an offer/offer glare.
const CLIENT_JS = String.raw`
const $ = (id) => document.getElementById(id);
const statusEl = $("status");
const setStatus = (t) => { if (t) { statusEl.textContent = t; statusEl.classList.remove("hide"); } else statusEl.classList.add("hide"); };

$("localAvatar").textContent = (BOOT.self.name || "?").charAt(0).toUpperCase();
$("localLabel").textContent = BOOT.self.name + (BOOT.self.leader ? " (host)" : "");

let pc, ws, localStream, camTrack, screenTrack;
let makingOffer = false, ignoreOffer = false, polite = false;
let remoteUid = null;

async function start() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  } catch (e) {
    setStatus("Camera/mic blocked — allow access and reload");
    return;
  }
  $("localVideo").srcObject = localStream;
  camTrack = localStream.getVideoTracks()[0];
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

async function onMessage(ev) {
  const msg = JSON.parse(ev.data);
  if (msg.type === "welcome") {
    makePeer(msg.iceServers || []);
    const other = (msg.peers || [])[0];
    if (other) { remoteUid = other.uid; setRemoteLabel(other); }
    // Deterministic roles so exactly one side is "polite" (handles glare).
    polite = BOOT.self.uid < (remoteUid || BOOT.self.uid);
    return;
  }
  if (msg.type === "peer-joined") {
    remoteUid = msg.peer.uid; setRemoteLabel(msg.peer);
    polite = BOOT.self.uid < remoteUid;
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
  if (msg.type === "signal") {
    await onSignal(msg.data);
  }
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

// Controls
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
$("leaveBtn").onclick = () => {
  try { if (pc) pc.close(); if (ws) ws.close(); } catch (e) {}
  for (const t of (localStream ? localStream.getTracks() : [])) t.stop();
  document.body.innerHTML = '<div style="display:grid;place-items:center;height:100%;color:#9aa4af">You left the classroom. You can close this tab.</div>';
};

start();
`
