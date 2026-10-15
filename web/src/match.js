// One human-vs-computer match, from ship placement to the final shot.
// No page code here: ui.js calls these methods and redraws, which keeps the
// whole flow testable without a browser.

import { HuntTargetAI } from "./ai.js";
import { BOARD_SIZE, Board, Direction, PlacementError, ShotError, inBounds, shipCells } from "./board.js";
import { Game, Player } from "./game.js";
import { describeShot, describeWin } from "./messages.js";
import { FLEET } from "./ships.js";

export const Phase = Object.freeze({ PLACING: "placing", BATTLE: "battle", OVER: "over" });

export class Match {
  constructor(rng = Math.random) {
    this.rng = rng;
    this.reset();
  }

  reset() {
    this.human = new Player("You");
    this.computer = new Player("Computer", new Board(), true);
    this.ai = new HuntTargetAI(BOARD_SIZE, this.rng);
    this.ai.placeShips(this.computer.board);
    this.phase = Phase.PLACING;
    this.direction = Direction.HORIZONTAL;
    this.game = null;
    this.log = [];
  }

  // The next ship to place as [name, size], or null once the fleet is down.
  get nextShip() {
    const placed = new Set(this.human.board.ships.map((ship) => ship.name));
    return FLEET.find(([name]) => !placed.has(name)) ?? null;
  }

  get winner() {
    return this.game?.winner ?? null;
  }

  get isHumanTurn() {
    return this.phase === Phase.BATTLE && this.game.current === this.human;
  }

  rotate() {
    this.#requirePhase(Phase.PLACING);
    this.direction =
      this.direction === Direction.HORIZONTAL ? Direction.VERTICAL : Direction.HORIZONTAL;
  }

  // Where the next ship would go if placed at `start`, for the hover preview.
  preview(start) {
    const next = this.nextShip;
    if (this.phase !== Phase.PLACING || next === null) return null;
    const [, size] = next;
    return {
      cells: shipCells(start, size, this.direction).filter((cell) => inBounds(cell)),
      valid: this.human.board.canPlace(size, start, this.direction),
    };
  }

  placeNext(start) {
    this.#requirePhase(Phase.PLACING);
    const next = this.nextShip;
    if (next === null) throw new PlacementError("All your ships are already placed.");
    const [name, size] = next;
    return this.human.board.placeShip(name, size, start, this.direction);
  }

  placeRandomly() {
    this.#requirePhase(Phase.PLACING);
    const board = new Board();
    board.placeFleetRandomly(FLEET, this.rng);
    this.human.board = board;
  }

  clear() {
    this.#requirePhase(Phase.PLACING);
    this.human.board = new Board();
  }

  start() {
    this.#requirePhase(Phase.PLACING);
    if (this.nextShip !== null) throw new PlacementError("Place all your ships first.");
    this.game = new Game(this.human, this.computer);
    this.phase = Phase.BATTLE;
    this.log.push("The computer has placed its fleet. You fire first.");
  }

  fire(coord) {
    if (!this.isHumanTurn) throw new ShotError("It's not your turn.");
    return this.#record(this.game.fire(coord), this.human, this.computer);
  }

  computerTurn() {
    if (this.phase !== Phase.BATTLE || this.game.current !== this.computer) {
      throw new ShotError("It's not the computer's turn.");
    }
    const result = this.game.fire(this.ai.chooseShot());
    this.ai.recordResult(result);
    return this.#record(result, this.computer, this.human);
  }

  #record(result, shooter, defender) {
    this.log.push(describeShot(result, shooter.name, defender.name));
    if (this.game.isOver) {
      this.phase = Phase.OVER;
      this.log.push(describeWin(shooter.name, defender.name));
    }
    return result;
  }

  #requirePhase(phase) {
    if (this.phase !== phase) throw new Error(`Only allowed while ${phase}.`);
  }
}
