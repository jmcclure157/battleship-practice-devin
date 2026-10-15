import assert from "node:assert/strict";
import { test } from "node:test";

import { Direction, PlacementError, ShotError } from "../src/board.js";
import { Match, Phase } from "../src/match.js";
import { seededRandom } from "../src/random.js";

test("the computer's fleet is placed as soon as a match starts", () => {
  const match = new Match(seededRandom(0));
  assert.equal(match.computer.board.ships.length, 5);
  assert.equal(match.human.board.ships.length, 0);
  assert.equal(match.phase, Phase.PLACING);
});

test("manual placement goes through the fleet in order", () => {
  const match = new Match(seededRandom(0));
  assert.deepEqual(match.nextShip, ["Carrier", 5]);
  match.placeNext([0, 0]);
  assert.deepEqual(match.nextShip, ["Battleship", 4]);
  match.rotate();
  assert.equal(match.direction, Direction.VERTICAL);
  const battleship = match.placeNext([2, 0]);
  assert.deepEqual(battleship.cells, [[2, 0], [3, 0], [4, 0], [5, 0]]);
});

test("a bad placement is refused and the same ship stays next", () => {
  const match = new Match(seededRandom(0));
  match.placeNext([0, 0]);
  assert.throws(() => match.placeNext([0, 2]), PlacementError); // overlaps the Carrier
  assert.throws(() => match.placeNext([0, 8]), PlacementError); // runs off the grid
  assert.deepEqual(match.nextShip, ["Battleship", 4]);
  assert.equal(match.human.board.ships.length, 1);
});

test("the hover preview marks bad spots and clips at the edge", () => {
  const match = new Match(seededRandom(0));
  assert.deepEqual(match.preview([0, 0]), {
    cells: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]],
    valid: true,
  });
  assert.deepEqual(match.preview([0, 8]), { cells: [[0, 8], [0, 9]], valid: false });
});

test("the battle can't start until every ship is placed", () => {
  const match = new Match(seededRandom(0));
  assert.throws(() => match.start(), PlacementError);
  assert.throws(() => match.fire([0, 0]), ShotError);
  match.placeRandomly();
  assert.equal(match.nextShip, null);
  match.start();
  assert.equal(match.phase, Phase.BATTLE);
  assert.throws(() => match.placeRandomly());
});

test("clear removes your ships so you can start over", () => {
  const match = new Match(seededRandom(0));
  match.placeRandomly();
  match.clear();
  assert.equal(match.human.board.ships.length, 0);
  assert.deepEqual(match.nextShip, ["Carrier", 5]);
});

test("you and the computer take turns", () => {
  const match = new Match(seededRandom(0));
  match.placeRandomly();
  match.start();
  assert.equal(match.isHumanTurn, true);
  match.fire([0, 0]);
  assert.equal(match.isHumanTurn, false);
  assert.throws(() => match.fire([0, 1]), ShotError);
  match.computerTurn();
  assert.equal(match.isHumanTurn, true);
  assert.throws(() => match.computerTurn(), ShotError);
  assert.equal(match.log.length, 3);
});

test("a repeated shot is refused and it's still your turn", () => {
  const match = new Match(seededRandom(0));
  match.placeRandomly();
  match.start();
  match.fire([0, 0]);
  match.computerTurn();
  assert.throws(() => match.fire([0, 0]), ShotError);
  assert.equal(match.isHumanTurn, true);
});

test("a full game ends with a winner announced", () => {
  for (let seed = 0; seed < 10; seed++) {
    const match = new Match(seededRandom(seed));
    match.placeRandomly();
    match.start();
    const targets = match.computer.board.allCoords();
    while (match.phase === Phase.BATTLE) {
      match.fire(targets.shift());
      if (match.phase === Phase.BATTLE) match.computerTurn();
    }
    assert.equal(match.phase, Phase.OVER);
    assert.ok(match.winner === match.human || match.winner === match.computer);
    assert.match(match.log.at(-1), /ships are sunk\. (You win|Computer wins)!$/);
    assert.throws(() => match.fire(targets[0]), ShotError);
  }
});

test("play again starts a fresh match", () => {
  const match = new Match(seededRandom(0));
  match.placeRandomly();
  match.start();
  match.fire([0, 0]);
  match.reset();
  assert.equal(match.phase, Phase.PLACING);
  assert.equal(match.human.board.ships.length, 0);
  assert.equal(match.computer.board.shots.size, 0);
  assert.deepEqual(match.log, []);
});

test("ships placed randomly can be dragged somewhere else before the battle", () => {
  const match = new Match(seededRandom(3));
  match.placeRandomly();
  const board = match.human.board;
  const destroyer = board.ships.find((ship) => ship.name === "Destroyer");
  const target = board
    .allCoords()
    .find((coord) => board.shipAt(coord) === null && board.canPlace(2, coord, Direction.VERTICAL, destroyer));
  assert.equal(match.previewMove("Destroyer", target, Direction.VERTICAL).valid, true);
  match.moveShip("Destroyer", target, Direction.VERTICAL);
  assert.equal(board.shipAt(target), destroyer);
  assert.equal(board.ships.length, 5);
  assert.equal(match.nextShip, null);
});

test("the drag preview marks a bad drop and clips at the edge", () => {
  const match = new Match(seededRandom(0));
  match.placeNext([0, 0]); // Carrier
  match.placeNext([2, 0]); // Battleship
  assert.deepEqual(match.previewMove("Battleship", [2, 8], Direction.HORIZONTAL), {
    cells: [[2, 8], [2, 9]],
    valid: false,
  });
  assert.equal(match.previewMove("Battleship", [0, 6], Direction.VERTICAL).valid, true);
  assert.equal(match.previewMove("Battleship", [0, 4], Direction.VERTICAL).valid, false);
  assert.equal(match.previewMove("Cruiser", [5, 5], Direction.HORIZONTAL), null); // not placed yet
});

test("ships are locked once the battle starts", () => {
  const match = new Match(seededRandom(0));
  match.placeRandomly();
  match.start();
  const [ship] = match.human.board.ships;
  assert.throws(() => match.moveShip(ship.name, [0, 0], Direction.HORIZONTAL), /placing/);
  assert.equal(match.previewMove(ship.name, [0, 0], Direction.HORIZONTAL), null);
});
