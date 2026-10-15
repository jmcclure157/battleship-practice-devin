import assert from "node:assert/strict";
import { test } from "node:test";

import { HuntTargetAI } from "../src/ai.js";
import { Board, Direction } from "../src/board.js";
import { seededRandom } from "../src/random.js";
import { FLEET, coordKey } from "../src/ships.js";

const asKeys = (coords) => new Set(coords.map(coordKey));

test("hunting uses a checkerboard pattern", () => {
  const ai = new HuntTargetAI(10, seededRandom(1));
  for (let i = 0; i < 20; i++) {
    const [r, c] = ai.chooseShot();
    assert.equal((r + c) % 2, 0);
    ai.tried.add(coordKey([r, c]));
  }
});

test("targets the neighbours of a hit", () => {
  const board = new Board();
  board.placeShip("Cruiser", 3, [5, 5], Direction.HORIZONTAL);
  const ai = new HuntTargetAI(10, seededRandom(0));
  ai.recordResult(board.receiveShot([5, 6]));
  const allowed = asKeys([[4, 6], [6, 6], [5, 5], [5, 7]]);
  assert.ok(allowed.has(coordKey(ai.chooseShot())));
});

test("follows the line after two hits in a row", () => {
  const board = new Board();
  board.placeShip("Carrier", 5, [2, 2], Direction.VERTICAL);
  const ai = new HuntTargetAI(10, seededRandom(0));
  ai.recordResult(board.receiveShot([3, 2]));
  ai.recordResult(board.receiveShot([4, 2]));
  assert.deepEqual(ai.targetCandidates(), [[2, 2], [5, 2]]);
});

test("goes back to hunting after sinking a ship", () => {
  const board = new Board();
  board.placeShip("Destroyer", 2, [0, 0], Direction.HORIZONTAL);
  const ai = new HuntTargetAI(10, seededRandom(0));
  ai.recordResult(board.receiveShot([0, 0]));
  ai.recordResult(board.receiveShot([0, 1]));
  assert.deepEqual(ai.openHits, []);
});

test("sinks a full fleet without repeating a shot", () => {
  for (let seed = 0; seed < 20; seed++) {
    const rng = seededRandom(seed);
    const board = new Board();
    board.placeFleetRandomly(FLEET, rng);
    const ai = new HuntTargetAI(10, rng);
    let shots = 0;
    while (!board.allSunk()) {
      ai.recordResult(board.receiveShot(ai.chooseShot())); // throws on a repeat
      shots++;
    }
    assert.ok(shots <= 100);
  }
});

test("beats a purely random shooter on average", () => {
  function shotsToWin(seed, smart) {
    const rng = seededRandom(seed);
    const board = new Board();
    board.placeFleetRandomly(FLEET, rng);
    const order = board.allCoords();
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const ai = new HuntTargetAI(10, rng);
    let n = 0;
    while (!board.allSunk()) {
      const result = board.receiveShot(smart ? ai.chooseShot() : order[n]);
      ai.recordResult(result);
      n++;
    }
    return n;
  }
  const average = (smart) =>
    Array.from({ length: 30 }, (_, s) => shotsToWin(s, smart)).reduce((a, b) => a + b) / 30;
  assert.ok(average(true) < average(false) - 20);
});
