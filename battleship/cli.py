"""Terminal input/output: parsing, rendering, placement prompts, game loop."""

import os
import random
import re
import sys
from collections.abc import Callable
from functools import partial
from typing import TextIO

from .ai import HuntTargetAI
from .board import BOARD_SIZE, Board, Direction, Outcome, PlacementError, ShotError, ShotResult
from .game import Game, Player
from .ships import FLEET, Coord

InputFn = Callable[[str], str]
OutputFn = Callable[[str], None]
ClearFn = Callable[[], None]

ROW_LABELS = "ABCDEFGHIJ"
COORD_PATTERN = re.compile(r"^\s*([A-Ja-j])\s*(10|[1-9])\s*$")
# Cursor home, clear screen, clear scrollback.
ANSI_CLEAR = "\x1b[H\x1b[2J\x1b[3J"
SCROLLBACK_WARNING = (
    "Note: the screen is cleared between turns, but some terminals keep a history "
    "you can scroll back through. Don't scroll up during the other player's turn."
)


def parse_coord(text: str) -> Coord:
    """'A1' -> (0, 0), 'J10' -> (9, 9). Rows are letters, columns numbers."""
    match = COORD_PATTERN.match(text)
    if not match:
        raise ValueError("Enter a coordinate like A5 or J10 (rows A-J, columns 1-10).")
    return ROW_LABELS.index(match.group(1).upper()), int(match.group(2)) - 1


def parse_direction(text: str) -> Direction:
    value = text.strip().upper()[:1]
    for direction in Direction:
        if direction.value == value:
            return direction
    raise ValueError("Enter H for horizontal or V for vertical.")


def format_coord(coord: Coord) -> str:
    return f"{ROW_LABELS[coord[0]]}{coord[1] + 1}"


def render_grid(board: Board, reveal_ships: bool) -> list[str]:
    """Own grid: S = ship, X = hit, o = miss. Tracking grid hides ships."""
    lines = ["   " + " ".join(f"{c + 1:>2}" for c in range(board.size))]
    for r in range(board.size):
        cells = []
        for c in range(board.size):
            shot = board.shots.get((r, c))
            if shot is Outcome.HIT:
                cells.append(" X")
            elif shot is Outcome.MISS:
                cells.append(" o")
            elif reveal_ships and board.ship_at((r, c)):
                cells.append(" S")
            else:
                cells.append(" .")
        lines.append(f"{ROW_LABELS[r]}  " + " ".join(cells))
    return lines


def render_boards(player: Player, opponent: Player) -> str:
    own = render_grid(player.board, reveal_ships=True)
    tracking = render_grid(opponent.board, reveal_ships=False)
    width = len(own[0])
    header = f"{'YOUR FLEET':<{width}}     SHOTS AT {opponent.name.upper()}"
    rows = [f"{a:<{width}}     {b}" for a, b in zip(own, tracking)]
    return "\n".join([header, *rows])


def describe_shot(result: ShotResult, shooter: str, defender: str) -> str:
    where = format_coord(result.coord)
    if result.outcome is Outcome.MISS:
        return f"{shooter} fired at {where}: miss."
    if result.outcome is Outcome.SUNK:
        assert result.ship is not None
        if defender == "Computer":
            sunk = f'Computer: "You sunk my {result.ship.name}!"'
        else:
            sunk = f"{shooter} sunk {defender}'s {result.ship.name}!"
        return f"{shooter} fired at {where}: hit! {sunk}"
    return f"{shooter} fired at {where}: hit!"


def clear_screen(output_fn: OutputFn = print, stream: TextIO | None = None) -> None:
    """Wipe the screen and its scrollback so the next player can't scroll up to see ships."""
    stream = stream or sys.stdout
    if not stream.isatty():
        output_fn("\n" * 50)
        return
    if os.name == "nt":
        os.system("cls")
        return
    stream.write(ANSI_CLEAR)
    stream.flush()


def ask(prompt: str, parser, input_fn: InputFn, output_fn: OutputFn):
    while True:
        try:
            return parser(input_fn(prompt))
        except ValueError as error:
            output_fn(str(error))


def place_fleet_manually(board: Board, input_fn: InputFn, output_fn: OutputFn) -> None:
    for name, size in FLEET:
        while True:
            output_fn("\n".join(render_grid(board, reveal_ships=True)))
            start = ask(f"{name} ({size} cells) - start coordinate: ", parse_coord, input_fn, output_fn)
            direction = ask("Direction (H/V): ", parse_direction, input_fn, output_fn)
            try:
                board.place_ship(name, size, start, direction)
                break
            except PlacementError as error:
                output_fn(f"Can't place {name} there: {error}")


def setup_player(player: Player, input_fn: InputFn, output_fn: OutputFn, rng: random.Random) -> None:
    output_fn(f"\n{player.name}, place your fleet.")
    choice = ask(
        "Place ships (M)anually or (R)andomly? ",
        lambda t: _choice(t, "MR"),
        input_fn,
        output_fn,
    )
    if choice == "M":
        place_fleet_manually(player.board, input_fn, output_fn)
    else:
        player.board.place_fleet_randomly(rng=rng)
    output_fn("\n".join(render_grid(player.board, reveal_ships=True)))


def _choice(text: str, options: str) -> str:
    value = text.strip().upper()[:1]
    if value and value in options:
        return value
    raise ValueError(f"Please enter one of: {', '.join(options)}.")


def human_turn(game: Game, input_fn: InputFn, output_fn: OutputFn) -> ShotResult:
    shooter, defender = game.current, game.opponent
    output_fn("\n" + render_boards(shooter, defender))
    while True:
        coord = ask(f"{shooter.name}, fire at: ", parse_coord, input_fn, output_fn)
        try:
            result = game.fire(coord)
        except ShotError as error:
            output_fn(str(error))
            continue
        output_fn(describe_shot(result, shooter.name, defender.name))
        return result


def ai_turn(game: Game, ai: HuntTargetAI, output_fn: OutputFn) -> ShotResult:
    shooter, defender = game.current, game.opponent
    result = game.fire(ai.choose_shot())
    ai.record_result(result)
    output_fn(describe_shot(result, shooter.name, defender.name))
    return result


def play(
    input_fn: InputFn = input,
    output_fn: OutputFn = print,
    rng: random.Random | None = None,
    clear_fn: ClearFn | None = None,
) -> Player:
    rng = rng or random.Random()
    if clear_fn is None:
        clear_fn = partial(clear_screen, output_fn)
    output_fn("=== BATTLESHIP ===")
    mode = ask("(1) Play vs computer  (2) Two players: ", lambda t: _choice(t, "12"), input_fn, output_fn)

    if mode == "1":
        human = Player("You")
        computer = Player("Computer", is_ai=True)
        ai = HuntTargetAI(BOARD_SIZE, rng)
        setup_player(human, input_fn, output_fn, rng)
        ai.place_ships(computer.board)
        output_fn("The computer has placed its fleet.")
        game = Game(human, computer)
        while not game.is_over:
            if game.current.is_ai:
                ai_turn(game, ai, output_fn)
            else:
                human_turn(game, input_fn, output_fn)
    else:
        p1, p2 = Player("Player 1"), Player("Player 2")
        output_fn(SCROLLBACK_WARNING)
        for player in (p1, p2):
            setup_player(player, input_fn, output_fn, rng)
            input_fn("Press Enter, then pass to the other player...")
            clear_fn()
        game = Game(p1, p2)
        while not game.is_over:
            input_fn(f"{game.current.name}, press Enter when ready...")
            human_turn(game, input_fn, output_fn)
            if not game.is_over:
                input_fn("Press Enter, then pass to the other player...")
                clear_fn()

    assert game.winner is not None
    output_fn("\n" + render_boards(game.winner, game.opponent))
    output_fn(f"\nAll of {game.opponent.name}'s ships are sunk. {game.winner.name} win{'' if game.winner.name == 'You' else 's'}!")
    return game.winner


def main() -> None:
    try:
        play()
    except (KeyboardInterrupt, EOFError):
        print("\nGoodbye!")
