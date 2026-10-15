// Ship definitions and the standard fleet.
// A coordinate is [row, col], both 0-based: "A1" is [0, 0], "J10" is [9, 9].

export const FLEET = Object.freeze([
  ["Carrier", 5],
  ["Battleship", 4],
  ["Cruiser", 3],
  ["Submarine", 3],
  ["Destroyer", 2],
]);

export function coordKey([row, col]) {
  return `${row},${col}`;
}

export class Ship {
  constructor(name, size, cells = []) {
    this.name = name;
    this.size = size;
    this.cells = cells;
    this.hits = new Set();
  }

  occupies(coord) {
    const key = coordKey(coord);
    return this.cells.some((cell) => coordKey(cell) === key);
  }

  registerHit(coord) {
    if (this.occupies(coord)) this.hits.add(coordKey(coord));
  }

  get isSunk() {
    return this.cells.length > 0 && this.hits.size === this.cells.length;
  }
}
