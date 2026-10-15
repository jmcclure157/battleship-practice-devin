// Page code: draws the grids and turns clicks into Match calls.

import { BOARD_SIZE, Direction, Outcome, PlacementError, ShotError, directionOf } from "./board.js";
import { Match, Phase } from "./match.js";
import { ROW_LABELS, formatCoord } from "./messages.js";
import { FLEET, coordKey } from "./ships.js";

const COMPUTER_DELAY_MS = 600;

const $ = (id) => document.getElementById(id);
const ownGrid = $("own-grid");
const enemyGrid = $("enemy-grid");

const match = new Match();
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

function renderFleet(list, board, highlightNext) {
  const next = highlightNext ? match.nextShip?.[0] : null;
  list.replaceChildren(
    ...FLEET.map(([name, size]) => {
      const item = document.createElement("li");
      const ship = board.ships.find((s) => s.name === name);
      item.textContent = `${name} (${size})`;
      if (ship?.isSunk) item.className = "sunk";
      else if (name === next) item.className = "next";
      return item;
    }),
  );
}

function statusText() {
  if (match.phase === Phase.PLACING) {
    const next = match.nextShip;
    if (next === null) return "All ships placed. Drag a ship to move it, click it to turn it, or press Start battle.";
    const way = match.direction === Direction.HORIZONTAL ? "horizontal" : "vertical";
    return `Place your ${next[0]} (${next[1]} squares, ${way}): click a square on Your fleet.`;
  }
  if (match.phase === Phase.OVER) return match.log.at(-1);
  return computerThinking ? "The computer is aiming..." : "Your turn: click a square in Enemy waters to fire.";
}

function render() {
  const placing = match.phase === Phase.PLACING;
  $("status").textContent = statusText();
  $("setup").hidden = !placing;
  $("replay").hidden = match.phase !== Phase.OVER;
  const way = match.direction === Direction.HORIZONTAL ? "Horizontal" : "Vertical";
  $("rotate").textContent = `Direction: ${way} (R)`;
  $("rotate").disabled = match.nextShip === null;
  $("clear").disabled = match.human.board.ships.length === 0;
  $("start").disabled = match.nextShip !== null;
  renderOwnGrid();
  renderEnemyGrid();
  renderFleet($("own-fleet"), match.human.board, placing);
  renderFleet($("enemy-fleet"), match.computer.board, false);
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
  if (match.phase === Phase.BATTLE) {
    computerThinking = true;
    setTimeout(() => {
      match.computerTurn();
      computerThinking = false;
      render();
    }, COMPUTER_DELAY_MS);
  }
  render();
});

$("rotate").addEventListener("click", rotate);
document.addEventListener("keydown", (event) => {
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
  match.reset();
  hoverCoord = null;
  drag = null;
  notify("");
  render();
});

buildGrid(ownGrid);
buildGrid(enemyGrid);
render();
