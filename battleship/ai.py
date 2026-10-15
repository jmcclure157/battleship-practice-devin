"""Computer opponent: hunt randomly, then target around hits."""

import random

from .board import BOARD_SIZE, Board, ShotResult, in_bounds
from .ships import Coord


class HuntTargetAI:
    """Hunt mode fires at random checkerboard cells (every ship of size >= 2
    must cover one). After a hit it switches to target mode: it tries cells
    next to unresolved hits, preferring to continue along a line of hits."""

    def __init__(self, size: int = BOARD_SIZE, rng: random.Random | None = None):
        self.size = size
        self.rng = rng or random.Random()
        self.tried: set[Coord] = set()
        self.open_hits: list[Coord] = []

    def place_ships(self, board: Board) -> None:
        board.place_fleet_randomly(rng=self.rng)

    def choose_shot(self) -> Coord:
        targets = self._target_candidates()
        if targets:
            return self.rng.choice(targets)
        return self._hunt()

    def record_result(self, result: ShotResult) -> None:
        self.tried.add(result.coord)
        if result.is_hit:
            self.open_hits.append(result.coord)
        if result.ship is not None and result.ship.is_sunk:
            sunk = set(result.ship.cells)
            self.open_hits = [c for c in self.open_hits if c not in sunk]

    def _untried(self, coord: Coord) -> bool:
        return in_bounds(coord, self.size) and coord not in self.tried

    def _target_candidates(self) -> list[Coord]:
        if not self.open_hits:
            return []
        hits = set(self.open_hits)
        line_ends: list[Coord] = []
        for r, c in hits:
            for dr, dc in ((0, 1), (1, 0)):
                if (r + dr, c + dc) in hits:
                    # Walk both ways along the line to its open ends.
                    for sign in (1, -1):
                        nr, nc = r, c
                        while (nr, nc) in hits:
                            nr, nc = nr + sign * dr, nc + sign * dc
                        if self._untried((nr, nc)):
                            line_ends.append((nr, nc))
        if line_ends:
            return sorted(set(line_ends))
        neighbours = {
            (r + dr, c + dc)
            for r, c in hits
            for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1))
        }
        return sorted(n for n in neighbours if self._untried(n))

    def _hunt(self) -> Coord:
        cells = [
            (r, c)
            for r in range(self.size)
            for c in range(self.size)
            if (r, c) not in self.tried
        ]
        parity = [(r, c) for r, c in cells if (r + c) % 2 == 0]
        return self.rng.choice(parity or cells)
