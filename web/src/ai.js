// Computer opponent: hunt randomly, then target around hits.
//
// Hunt mode fires at random checkerboard cells (every ship of size >= 2 must
// cover one). After a hit it switches to target mode: it tries cells next to
// unresolved hits, preferring to continue along a line of hits.

import { BOARD_SIZE, inBounds } from "./board.js";
import { choice } from "./random.js";
import { coordKey } from "./ships.js";

const STEPS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

export class HuntTargetAI {
  constructor(size = BOARD_SIZE, rng = Math.random) {
    this.size = size;
    this.rng = rng;
    this.tried = new Set(); // coordKeys
    this.openHits = []; // coords hit but not yet part of a sunk ship
  }

  placeShips(board) {
    board.placeFleetRandomly(undefined, this.rng);
  }

  chooseShot() {
    const targets = this.targetCandidates();
    return targets.length > 0 ? choice(this.rng, targets) : this.#hunt();
  }

  recordResult(result) {
    this.tried.add(coordKey(result.coord));
    if (result.isHit) this.openHits.push(result.coord);
    if (result.ship !== null && result.ship.isSunk) {
      const sunk = new Set(result.ship.cells.map(coordKey));
      this.openHits = this.openHits.filter((c) => !sunk.has(coordKey(c)));
    }
  }

  #untried(coord) {
    return inBounds(coord, this.size) && !this.tried.has(coordKey(coord));
  }

  targetCandidates() {
    if (this.openHits.length === 0) return [];
    const hits = new Set(this.openHits.map(coordKey));
    const lineEnds = new Map();
    for (const [r, c] of this.openHits) {
      for (const [dr, dc] of [[0, 1], [1, 0]]) {
        if (!hits.has(coordKey([r + dr, c + dc]))) continue;
        // Walk both ways along the line to its open ends.
        for (const sign of [1, -1]) {
          let [nr, nc] = [r, c];
          while (hits.has(coordKey([nr, nc]))) {
            nr += sign * dr;
            nc += sign * dc;
          }
          if (this.#untried([nr, nc])) lineEnds.set(coordKey([nr, nc]), [nr, nc]);
        }
      }
    }
    if (lineEnds.size > 0) return sortCoords([...lineEnds.values()]);
    const neighbours = new Map();
    for (const [r, c] of this.openHits) {
      for (const [dr, dc] of STEPS) {
        const n = [r + dr, c + dc];
        if (this.#untried(n)) neighbours.set(coordKey(n), n);
      }
    }
    return sortCoords([...neighbours.values()]);
  }

  #hunt() {
    const cells = [];
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (!this.tried.has(coordKey([r, c]))) cells.push([r, c]);
      }
    }
    const parity = cells.filter(([r, c]) => (r + c) % 2 === 0);
    return choice(this.rng, parity.length > 0 ? parity : cells);
  }
}

function sortCoords(coords) {
  return coords.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}
