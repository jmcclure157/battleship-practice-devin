// Page code: draws the grids and turns clicks into Match calls.

import { BOARD_SIZE, Direction, Outcome, PlacementError, ShotError, directionOf } from "./board.js";
import { Match, Phase } from "./match.js";
import { ROW_LABELS, formatCoord } from "./messages.js";
import { hostGame, joinGame } from "./net.js";
import { OnlineMatch, makeGameCode, normalizeGameCode } from "./online.js";
import { FLEET, coordKey } from "./ships.js";
import { SIDES } from "./theme.js";

const COMPUTER_DELAY_MS = 600;

const $ = (id) => document.getElementById(id);
const ownGrid = $("own-grid");
const enemyGrid = $("enemy-grid");

let match = new Match();
// Online play. state: "off", "join-form", "hosting" (waiting for the friend),
// "joining", "connected" or "left" (the friend closed the game).
let online = { state: "off", link: null, code: null };
let hoverCoord = null;
let computerThinking = false;
// A ship being dragged: which square of it was grabbed (offset) and where it is now (over).
let drag = null;
// Set when a press on a ship ends, so the click the browser sends after it is skipped.
let suppressClick = false;

function buildGrid(container) {
  container.append(label(""));
  for (let c = 0; c < BOARD_SIZE; c++) container.append(label(String(c + 1)));
  for (let r = 0; r < BOARD_SIZE; r++) {
    container.append(label(ROW_LABELS[r]));
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "cell";
      cell.dataset.row = r;
      cell.dataset.col = c;
      container.append(cell);
    }
  }
}

function label(text) {
  const el = document.createElement("span");
  el.className = "label";
  el.textContent = text;
  return el;
}

function coordOf(event) {
  return coordOfElement(event.target);
}

function coordOfElement(element) {
  const cell = element?.closest(".cell");
  if (!cell || cell.dataset.row === undefined) return null;
  return [Number(cell.dataset.row), Number(cell.dataset.col)];
}

function cellsOf(container) {
  return container.querySelectorAll("button.cell");
}

function notify(message) {
  $("notice").textContent = message;
}

function drawCell(cell, { board, revealShips, preview }) {
  const coord = [Number(cell.dataset.row), Number(cell.dataset.col)];
  const ship = board.shipAt(coord);
  const shot = board.shotAt(coord);
  const sunk = ship !== null && ship.isSunk && shot !== null;
  // "" = drawn before with no shot, so a hit now is a new one (not a redraw).
  if (shot === Outcome.HIT && cell.dataset.shot === "") explode(cell);
  cell.dataset.shot = shot ?? "";
  cell.className = "cell";
  cell.textContent = "";
  if (ship !== null && (revealShips || sunk)) cell.classList.add("ship");
  if (shot === Outcome.HIT) {
    cell.classList.add(sunk ? "sunk" : "hit");
    cell.textContent = "\u2715";
  } else if (shot === Outcome.MISS) {
    cell.classList.add("miss");
    cell.textContent = "\u2022";
  }
  if (preview?.keys.has(coordKey(coord))) {
    cell.classList.add(preview.valid ? "preview-ok" : "preview-bad");
  }
  const state = shot === Outcome.MISS ? "miss" : shot ? (sunk ? "sunk" : "hit") : ship && revealShips ? "ship" : "water";
  cell.setAttribute("aria-label", `${formatCoord(coord)}: ${state}`);
  return { coord, shot };
}

// A short burst drawn over the cell; the grid is its positioning box.
function explode(cell) {
  const boom = document.createElement("span");
  boom.className = "boom";
  boom.style.left = `${cell.offsetLeft}px`;
  boom.style.top = `${cell.offsetTop}px`;
  boom.addEventListener("animationend", () => boom.remove());
  cell.parentElement.append(boom);
  setTimeout(() => boom.remove(), 1500);
}

function dragStart({ offset, direction, over: [row, col] }) {
  return direction === Direction.HORIZONTAL ? [row, col - offset] : [row - offset, col];
}

function renderOwnGrid() {
  const placing = match.phase === Phase.PLACING;
  let found = null;
  if (drag?.over) found = match.previewMove(drag.name, dragStart(drag), drag.direction);
  else if (!drag && placing && match.nextShip !== null && hoverCoord) found = match.preview(hoverCoord);
  const preview = found && { keys: new Set(found.cells.map(coordKey)), valid: found.valid };
  for (const cell of cellsOf(ownGrid)) {
    const { coord } = drawCell(cell, { board: match.human.board, revealShips: true, preview });
    const ship = match.human.board.shipAt(coord);
    cell.disabled = !placing;
    cell.classList.toggle("draggable", placing && ship !== null);
    cell.classList.toggle("drag-origin", drag !== null && ship?.name === drag.name);
  }
}

function renderEnemyGrid() {
  const canFire = match.isHumanTurn && !computerThinking;
  for (const cell of cellsOf(enemyGrid)) {
    const { shot } = drawCell(cell, {
      board: match.computer.board,
      revealShips: match.phase === Phase.OVER,
    });
    cell.disabled = !canFire || shot !== null;
    cell.classList.toggle("target", !cell.disabled);
  }
}

function renderFleet(list, board, side, highlightNext) {
  const next = highlightNext ? match.nextShip?.[0] : null;
  list.replaceChildren(
    ...FLEET.map(([name, size]) => {
      const item = document.createElement("li");
      const ship = board.ships.find((s) => s.name === name);
      item.textContent = `${SIDES[side].ships[name]} · ${name} (${size})`;
      if (ship?.isSunk) item.className = "sunk";
      else if (name === next) item.className = "next";
      return item;
    }),
  );
}

const isOnline = () => match instanceof OnlineMatch;

function placingText() {
  const next = match.nextShip;
  const startButton = isOnline() ? "Ready" : "Start battle";
  if (next === null && (online.state === "hosting" || online.state === "joining")) {
    return "All ships placed. Drag a ship to move it or click it to turn it while your friend joins.";
  }
  if (next === null) return `All ships placed. Drag a ship to move it, click it to turn it, or press ${startButton}.`;
  const way = match.direction === Direction.HORIZONTAL ? "horizontal" : "vertical";
  return `Place your ${next[0]} (${next[1]} squares, ${way}): click a square on Your fleet.`;
}

function statusText() {
  if (isOnline() && match.friendLeft) return "Your friend left the game.";
  if (match.phase === Phase.PLACING) {
    const friend = isOnline() && match.friendReady ? " Your friend is ready." : "";
    return placingText() + friend;
  }
  if (match.phase === Phase.OVER) return match.log.at(-1);
  if (isOnline()) {
    if (match.phase === Phase.WAITING) return "You're ready. Waiting for your friend to place their ships...";
    if (match.isHumanTurn) return "Your turn: click a square in Enemy waters to fire.";
    return match.pendingShot ? "Firing..." : "Your friend is aiming...";
  }
  return computerThinking ? "The computer is aiming..." : "Your turn: click a square in Enemy waters to fire.";
}

function strong(text) {
  const el = document.createElement("b");
  el.textContent = text;
  return el;
}

function shareLink(code) {
  return `${location.origin}${location.pathname}?join=${code}`;
}

function renderLobby() {
  const { state, code } = online;
  $("lobby-start").hidden = !(state === "off" && match.phase === Phase.PLACING);
  $("join-form").hidden = state !== "join-form";
  const bar = !["off", "join-form"].includes(state);
  $("online-bar").hidden = !bar;
  $("share").hidden = !(state === "hosting" && code);
  if (!bar) return;
  const text = $("online-text");
  if (state === "hosting" && !code) text.replaceChildren("Setting up your game code...");
  else if (state === "hosting") {
    text.replaceChildren(
      "Your game code is ",
      strong(code),
      ". Send your friend the code or this link, and keep this page open. You can place your ships while you wait.",
    );
    $("share-link").value = shareLink(code);
  } else if (state === "joining") text.replaceChildren("Connecting to game ", strong(code), "...");
  else if (state === "connected" && match.phase === Phase.PLACING) {
    const who = isHost() ? "Your friend joined!" : "You're in!";
    text.replaceChildren(strong(who), " Place your ships and press Ready.", match.friendReady ? " Your friend is ready." : "");
  } else if (state === "connected" && match.phase === Phase.WAITING) {
    text.replaceChildren(strong("You're ready."), " Waiting for your friend to place their ships...");
  } else if (state === "connected") text.replaceChildren("Playing online with a friend, game ", strong(code), ".");
  else text.replaceChildren("This online game has ended.");
  $("online-bar").classList.toggle("joined", state === "connected" && match.phase !== Phase.BATTLE && match.phase !== Phase.OVER);
  $("leave").textContent = { hosting: "Cancel", joining: "Cancel", connected: "Leave game" }[state] ?? "Play the computer instead";
}

function renderTurn() {
  const banner = $("turn");
  const battle = match.phase === Phase.BATTLE && !(isOnline() && match.friendLeft);
  const firing = isOnline() && match.pendingShot !== null;
  const mine = battle && match.isHumanTurn && !computerThinking;
  const theirs = battle && !mine && !firing;
  banner.hidden = !battle;
  banner.classList.toggle("mine", mine);
  banner.classList.toggle("theirs", theirs);
  $("boards").classList.toggle("my-turn", mine);
  $("boards").classList.toggle("their-turn", theirs);
  if (!battle) return;
  const enemy = isOnline() ? "Friend's" : "Computer's";
  if (mine) banner.replaceChildren(strong("Your turn"), " · fire at Enemy waters");
  else if (firing) banner.replaceChildren(strong("Firing..."));
  else banner.replaceChildren(strong(`${enemy} turn`), " · aiming at your fleet");
}

function render() {
  const placing = match.phase === Phase.PLACING;
  $("status").textContent = statusText();
  $("setup").hidden = !placing;
  $("replay").hidden = match.phase !== Phase.OVER || online.state === "left";
  const way = match.direction === Direction.HORIZONTAL ? "Horizontal" : "Vertical";
  $("rotate").textContent = `Direction: ${way} (R)`;
  $("rotate").disabled = match.nextShip === null;
  $("clear").disabled = match.human.board.ships.length === 0;
  $("start").textContent = isOnline() ? "Ready" : "Start battle";
  // While waiting for a friend, don't start a game against the computer.
  $("start").disabled = match.nextShip !== null || ["hosting", "joining", "left"].includes(online.state);
  renderLobby();
  renderTurn();
  renderOwnGrid();
  renderEnemyGrid();
  renderFleet($("own-fleet"), match.human.board, "human", placing);
  renderFleet($("enemy-fleet"), match.computer.board, "computer", false);
  $("log").replaceChildren(
    ...[...match.log].reverse().map((line) => {
      const item = document.createElement("li");
      item.textContent = line;
      return item;
    }),
  );
}

function rotate() {
  if (drag) {
    drag.direction = turned(drag.direction);
    drag.moved = true;
    render();
    return;
  }
  if (match.phase !== Phase.PLACING || match.nextShip === null) return;
  match.rotate();
  render();
}

ownGrid.addEventListener("mouseover", (event) => {
  hoverCoord = coordOf(event);
  renderOwnGrid();
});
ownGrid.addEventListener("mouseleave", () => {
  hoverCoord = null;
  renderOwnGrid();
});
// Press on a placed ship and drag it to move it; a plain click turns it in place.
ownGrid.addEventListener("pointerdown", (event) => {
  if (!drag) suppressClick = false;
  if (match.phase !== Phase.PLACING || drag || event.button !== 0) return;
  const coord = coordOf(event);
  const ship = coord && match.human.board.shipAt(coord);
  if (!ship) return;
  event.preventDefault();
  ownGrid.setPointerCapture(event.pointerId);
  const offset = ship.cells.findIndex(([r, c]) => r === coord[0] && c === coord[1]);
  drag = {
    pointerId: event.pointerId,
    name: ship.name,
    offset,
    direction: directionOf(ship.cells),
    over: coord,
    moved: false,
  };
  render();
});

// Only the finger (or mouse) that picked the ship up can move or drop it.
function isDragPointer(event) {
  return drag !== null && event.pointerId === drag.pointerId;
}

// True if the square under the pointer changed.
function trackPointer(event) {
  const element = document.elementFromPoint(event.clientX, event.clientY);
  const coord = ownGrid.contains(element) ? coordOfElement(element) : null;
  if (coord === drag.over || (coord && drag.over && coordKey(coord) === coordKey(drag.over))) return false;
  drag.over = coord;
  drag.moved = true;
  return true;
}

ownGrid.addEventListener("pointermove", (event) => {
  if (isDragPointer(event) && trackPointer(event)) render();
});
ownGrid.addEventListener("pointerup", (event) => {
  if (!isDragPointer(event)) return;
  trackPointer(event);
  if (!drag.moved) drag.direction = turned(drag.direction);
  suppressClick = true;
  finishDrag(drag.moved ? "move" : "turn");
});
ownGrid.addEventListener("pointercancel", (event) => {
  if (isDragPointer(event)) cancelDrag();
});

function turned(direction) {
  return direction === Direction.HORIZONTAL ? Direction.VERTICAL : Direction.HORIZONTAL;
}

function finishDrag(verb) {
  const current = drag;
  const { name } = current;
  drag = null;
  if (current.over === null) {
    notify(`${name} went back: drop it on Your fleet.`);
  } else {
    try {
      match.moveShip(name, dragStart(current), current.direction);
      notify("");
    } catch (error) {
      if (!(error instanceof PlacementError)) throw error;
      notify(`Can't ${verb} ${name} there: ${error.message} It stayed where it was.`);
    }
  }
  render();
}

function cancelDrag() {
  if (!drag) return;
  drag = null;
  render();
}

ownGrid.addEventListener("click", (event) => {
  // Keyboard clicks (detail 0) never follow a press, so they are never skipped.
  if (event.detail !== 0 && suppressClick) {
    suppressClick = false;
    return;
  }
  const coord = coordOf(event);
  if (drag || coord === null || match.phase !== Phase.PLACING) return;
  const ship = match.human.board.shipAt(coord);
  if (ship !== null) {
    // Mouse and touch on a ship are handled by the pointer events; this is Enter/Space (detail 0).
    if (event.detail !== 0) return;
    const offset = ship.cells.findIndex(([r, c]) => r === coord[0] && c === coord[1]);
    drag = { name: ship.name, offset, direction: turned(directionOf(ship.cells)), over: coord, moved: false };
    finishDrag("turn");
    return;
  }
  if (match.nextShip === null) return;
  const [name] = match.nextShip;
  try {
    match.placeNext(coord);
    notify("");
  } catch (error) {
    if (!(error instanceof PlacementError)) throw error;
    notify(`Can't place ${name} at ${formatCoord(coord)}: ${error.message}`);
  }
  render();
});

enemyGrid.addEventListener("click", (event) => {
  const coord = coordOf(event);
  if (coord === null || !match.isHumanTurn || computerThinking) return;
  try {
    match.fire(coord);
    notify("");
  } catch (error) {
    if (!(error instanceof ShotError)) throw error;
    notify(error.message);
    return;
  }
  if (!isOnline() && match.phase === Phase.BATTLE) {
    computerThinking = true;
    const current = match;
    setTimeout(() => {
      if (match !== current) return;
      match.computerTurn();
      computerThinking = false;
      render();
    }, COMPUTER_DELAY_MS);
  }
  render();
});

$("rotate").addEventListener("click", rotate);
document.addEventListener("keydown", (event) => {
  // Typing a game code (which can contain R) mustn't turn ships.
  const typing = event.target instanceof HTMLInputElement && !event.target.readOnly;
  if (typing && drag === null) return;
  if (event.key === "Escape") cancelDrag();
  else if (event.key.toLowerCase() === "r" && !event.ctrlKey && !event.metaKey) rotate();
});
$("random").addEventListener("click", () => {
  match.placeRandomly();
  notify("");
  render();
});
$("clear").addEventListener("click", () => {
  match.clear();
  notify("");
  render();
});
$("start").addEventListener("click", () => {
  match.start();
  notify("");
  render();
});
$("again").addEventListener("click", () => {
  if (isOnline()) match.playAgain();
  else match.reset();
  hoverCoord = null;
  drag = null;
  notify("");
  render();
});

// Swaps in a new match; ships already placed are kept if both are still placing.
function switchMatch(next) {
  if (match.phase === Phase.PLACING && next.phase === Phase.PLACING) next.human.board = match.human.board;
  match = next;
  computerThinking = false;
  hoverCoord = null;
  drag = null;
  notify("");
  render();
}

function stopOnline() {
  releaseSound();
  online.link?.close();
  online = { state: "off", link: null, code: null };
}

function linkEvents(host) {
  return {
    onCode(code) {
      online.code = code;
      render();
    },
    onConnected() {
      const { link } = online;
      online.state = "connected";
      switchMatch(new OnlineMatch((message) => link.send(message), { host }));
      flash($("online-bar"));
      chime();
      alertTab(host ? "Your friend joined!" : "Connected!");
    },
    onMessage(message) {
      const wasMyTurn = isOnline() && match.isHumanTurn;
      if (!isOnline() || !match.receive(message)) return;
      if (match.friendLeft) online.state = "left";
      if (!wasMyTurn && match.isHumanTurn) {
        alertTab("Your turn!");
        if (message.type === "ready") flash($("turn"));
      }
      render();
    },
    onClosed() {
      friendGone("");
    },
    onError(message) {
      friendGone(message);
    },
  };
}

// The link closed or failed: mid-game the board stays up so you can see it;
// before connecting you're simply back to playing the computer.
function friendGone(message) {
  if (online.state === "connected" || online.state === "left") {
    if (isOnline()) match.leave();
    online.state = "left";
  } else {
    online = { state: "off", link: null, code: null };
  }
  releaseSound();
  notify(message);
  render();
}

const isHost = () => isOnline() && match.host;

// Tab title as a nudge for a page in a background tab; reset when it's looked at.
const PAGE_TITLE = document.title;
function alertTab(text) {
  if (document.hidden) document.title = `(!) ${text} · Battleship`;
}
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) document.title = PAGE_TITLE;
});

function flash(element) {
  element.classList.remove("flash");
  void element.offsetWidth; // restart the animation
  element.classList.add("flash");
}

// Browsers only allow sound after a click, so the audio is set up on the
// Play-a-friend / Join click and used when the friend connects.
let audio = null;
function unlockSound() {
  try {
    audio ??= new AudioContext();
    audio.resume();
  } catch {
    audio = null;
  }
}

// The sound is only needed for the "friend joined" chime, so it's released after.
function releaseSound() {
  audio?.close().catch(() => {});
  audio = null;
}

function chime() {
  if (audio?.state !== "running") return releaseSound();
  const start = audio.currentTime;
  [660, 990].forEach((frequency, i) => {
    const at = start + i * 0.14;
    const tone = audio.createOscillator();
    const volume = audio.createGain();
    tone.frequency.value = frequency;
    volume.gain.setValueAtTime(0.0001, at);
    volume.gain.exponentialRampToValueAtTime(0.15, at + 0.02);
    volume.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
    tone.connect(volume).connect(audio.destination);
    tone.start(at);
    tone.stop(at + 0.32);
  });
  setTimeout(releaseSound, 600);
}

function startHosting() {
  unlockSound();
  online = { state: "hosting", link: null, code: null };
  online.link = hostGame(makeGameCode, linkEvents(true));
  notify("");
  render();
}

function startJoining(code) {
  unlockSound();
  online = { state: "joining", link: null, code };
  online.link = joinGame(code, linkEvents(false));
  notify("");
  render();
}

$("host").addEventListener("click", startHosting);
$("join-open").addEventListener("click", () => {
  online.state = "join-form";
  notify("");
  render();
  $("join-code").focus();
});
$("join-cancel").addEventListener("click", () => {
  online.state = "off";
  render();
});
$("join-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const code = normalizeGameCode($("join-code").value);
  if (code === null) {
    notify("A game code is 4 letters and numbers, like K7Q2.");
    return;
  }
  startJoining(code);
});
$("leave").addEventListener("click", () => {
  stopOnline();
  switchMatch(new Match());
});
$("copy-link").addEventListener("click", () => {
  const input = $("share-link");
  const copied = () => {
    $("copy-link").textContent = "Copied!";
    setTimeout(() => ($("copy-link").textContent = "Copy link"), 2000);
  };
  if (navigator.clipboard) navigator.clipboard.writeText(input.value).then(copied, () => input.select());
  else input.select();
});
// Tell the friend right away when this tab closes, instead of them waiting for a timeout.
window.addEventListener("pagehide", () => online.link?.close());
// Back/forward can restore this page from the browser's cache after pagehide
// closed the link, so that online game can't continue.
window.addEventListener("pageshow", (event) => {
  if (event.persisted && online.link?.closed) friendGone("The online game ended while you were away from this page.");
});

buildGrid(ownGrid);
buildGrid(enemyGrid);
render();

// A shared link (?join=K7Q2) joins that game straight away.
const sharedCode = normalizeGameCode(new URLSearchParams(location.search).get("join"));
if (sharedCode !== null) {
  history.replaceState(null, "", location.pathname);
  startJoining(sharedCode);
}
