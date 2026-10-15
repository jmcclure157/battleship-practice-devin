import assert from "node:assert/strict";
import { test } from "node:test";

import { Board, Direction } from "../src/board.js";
import { describeShot, describeWin, formatCoord } from "../src/messages.js";

test("formats coordinates as letter + number", () => {
  assert.equal(formatCoord([0, 0]), "A1");
  assert.equal(formatCoord([1, 6]), "B7");
  assert.equal(formatCoord([9, 9]), "J10");
});

test("describes a miss, a hit, and a sinking", () => {
  const board = new Board();
  board.placeShip("Destroyer", 2, [0, 0], Direction.HORIZONTAL);
  assert.equal(describeShot(board.receiveShot([4, 4]), "You", "Computer"), "You fired at E5: miss.");
  assert.equal(describeShot(board.receiveShot([0, 0]), "You", "Computer"), "You fired at A1: hit!");
  assert.equal(
    describeShot(board.receiveShot([0, 1]), "You", "Computer"),
    'You fired at A2: hit! Computer: "You sunk my Destroyer!"',
  );
});

test("describes the computer sinking your ship", () => {
  const board = new Board();
  board.placeShip("Battleship", 4, [2, 0], Direction.VERTICAL);
  for (const r of [2, 3, 4]) board.receiveShot([r, 0]);
  assert.equal(
    describeShot(board.receiveShot([5, 0]), "Computer", "You"),
    "Computer fired at F1: hit! Computer sunk your Battleship!",
  );
});

test("announces the winner", () => {
  assert.equal(describeWin("You", "Computer"), "All of the Computer's ships are sunk. You win!");
  assert.equal(describeWin("Computer", "You"), "All of your ships are sunk. Computer wins!");
});
