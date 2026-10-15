// A single player's 10x10 ocean: ship placement and incoming shots.

import { choice } from "./random.js";
import { FLEET, Ship, coordKey } from "./ships.js";

export const BOARD_SIZE = 10;

export const Direction = Object.freeze({ HORIZONTAL: "H", VERTICAL: "V" });

export const Outcome = Object.freeze({ MISS: "miss", HIT: "hit", SUNK: "sunk" });

export class PlacementError extends Error {
  name = "PlacementError";
}

export class ShotError extends Error {
  name = "ShotError";
}

export function shipCells([row, col], size, direction) {
  return Array.from({ length: size }, (_, i) =>
    direction === Direction.HORIZONTAL ? [row, col + i] : [row + i, col],
  );
}

export function inBounds([row, col], size = BOARD_SIZE) {
  return row >= 0 && row < size && col >= 0 && col < size;
}

export class Board {
  constructor(size = BOARD_SIZE) {
    this.size = size;
    this.ships = [];
    this.shots = new Map(); // coordKey -> Outcome
  }

  shipAt(coord) {
    return this.ships.find((ship) => ship.occupies(coord)) ?? null;
  }

  shotAt(coord) {
    return this.shots.get(coordKey(coord)) ?? null;
  }

  validatePlacement(cells) {
    for (const cell of cells) {
      if (!inBounds(cell, this.size)) {
        throw new PlacementError("Ship would extend outside the grid.");
      }
      if (this.shipAt(cell) !== null) {
        throw new PlacementError("Ship would overlap another ship.");
      }
    }
  }

  canPlace(size, start, direction) {
    try {
      this.validatePlacement(shipCells(start, size, direction));
      return true;
    } catch (error) {
      if (error instanceof PlacementError) return false;
      throw error;
    }
  }

  placeShip(name, size, start, direction) {
    if (!Number.isInteger(size) || size < 1) {
      throw new PlacementError("Ship size must be at least 1.");
    }
    if (this.ships.some((ship) => ship.name === name)) {
      throw new PlacementError(`${name} has already been placed.`);
    }
    const cells = shipCells(start, size, direction);
    this.validatePlacement(cells);
    const ship = new Ship(name, size, cells);
    this.ships.push(ship);
    return ship;
  }

  // Earlier random choices can box in a later ship, so retry the whole
  // fleet; on failure the board is left as it was.
  placeFleetRandomly(fleet = FLEET, rng = Math.random, attempts = 1000) {
    const existing = [...this.ships];
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        if (this.#tryPlaceFleet(fleet, rng)) return;
      } catch (error) {
        this.ships = [...existing];
        throw error;
      }
      this.ships = [...existing];
    }
    throw new PlacementError("Could not fit the fleet on the board.");
  }

  #tryPlaceFleet(fleet, rng) {
    for (const [name, size] of fleet) {
      const options = [];
      for (const direction of Object.values(Direction)) {
        for (const start of this.allCoords()) {
          if (this.canPlace(size, start, direction)) options.push([start, direction]);
        }
      }
      if (options.length === 0) return false;
      const [start, direction] = choice(rng, options);
      this.placeShip(name, size, start, direction);
    }
    return true;
  }

  allCoords() {
    const coords = [];
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) coords.push([r, c]);
    }
    return coords;
  }

  receiveShot(coord) {
    if (!inBounds(coord, this.size)) {
      throw new ShotError("That coordinate is outside the grid.");
    }
    const key = coordKey(coord);
    if (this.shots.has(key)) {
      throw new ShotError("That coordinate has already been targeted.");
    }
    const ship = this.shipAt(coord);
    if (ship === null) {
      this.shots.set(key, Outcome.MISS);
      return shotResult(coord, Outcome.MISS, null);
    }
    ship.registerHit(coord);
    this.shots.set(key, Outcome.HIT);
    return shotResult(coord, ship.isSunk ? Outcome.SUNK : Outcome.HIT, ship);
  }

  allSunk() {
    return this.ships.length > 0 && this.ships.every((ship) => ship.isSunk);
  }
}

function shotResult(coord, outcome, ship) {
  return Object.freeze({ coord, outcome, ship, isHit: outcome !== Outcome.MISS });
}
