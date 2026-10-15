// Turn order, firing, and win detection for a two-player match.

import { Board } from "./board.js";

export class Player {
  constructor(name, board = new Board(), isAI = false) {
    this.name = name;
    this.board = board;
    this.isAI = isAI;
  }
}

export class GameOverError extends Error {
  name = "GameOverError";
}

export class Game {
  constructor(player1, player2) {
    this.players = [player1, player2];
    this.currentIndex = 0;
    this.winner = null;
  }

  get current() {
    return this.players[this.currentIndex];
  }

  get opponent() {
    return this.players[1 - this.currentIndex];
  }

  get isOver() {
    return this.winner !== null;
  }

  // Current player fires at the opponent; the turn passes on success.
  fire(coord) {
    if (this.isOver) throw new GameOverError("The game is already over.");
    const result = this.opponent.board.receiveShot(coord);
    if (this.opponent.board.allSunk()) {
      this.winner = this.current;
    } else {
      this.currentIndex = 1 - this.currentIndex;
    }
    return result;
  }
}
