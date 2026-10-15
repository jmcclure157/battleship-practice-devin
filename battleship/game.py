"""Turn order, firing, and win detection for a two-player match."""

from dataclasses import dataclass, field

from .board import Board, ShotResult
from .ships import Coord


@dataclass
class Player:
    name: str
    board: Board = field(default_factory=Board)
    is_ai: bool = False


class GameOverError(RuntimeError):
    pass


class Game:
    def __init__(self, player1: Player, player2: Player):
        self.players = [player1, player2]
        self.current_index = 0
        self.winner: Player | None = None

    @property
    def current(self) -> Player:
        return self.players[self.current_index]

    @property
    def opponent(self) -> Player:
        return self.players[1 - self.current_index]

    @property
    def is_over(self) -> bool:
        return self.winner is not None

    def fire(self, coord: Coord) -> ShotResult:
        """Current player fires at the opponent; turn passes on success."""
        if self.is_over:
            raise GameOverError("The game is already over.")
        result = self.opponent.board.receive_shot(coord)
        if self.opponent.board.all_sunk():
            self.winner = self.current
        else:
            self.current_index = 1 - self.current_index
        return result
