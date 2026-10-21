# Battleship

The classic Battleship board game, in two versions:

- **Web version** — play against the computer, or a friend on another
  computer, in your browser by clicking squares. Nothing to install. See
  [Web version](#web-version).
- **Command-line version** — played in your terminal (the text window where
  you type commands), against the computer or a friend on the same keyboard.

## Web version

Open the game's web page (hosted for free by GitHub Pages):
**https://jmcclure157.github.io/battleship-practice-devin/**

1. Place your 5 ships on **Your fleet**: hover over a square to preview where
   the highlighted ship would go (green = fits, red = doesn't), then click to
   drop it. Press **R** or the **Direction** button to turn it between
   horizontal and vertical. Or click **Place randomly**.
   Until the battle starts you can still change your fleet: drag any placed
   ship to a new spot (press **R** while dragging to turn it), or click a ship
   to turn it in place. A drop that doesn't fit leaves the ship where it was.
2. Press **Start battle**, then click squares in **Enemy waters** to fire.
   The computer fires back after each of your shots.
3. Sink all 5 enemy ships before the computer sinks yours. **Play again**
   starts a new game.

The whole game runs inside the page (in JavaScript, the language browsers
understand), so there is no game server and nothing is saved anywhere.

### Playing a friend online

1. Click **Play a friend online**. The page shows a 4-character game code
   (like `K7Q2`) and a link. Send either one to your friend and keep the page
   open.
2. Your friend opens the link, or opens the page, clicks **Join a friend** and
   types the code.
3. You each place your ships and press **Ready**. The friend who made the code
   fires first in the first game; after that, the first shot alternates.

When your friend connects, the online bar turns green with "Your friend joined!",
plays a short chime, and (if the page is in a background tab) the tab title
changes. During the battle a banner above the boards shows whose turn it is:
green "Your turn" with Enemy waters glowing, or "Friend's turn" with your fleet
outlined in red. Every hit shows a short explosion on its square.

How it works: the two browsers connect directly to each other using WebRTC
(a feature built into browsers for live connections between them), through
the [PeerJS](https://peerjs.com) library. PeerJS's free public server only
introduces the two browsers; if a firewall blocks the direct route, PeerJS's
relay server passes the messages along instead. Each browser keeps its own
ships: when your friend fires, their browser asks yours "hit or miss?", and a
ship's squares are sent only once it sinks, so nobody can peek. Some work or
school networks block these connections; the page then says it couldn't
connect.

### How the web version is built

The browser can't run Python, so `web/src/` is a JavaScript copy of the same
rules, file for file, with the same tests ported to JavaScript:

| File | What it does |
|------|--------------|
| `web/index.html`, `web/style.css` | The page layout and its look |
| `web/src/ships.js`, `board.js`, `game.js`, `ai.js` | Same jobs as the Python files of the same names |
| `web/src/messages.js` | The battle-log sentences ("You sunk my Battleship!") |
| `web/src/match.js` | One human-vs-computer game from placement to the last shot |
| `web/src/online.js` | One game against a friend: the ready / shot / result messages the two browsers swap |
| `web/src/net.js` | The browser-to-browser connection (game codes, joining, leaving), using PeerJS |
| `web/src/vendor/peerjs.min.js` | A copy of PeerJS 1.5.5 (MIT license), loaded only for online play |
| `web/src/ui.js` | The only page code: draws the grids and turns clicks into moves |
| `web/test/` | Automated tests, run with Node.js's built-in test runner |

To run the web tests on a computer with [Node.js](https://nodejs.org) 20+:

```bash
cd web
npm test
```

`.github/workflows/pages.yml` publishes the page each time `main` changes.
It needs GitHub Pages turned on once: repo **Settings → Pages → Source:
GitHub Actions**.

# Command-line version

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

In two-player mode the screen (and the terminal's scroll-back history, where
supported) is wiped each time you pass the keyboard, so the other player can't
scroll up to see your ships.

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
command, plus the web tests, on every pull request.
