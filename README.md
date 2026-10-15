# Battleship (Python, command line)

The classic Battleship board game, played in your terminal (the text window
where you type commands). Play against the computer, or against a friend on
the same keyboard.

## Requirements

- Python 3.10 or newer. Check with `python3 --version`.
- Nothing else to install: the game and its tests use only Python's built-in
  libraries.

## How to play

From the project folder, run:

```bash
python3 -m battleship
```

1. Choose **1** to play the computer or **2** for two players.
2. Place your fleet: type **R** for random placement, or **M** to place each
   ship yourself. For manual placement you give a start square (like `B3`) and
   a direction: **H** (horizontal, extends to the right) or **V** (vertical,
   extends downward). Ships must fit inside the grid and cannot overlap; if
   one doesn't fit, you're asked again.
3. Take turns firing by typing a square, e.g. `E7`. Rows are letters **A–J**,
   columns are numbers **1–10**.
4. The first player to sink all five of the other side's ships wins.

Each turn shows two grids side by side:

| Symbol | Left grid ("YOUR FLEET") | Right grid ("SHOTS AT ...") |
|--------|--------------------------|-----------------------------|
| `S`    | one of your ships        | (never shown — enemy ships are hidden) |
| `X`    | enemy hit your ship      | your shot hit                |
| `o`    | enemy missed             | your shot missed             |
| `.`    | empty / not fired at yet | not fired at yet             |

The fleet (per player): Carrier (5 squares), Battleship (4), Cruiser (3),
Submarine (3), Destroyer (2).

Press `Ctrl+C` at any time to quit.

## How the computer plays

- **Hunting:** it fires at random squares in a checkerboard pattern. Every
  ship is at least 2 squares long, so it can't hide entirely on the squares
  that get skipped.
- **Targeting:** after a hit, it fires at the squares next to it. Once it has
  two hits in a row, it keeps going along that line until the ship sinks,
  then goes back to hunting.
- Simplification: when it sinks a ship, the game tells it which squares that
  ship was on, so it knows which of its hits are "used up".

## Project layout

| File | What it does |
|------|--------------|
| `battleship/ships.py` | A ship (name, size, squares, hits) and the standard fleet list |
| `battleship/board.py` | One player's 10×10 grid: placing ships with validation, receiving shots (hit / miss / sunk), "all ships sunk?" |
| `battleship/game.py` | Whose turn it is, firing at the opponent, and declaring the winner |
| `battleship/ai.py` | The computer opponent's placement and hunt/target firing strategy |
| `battleship/cli.py` | Everything the player sees and types: reading `B7`-style input, drawing the grids, the game loop |
| `tests/` | Automated tests (one file per module) |

The game rules (`board`, `game`, `ai`) never print or read input; only
`cli.py` does. That keeps the rules easy to test on their own.

## Running the tests

```bash
python3 -m unittest discover -v
```

The tests cover placement validation, hit/miss results, sinking detection,
win detection, the computer's strategy, input parsing, and two complete
scripted games. GitHub Actions (`.github/workflows/ci.yml`) runs the same
command on every pull request.
