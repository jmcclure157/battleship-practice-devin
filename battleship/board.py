"""A single player's 10x10 ocean: ship placement and incoming shots."""

import random
from dataclasses import dataclass
from enum import Enum

from .ships import FLEET, Coord, Ship

BOARD_SIZE = 10


class Direction(Enum):
    HORIZONTAL = "H"
    VERTICAL = "V"


class PlacementError(ValueError):
    """Raised when a ship would leave the grid or overlap another ship."""


class ShotError(ValueError):
    """Raised for shots off the grid or at an already-targeted cell."""


class Outcome(Enum):
    MISS = "miss"
    HIT = "hit"
    SUNK = "sunk"


@dataclass(frozen=True)
class ShotResult:
    coord: Coord
    outcome: Outcome
    ship: Ship | None = None

    @property
    def is_hit(self) -> bool:
        return self.outcome in (Outcome.HIT, Outcome.SUNK)


def ship_cells(start: Coord, size: int, direction: Direction) -> list[Coord]:
    row, col = start
    if direction is Direction.HORIZONTAL:
        return [(row, col + i) for i in range(size)]
    return [(row + i, col) for i in range(size)]


def in_bounds(coord: Coord, size: int = BOARD_SIZE) -> bool:
    row, col = coord
    return 0 <= row < size and 0 <= col < size


class Board:
    def __init__(self, size: int = BOARD_SIZE):
        self.size = size
        self.ships: list[Ship] = []
        self.shots: dict[Coord, Outcome] = {}

    def ship_at(self, coord: Coord) -> Ship | None:
        for ship in self.ships:
            if ship.occupies(coord):
                return ship
        return None

    def validate_placement(self, cells: list[Coord]) -> None:
        for cell in cells:
            if not in_bounds(cell, self.size):
                raise PlacementError("Ship would extend outside the grid.")
            if self.ship_at(cell) is not None:
                raise PlacementError("Ship would overlap another ship.")

    def can_place(self, size: int, start: Coord, direction: Direction) -> bool:
        try:
            self.validate_placement(ship_cells(start, size, direction))
        except PlacementError:
            return False
        return True

    def place_ship(self, name: str, size: int, start: Coord, direction: Direction) -> Ship:
        if size < 1:
            raise PlacementError("Ship size must be at least 1.")
        if any(ship.name == name for ship in self.ships):
            raise PlacementError(f"{name} has already been placed.")
        cells = ship_cells(start, size, direction)
        self.validate_placement(cells)
        ship = Ship(name, size, cells)
        self.ships.append(ship)
        return ship

    def place_fleet_randomly(
        self,
        fleet: list[tuple[str, int]] = FLEET,
        rng: random.Random | None = None,
        attempts: int = 1000,
    ) -> None:
        """Earlier random choices can box in a later ship, so retry the whole
        fleet; on failure the board is left as it was."""
        rng = rng or random.Random()
        existing = list(self.ships)
        for _attempt in range(attempts):
            try:
                if self._try_place_fleet(fleet, rng):
                    return
            except PlacementError:
                self.ships = list(existing)
                raise
            self.ships = list(existing)
        raise PlacementError("Could not fit the fleet on the board.")

    def _try_place_fleet(self, fleet: list[tuple[str, int]], rng: random.Random) -> bool:
        for name, size in fleet:
            options = [
                (start, direction)
                for direction in Direction
                for start in self.all_coords()
                if self.can_place(size, start, direction)
            ]
            if not options:
                return False
            start, direction = rng.choice(options)
            self.place_ship(name, size, start, direction)
        return True

    def all_coords(self) -> list[Coord]:
        return [(r, c) for r in range(self.size) for c in range(self.size)]

    def receive_shot(self, coord: Coord) -> ShotResult:
        if not in_bounds(coord, self.size):
            raise ShotError("That coordinate is outside the grid.")
        if coord in self.shots:
            raise ShotError("That coordinate has already been targeted.")
        ship = self.ship_at(coord)
        if ship is None:
            self.shots[coord] = Outcome.MISS
            return ShotResult(coord, Outcome.MISS)
        ship.register_hit(coord)
        self.shots[coord] = Outcome.HIT
        outcome = Outcome.SUNK if ship.is_sunk else Outcome.HIT
        return ShotResult(coord, outcome, ship)

    def all_sunk(self) -> bool:
        return bool(self.ships) and all(ship.is_sunk for ship in self.ships)
