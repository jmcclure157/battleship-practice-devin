// One match against a friend in another browser. No page or network code here:
// ui.js passes in a `send` function and hands every incoming message to
// `receive`, so two of these can be wired together in the tests.
//
// Each side keeps its own fleet. A shot goes out as {type: "shot", coord};
// the defender checks its own board and answers {type: "result", ...}, naming
// a ship only once it is sunk. So neither browser ever learns where the other
// side's ships are before they sink.

import { Direction, Outcome, PlacementError, ShotError, inBounds } from "./board.js";
import { Player } from "./game.js";
import { Match, Phase } from "./match.js";
import { describeShot, describeWin } from "./messages.js";
import { FLEET, Ship, coordKey } from "./ships.js";
import { shipLabel } from "./theme.js";

const FRIEND = "Friend";

// No 0/O or 1/I, so a code read out loud or typed by hand can't be mixed up.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 4;

// Ready-made taunts. Only the index goes over the network, so nothing else can
// show up on the other screen.
export const TAUNTS = Object.freeze([
  "😂", "🎯", "💥", "😴", "😎", "👋", "🔥", "🤡",
  "Is that all you've got?", "Missed me!", "Nice shot!", "Good game!",
]);
export const TAUNT_GAP_MS = 1000;

const isTaunt = (id) => Number.isInteger(id) && id >= 0 && id < TAUNTS.length;

export function makeGameCode(rng = Math.random) {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)];
  return code;
}

// " k7q2 " -> "K7Q2"; anything that can't be a code -> null.
export function normalizeGameCode(text) {
  const code = String(text ?? "").trim().toUpperCase();
  if (code.length !== CODE_LENGTH) return null;
  return [...code].every((ch) => CODE_ALPHABET.includes(ch)) ? code : null;
}

function isCoord(value) {
  return Array.isArray(value) && value.length === 2 && value.every(Number.isInteger) && inBounds(value);
}

export class OnlineMatch extends Match {
  // `host` is the side that made the code; it fires first in game 1, then
  // the first shot alternates.
  constructor(send, { host, rng = Math.random, now = Date.now }) {
    super(rng);
    this.send = send;
    this.host = host;
    this.friendLeft = false;
    this.now = now;
    this.lastTauntOut = -Infinity;
    this.lastTauntIn = -Infinity;
  }

  reset() {
    this.human = new Player("You");
    // What we know of the friend's board: our shots, plus each ship once it sinks.
    this.computer = new Player(FRIEND);
    this.phase = Phase.PLACING;
    this.direction = Direction.HORIZONTAL;
    this.game = null;
    this.log = [];
    this.round = (this.round ?? 0) + 1;
    this.friendReady = false;
    this.myTurn = false;
    this.pendingShot = null;
    this.result = null;
  }

  get winner() {
    return this.result;
  }

  get humanWon() {
    return this.result === "You";
  }

  get canTaunt() {
    return !this.friendLeft && this.now() - this.lastTauntOut >= TAUNT_GAP_MS;
  }

  // Sends TAUNTS[id]; returns false (and sends nothing) during the cooldown.
  taunt(id) {
    if (!isTaunt(id)) throw new Error("Unknown taunt.");
    if (!this.canTaunt) return false;
    this.lastTauntOut = this.now();
    this.send({ type: "taunt", id });
    this.log.push(`You: ${TAUNTS[id]}`);
    return true;
  }

  get isHumanTurn() {
    return this.phase === Phase.BATTLE && this.myTurn && this.pendingShot === null && !this.friendLeft;
  }

  get firesFirst() {
    return (this.round % 2 === 1) === this.host;
  }

  // Ships are locked once you're ready; the battle starts when both sides are.
  start() {
    if (this.phase !== Phase.PLACING) throw new Error("Only allowed while placing.");
    if (this.nextShip !== null) throw new PlacementError("Place all your ships first.");
    this.phase = Phase.WAITING;
    this.send({ type: "ready" });
    if (this.friendReady) this.#begin();
  }

  fire(coord) {
    if (!this.isHumanTurn) throw new ShotError("It's not your turn.");
    if (!isCoord(coord)) throw new ShotError("That coordinate is outside the grid.");
    if (this.computer.board.shotAt(coord) !== null) {
      throw new ShotError("That coordinate has already been targeted.");
    }
    this.pendingShot = coord;
    this.send({ type: "shot", coord });
  }

  playAgain() {
    if (this.phase !== Phase.OVER) throw new Error("Only allowed once the game is over.");
    this.reset();
    this.send({ type: "again" });
  }

  // Applies one message from the friend. Returns false if it was ignored
  // (malformed, or not possible at this point in the game).
  receive(message) {
    if (this.friendLeft) return false;
    switch (message?.type) {
      case "ready":
        return this.#friendIsReady();
      case "shot":
        return this.#incomingShot(message.coord);
      case "result":
        return this.#incomingResult(message);
      case "again":
        return this.#friendWantsAgain();
      case "taunt":
        return this.#incomingTaunt(message.id);
      case "leave":
        this.leave();
        return true;
      default:
        return false;
    }
  }

  leave() {
    this.friendLeft = true;
  }

  #begin() {
    this.phase = Phase.BATTLE;
    this.myTurn = this.firesFirst;
    this.log.push(`Both fleets are placed. ${this.myTurn ? "You fire" : "Your friend fires"} first.`);
  }

  #friendIsReady() {
    if (this.friendReady || (this.phase !== Phase.PLACING && this.phase !== Phase.WAITING)) return false;
    this.friendReady = true;
    if (this.phase === Phase.WAITING) this.#begin();
    else this.log.push("Your friend has placed their ships and is ready.");
    return true;
  }

  #incomingShot(coord) {
    if (this.phase !== Phase.BATTLE || this.myTurn || !isCoord(coord)) return false;
    let result;
    try {
      result = this.human.board.receiveShot(coord);
    } catch (error) {
      if (error instanceof ShotError) return false;
      throw error;
    }
    const sunk = result.outcome === Outcome.SUNK ? result.ship : null;
    this.send({
      type: "result",
      coord,
      outcome: result.outcome,
      ship: sunk && { name: sunk.name, cells: sunk.cells },
    });
    this.log.push(describeShot(result, FRIEND, "You", sunk && shipLabel("human", sunk.name)));
    if (this.human.board.allSunk()) this.#finish(FRIEND, "You");
    else this.myTurn = true;
    return true;
  }

  #incomingResult({ coord, outcome, ship }) {
    const shot = this.pendingShot;
    if (shot === null || !isCoord(coord) || coordKey(coord) !== coordKey(shot)) return false;
    if (!Object.values(Outcome).includes(outcome)) return false;
    const board = this.computer.board;
    let sunkShip = null;
    if (outcome === Outcome.SUNK) {
      sunkShip = this.#sunkShip(ship, coord);
      if (sunkShip === null) return false;
      board.ships.push(sunkShip);
    }
    board.shots.set(coordKey(coord), outcome === Outcome.MISS ? Outcome.MISS : Outcome.HIT);
    this.pendingShot = null;
    const result = { coord, outcome, ship: sunkShip };
    this.log.push(describeShot(result, "You", FRIEND, sunkShip && shipLabel("computer", sunkShip.name)));
    if (board.ships.length === FLEET.length) this.#finish("You", FRIEND);
    else this.myTurn = false;
    return true;
  }

  // The friend's description of a ship we just sank, checked before we trust it.
  #sunkShip(ship, coord) {
    const entry = FLEET.find(([name]) => name === ship?.name);
    if (!entry || this.computer.board.ships.some((s) => s.name === entry[0])) return null;
    const [name, size] = entry;
    const cells = ship.cells;
    if (!Array.isArray(cells) || cells.length !== size || !cells.every(isCoord)) return null;
    const sunk = new Ship(name, size, cells.map(([r, c]) => [r, c]));
    if (!sunk.occupies(coord)) return null;
    for (const cell of sunk.cells) sunk.registerHit(cell);
    return sunk;
  }

  // A friend's page skipping the cooldown can't flood the screen.
  #incomingTaunt(id) {
    const at = this.now();
    if (!isTaunt(id) || at - this.lastTauntIn < TAUNT_GAP_MS / 2) return false;
    this.lastTauntIn = at;
    this.log.push(`Your friend: ${TAUNTS[id]}`);
    return true;
  }

  #friendWantsAgain() {
    if (this.phase !== Phase.OVER) return false;
    this.reset();
    this.log.push("Your friend started a new game.");
    return true;
  }

  #finish(winner, loser) {
    this.phase = Phase.OVER;
    this.result = winner;
    this.log.push(describeWin(winner, loser));
  }
}
