import assert from "node:assert/strict";
import { test } from "node:test";

import { Board, Direction, ShotError } from "../src/board.js";
import { Game, GameOverError, Player } from "../src/game.js";

function makeGame() {
  const p1 = new Player("Alice");
  const p2 = new Player("Bob");
  p1.board.placeShip("Destroyer", 2, [0, 0], Direction.HORIZONTAL);
  p2.board.placeShip("Destroyer", 2, [9, 8], Direction.HORIZONTAL);
  p2.board.placeShip("Submarine", 3, [3, 3], Direction.VERTICAL);
  return [new Game(p1, p2), p1, p2];
}

test("turns alternate after each valid shot", () => {
  const [game, p1, p2] = makeGame();
  assert.equal(game.current, p1);
  game.fire([5, 5]);
  assert.equal(game.current, p2);
  game.fire([5, 5]);
  assert.equal(game.current, p1);
});

test("shots land on the opponent's board", () => {
  const [game, p1, p2] = makeGame();
  game.fire([9, 8]);
  assert.equal(p2.board.shots.size, 1);
  assert.equal(p1.board.shots.size, 0);
});

test("an invalid shot keeps the same player's turn", () => {
  const [game, p1] = makeGame();
  game.fire([4, 4]);
  game.fire([4, 4]);
  assert.equal(game.current, p1);
  assert.throws(() => game.fire([4, 4]), ShotError);
  assert.equal(game.current, p1);
});

test("sinking one ship is not a win; sinking the last ship is", () => {
  const [game, p1] = makeGame();
  const p1Shots = [[9, 8], [9, 9], [3, 3], [4, 3], [5, 3]];
  const p2Shots = [[7, 7], [7, 8], [7, 9], [8, 7]];
  for (let i = 0; i < p1Shots.length; i++) {
    assert.equal(game.isOver, false);
    game.fire(p1Shots[i]);
    if (i < p2Shots.length) game.fire(p2Shots[i]);
  }
  assert.equal(game.isOver, true);
  assert.equal(game.winner, p1);
});

test("no shots are allowed after the game is over", () => {
  const p1 = new Player("A");
  const p2 = new Player("B", new Board());
  p2.board.placeShip("Destroyer", 2, [0, 0], Direction.HORIZONTAL);
  const game = new Game(p1, p2);
  game.fire([0, 0]);
  game.fire([5, 5]);
  game.fire([0, 1]);
  assert.equal(game.winner, p1);
  assert.throws(() => game.fire([2, 2]), GameOverError);
});
