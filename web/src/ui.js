// Page code: draws the grids and turns clicks into Match calls.

import { BOARD_SIZE, Direction, Outcome, PlacementError, ShotError } from "./board.js";
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
  const cell = event.target.closest(".cell");
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

function renderOwnGrid() {
  const placing = match.phase === Phase.PLACING && match.nextShip !== null;
  const found = placing && hoverCoord ? match.preview(hoverCoord) : null;
  const preview = found && { keys: new Set(found.cells.map(coordKey)), valid: found.valid };
  for (const cell of cellsOf(ownGrid)) {
    drawCell(cell, { board: match.human.board, revealShips: true, preview });
    cell.disabled = !placing;
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
    if (next === null) return "All ships placed. Press Start battle (or Clear to redo).";
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
    ...match.log.toReversed().map((line) => {
      const item = document.createElement("li");
      item.textContent = line;
      return item;
    }),
  );
}

function rotate() {
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
ownGrid.addEventListener("click", (event) => {
  const coord = coordOf(event);
  if (coord === null || match.phase !== Phase.PLACING || match.nextShip === null) return;
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
  if (event.key.toLowerCase() === "r" && !event.ctrlKey && !event.metaKey) rotate();
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
  notify("");
  render();
});

buildGrid(ownGrid);
buildGrid(enemyGrid);
render();
