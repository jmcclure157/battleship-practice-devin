import assert from "node:assert/strict";
import { test } from "node:test";

import { Direction, Outcome, PlacementError, ShotError } from "../src/board.js";
import { Phase } from "../src/match.js";
import { OnlineMatch, TAUNTS, TAUNT_GAP_MS, makeGameCode, normalizeGameCode } from "../src/online.js";
import { seededRandom } from "../src/random.js";
import { FLEET } from "../src/ships.js";

// Two matches joined by an in-memory "network" that delivers in order.
function pair(now = Date.now) {
  const sent = [];
  const host = new OnlineMatch((m) => sent.push([guest, m]), { host: true, rng: seededRandom(1), now });
  const guest = new OnlineMatch((m) => sent.push([host, m]), { host: false, rng: seededRandom(2), now });
  const deliver = () => {
    while (sent.length) {
      const [to, message] = sent.shift();
      to.receive(JSON.parse(JSON.stringify(message)));
    }
  };
  return { host, guest, sent, deliver };
}

// Ship n of the fleet on row n, from column 0.
function placeInRows(match) {
  for (let row = 0; row < FLEET.length; row++) match.placeNext([row, 0]);
}

function readyBoth({ host, guest, deliver }) {
  placeInRows(host);
  placeInRows(guest);
  host.start();
  guest.start();
  deliver();
}

test("game codes use only easy-to-read characters and are typed forgivingly", () => {
  const code = makeGameCode(seededRandom(3));
  assert.match(code, /^[A-HJ-NP-Z2-9]{4}$/);
  assert.equal(normalizeGameCode(` ${code.toLowerCase()} `), code);
  assert.equal(normalizeGameCode("AB0O"), null);
  assert.equal(normalizeGameCode("ABC"), null);
  assert.equal(normalizeGameCode(undefined), null);
});

test("the battle starts only once both sides are ready, and the host fires first", () => {
  const net = pair();
  const { host, guest, deliver } = net;
  placeInRows(host);
  assert.throws(() => guest.start(), PlacementError);
  host.start();
  deliver();
  assert.equal(host.phase, Phase.WAITING);
  assert.equal(guest.friendReady, true);
  assert.equal(guest.phase, Phase.PLACING);
  placeInRows(guest);
  guest.start();
  deliver();
  assert.equal(host.phase, Phase.BATTLE);
  assert.equal(guest.phase, Phase.BATTLE);
  assert.equal(host.isHumanTurn, true);
  assert.equal(guest.isHumanTurn, false);
  assert.match(host.log.at(-1), /You fire first/);
  assert.match(guest.log.at(-1), /Your friend fires first/);
});

test("ships are locked once you're ready", () => {
  const net = pair();
  placeInRows(net.host);
  net.host.start();
  assert.throws(() => net.host.moveShip("Destroyer", [9, 0], Direction.HORIZONTAL));
  assert.throws(() => net.host.start());
});

test("a shot is answered by the defender's board and turns alternate", () => {
  const net = pair();
  const { host, guest, deliver } = net;
  readyBoth(net);
  host.fire([0, 0]);
  assert.equal(host.isHumanTurn, false, "waiting for the answer");
  assert.throws(() => host.fire([0, 1]), ShotError);
  deliver();
  assert.equal(host.computer.board.shotAt([0, 0]), Outcome.HIT);
  assert.equal(guest.human.board.shotAt([0, 0]), Outcome.HIT);
  assert.equal(host.log.at(-1), "You fired at A1: hit!");
  assert.equal(guest.log.at(-1), "Friend fired at A1: hit!");
  assert.equal(guest.isHumanTurn, true);
  guest.fire([9, 9]);
  deliver();
  assert.equal(guest.computer.board.shotAt([9, 9]), Outcome.MISS);
  assert.equal(host.isHumanTurn, true);
  assert.throws(() => host.fire([0, 0]), ShotError, "already targeted");
});

test("a hit doesn't reveal the ship; only a sunk ship's squares are sent", () => {
  const net = pair();
  const { host, guest, deliver, sent } = net;
  readyBoth(net);
  host.fire([4, 0]); // the guest's Destroyer is on row 4
  guest.receive(sent.shift()[1]);
  const [, hit] = sent[0];
  assert.deepEqual(hit, { type: "result", coord: [4, 0], outcome: "hit", ship: null });
  deliver();
  guest.fire([9, 9]);
  deliver();
  host.fire([4, 1]);
  deliver();
  const destroyer = host.computer.board.ships.find((s) => s.name === "Destroyer");
  assert.deepEqual(destroyer.cells, [[4, 0], [4, 1]]);
  assert.equal(destroyer.isSunk, true);
  assert.match(host.log.at(-1), /You sunk Friend's Bash Script \(Destroyer\)!/);
  assert.match(guest.log.at(-1), /Friend sunk your Devin Search \(Destroyer\)!/);
});

test("sinking the whole fleet ends the game on both screens", () => {
  const net = pair();
  const { host, guest, deliver } = net;
  readyBoth(net);
  const targets = FLEET.flatMap(([, size], row) => Array.from({ length: size }, (_, col) => [row, col]));
  targets.forEach((coord, i) => {
    host.fire(coord);
    deliver();
    if (i < targets.length - 1) {
      guest.fire([9 - Math.floor(i / 10), i % 10]);
      deliver();
    }
  });
  assert.equal(host.phase, Phase.OVER);
  assert.equal(guest.phase, Phase.OVER);
  assert.equal(host.winner, "You");
  assert.equal(guest.winner, "Friend");
  assert.equal(host.humanWon, true);
  assert.equal(guest.humanWon, false);
  assert.equal(host.log.at(-1), "All of Friend's ships are sunk. You win!");
  assert.equal(guest.log.at(-1), "All of your ships are sunk. Friend wins!");
});

test("play again resets both sides and the other player fires first", () => {
  const net = pair();
  const { host, guest, deliver } = net;
  readyBoth(net);
  host.phase = Phase.OVER;
  guest.phase = Phase.OVER;
  guest.playAgain();
  deliver();
  assert.equal(host.phase, Phase.PLACING);
  assert.equal(guest.phase, Phase.PLACING);
  assert.equal(host.human.board.ships.length, 0);
  assert.equal(host.computer.board.shots.size, 0);
  readyBoth(net);
  assert.equal(guest.isHumanTurn, true);
  assert.equal(host.isHumanTurn, false);
});

test("both pressing play again at once still resets each side once", () => {
  const net = pair();
  const { host, guest, deliver } = net;
  readyBoth(net);
  host.phase = Phase.OVER;
  guest.phase = Phase.OVER;
  host.playAgain();
  guest.playAgain();
  deliver();
  assert.equal(host.round, 2);
  assert.equal(guest.round, 2);
});

test("bad or out-of-turn messages are ignored", () => {
  const net = pair();
  const { host, guest } = net;
  readyBoth(net);
  assert.equal(host.receive(null), false);
  assert.equal(host.receive({ type: "nonsense" }), false);
  assert.equal(host.receive({ type: "shot", coord: [0, 0] }), false, "it's the host's turn");
  assert.equal(guest.receive({ type: "shot", coord: [10, 0] }), false);
  assert.equal(guest.receive({ type: "shot", coord: "A1" }), false);
  assert.equal(host.receive({ type: "result", coord: [0, 0], outcome: "hit" }), false, "no shot pending");
  host.fire([0, 0]);
  assert.equal(host.receive({ type: "result", coord: [5, 5], outcome: "miss" }), false, "wrong square");
  const fakeSink = { type: "result", coord: [0, 0], outcome: "sunk", ship: { name: "Destroyer", cells: [[3, 3], [3, 4]] } };
  assert.equal(host.receive(fakeSink), false, "the sunk ship must cover the shot");
  assert.equal(host.receive({ type: "ready" }), false);
  assert.equal(host.pendingShot !== null, true);
});

test("once the friend leaves, nothing more can be fired", () => {
  const net = pair();
  readyBoth(net);
  assert.equal(net.host.receive({ type: "leave" }), true);
  assert.equal(net.host.friendLeft, true);
  assert.equal(net.host.isHumanTurn, false);
  assert.equal(net.host.receive({ type: "shot", coord: [0, 0] }), false);
});

test("a taunt shows up in both battle logs", () => {
  const { host, guest, deliver } = pair(() => 0);
  assert.equal(host.taunt(0), true);
  deliver();
  assert.equal(host.log.at(-1), `You: ${TAUNTS[0]}`);
  assert.equal(guest.log.at(-1), `Your friend: ${TAUNTS[0]}`);
});

test("taunts have a cooldown, and unknown or flooding ones are refused", () => {
  let clock = 0;
  const { host, guest } = pair(() => clock);
  assert.equal(host.taunt(1), true);
  assert.equal(host.taunt(2), false, "too soon after the last one");
  clock += TAUNT_GAP_MS;
  assert.equal(host.taunt(2), true);
  assert.throws(() => host.taunt(TAUNTS.length));
  assert.throws(() => host.taunt("0"));
  for (const id of [-1, 1.5, "1", TAUNTS.length, null]) {
    assert.equal(guest.receive({ type: "taunt", id }), false);
  }
  assert.equal(guest.receive({ type: "taunt", id: 3 }), true);
  assert.equal(guest.receive({ type: "taunt", id: 3 }), false, "a flood is dropped");
  clock += TAUNT_GAP_MS;
  host.leave();
  assert.equal(host.taunt(0), false, "no taunts once the friend has left");
});
