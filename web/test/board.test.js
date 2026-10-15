import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { Board, Direction, Outcome, PlacementError, ShotError } from "../src/board.js";
import { seededRandom } from "../src/random.js";
import { FLEET } from "../src/ships.js";

const H = Direction.HORIZONTAL;
const V = Direction.VERTICAL;

function throwsWith(fn, ErrorType, pattern) {
  assert.throws(fn, (error) => error instanceof ErrorType && pattern.test(error.message));
}

describe("placement validation", () => {
  test("places horizontal and vertical ships", () => {
    const board = new Board();
    const carrier = board.placeShip("Carrier", 5, [0, 0], H);
    const sub = board.placeShip("Submarine", 3, [2, 4], V);
    assert.deepEqual(carrier.cells, [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]]);
    assert.deepEqual(sub.cells, [[2, 4], [3, 4], [4, 4]]);
  });

  test("allows a ship touching the far edges", () => {
    const board = new Board();
    board.placeShip("Destroyer", 2, [9, 8], H);
    board.placeShip("Cruiser", 3, [7, 0], V);
    assert.equal(board.ships.length, 2);
  });

  test("rejects ships that leave the grid", () => {
    const board = new Board();
    throwsWith(() => board.placeShip("Carrier", 5, [0, 6], H), PlacementError, /outside/);
    throwsWith(() => board.placeShip("Carrier", 5, [6, 0], V), PlacementError, /outside/);
    throwsWith(() => board.placeShip("Destroyer", 2, [-1, 0], V), PlacementError, /outside/);
  });

  test("rejects overlapping ships and leaves the board unchanged", () => {
    const board = new Board();
    board.placeShip("Battleship", 4, [3, 3], H);
    throwsWith(() => board.placeShip("Cruiser", 3, [1, 5], V), PlacementError, /overlap/);
    assert.deepEqual(board.ships.map((s) => s.name), ["Battleship"]);
  });

  test("rejects placing the same ship twice", () => {
    const board = new Board();
    board.placeShip("Destroyer", 2, [0, 0], H);
    throwsWith(() => board.placeShip("Destroyer", 2, [5, 5], H), PlacementError, /already/);
  });

  test("rejects zero, negative, or fractional sizes", () => {
    const board = new Board();
    for (const size of [0, -2, 1.5]) {
      throwsWith(() => board.placeShip("Ghost", size, [0, 0], H), PlacementError, /at least 1/);
    }
    assert.deepEqual(board.ships, []);
  });
});

describe("random placement", () => {
  test("places the full fleet with no overlaps, inside the grid", () => {
    for (let seed = 0; seed < 25; seed++) {
      const board = new Board();
      board.placeFleetRandomly(FLEET, seededRandom(seed));
      assert.deepEqual(board.ships.map((s) => s.name), FLEET.map(([name]) => name));
      const cells = board.ships.flatMap((s) => s.cells.map(([r, c]) => `${r},${c}`));
      assert.equal(new Set(cells).size, 17);
      for (const ship of board.ships) {
        for (const [r, c] of ship.cells) assert.ok(r >= 0 && r < 10 && c >= 0 && c < 10);
      }
    }
  });

  test("retries when early ships box in a later one", () => {
    const fleet = [["A", 3], ["B", 2], ["C", 2], ["D", 2]];
    let oneTryFailures = 0;
    for (let seed = 0; seed < 50; seed++) {
      try {
        new Board(3).placeFleetRandomly(fleet, seededRandom(seed), 1);
      } catch (error) {
        assert.ok(error instanceof PlacementError);
        oneTryFailures++;
      }
      const board = new Board(3);
      board.placeFleetRandomly(fleet, seededRandom(seed));
      assert.equal(board.ships.length, 4);
    }
    assert.ok(oneTryFailures > 0, "the crowded fleet should sometimes box itself in");
  });

  test("leaves the board unchanged when the fleet cannot fit", () => {
    const board = new Board(3);
    assert.throws(
      () => board.placeFleetRandomly([["A", 3], ["B", 3], ["C", 3], ["D", 1]], seededRandom(0), 5),
      PlacementError,
    );
    assert.deepEqual(board.ships, []);
  });

  test("leaves the board unchanged when the fleet list is invalid", () => {
    for (const fleet of [[["A", 3], ["Ghost", 0]], [["A", 3], ["A", 2]]]) {
      const board = new Board();
      assert.throws(() => board.placeFleetRandomly(fleet, seededRandom(0)), PlacementError);
      assert.deepEqual(board.ships, []);
    }
  });
});

describe("shots", () => {
  test("reports a miss on empty water", () => {
    const board = new Board();
    board.placeShip("Destroyer", 2, [0, 0], H);
    const result = board.receiveShot([5, 5]);
    assert.equal(result.outcome, Outcome.MISS);
    assert.equal(result.isHit, false);
    assert.equal(result.ship, null);
    assert.equal(board.shotAt([5, 5]), Outcome.MISS);
  });

  test("reports a hit on a ship", () => {
    const board = new Board();
    const ship = board.placeShip("Cruiser", 3, [4, 4], V);
    const result = board.receiveShot([5, 4]);
    assert.equal(result.outcome, Outcome.HIT);
    assert.equal(result.ship, ship);
    assert.equal(board.shotAt([5, 4]), Outcome.HIT);
  });

  test("rejects repeated and off-grid shots", () => {
    const board = new Board();
    board.receiveShot([1, 1]);
    throwsWith(() => board.receiveShot([1, 1]), ShotError, /already/);
    throwsWith(() => board.receiveShot([10, 0]), ShotError, /outside/);
  });

  test("a ship sinks only when its last cell is hit", () => {
    const board = new Board();
    const ship = board.placeShip("Battleship", 4, [2, 2], H);
    for (const col of [2, 3, 4]) {
      assert.equal(board.receiveShot([2, col]).outcome, Outcome.HIT);
      assert.equal(ship.isSunk, false);
    }
    assert.equal(board.receiveShot([2, 5]).outcome, Outcome.SUNK);
    assert.equal(ship.isSunk, true);
  });

  test("allSunk is true only after every ship sinks", () => {
    const board = new Board();
    board.placeShip("Destroyer", 2, [0, 0], H);
    board.placeShip("Submarine", 3, [5, 5], V);
    for (const coord of [[0, 0], [0, 1], [5, 5], [6, 5]]) board.receiveShot(coord);
    assert.equal(board.allSunk(), false);
    board.receiveShot([7, 5]);
    assert.equal(board.allSunk(), true);
  });

  test("an empty board is not 'all sunk'", () => {
    assert.equal(new Board().allSunk(), false);
  });
});
