"""Ship definitions and the standard fleet."""

from dataclasses import dataclass, field

Coord = tuple[int, int]

FLEET: list[tuple[str, int]] = [
    ("Carrier", 5),
    ("Battleship", 4),
    ("Cruiser", 3),
    ("Submarine", 3),
    ("Destroyer", 2),
]


@dataclass
class Ship:
    name: str
    size: int
    cells: list[Coord] = field(default_factory=list)
    hits: set[Coord] = field(default_factory=set)

    def occupies(self, coord: Coord) -> bool:
        return coord in self.cells

    def register_hit(self, coord: Coord) -> None:
        if coord in self.cells:
            self.hits.add(coord)

    @property
    def is_sunk(self) -> bool:
        return bool(self.cells) and self.hits == set(self.cells)
