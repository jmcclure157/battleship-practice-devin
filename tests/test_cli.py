import io
import random
import unittest
from unittest import mock

from battleship import cli
from battleship.board import Direction
from battleship.ships import FLEET


class ParsingTests(unittest.TestCase):
    def test_parse_coord(self):
        self.assertEqual(cli.parse_coord("A1"), (0, 0))
        self.assertEqual(cli.parse_coord(" j10 "), (9, 9))
        self.assertEqual(cli.parse_coord("C 7"), (2, 6))

    def test_parse_coord_rejects_bad_input(self):
        for text in ["", "K1", "A0", "A11", "1A", "AA", "B-2"]:
            with self.assertRaises(ValueError, msg=text):
                cli.parse_coord(text)

    def test_parse_direction(self):
        self.assertIs(cli.parse_direction("h"), Direction.HORIZONTAL)
        self.assertIs(cli.parse_direction("Vertical"), Direction.VERTICAL)
        with self.assertRaises(ValueError):
            cli.parse_direction("x")

    def test_format_coord_round_trip(self):
        for coord in [(0, 0), (4, 6), (9, 9)]:
            self.assertEqual(cli.parse_coord(cli.format_coord(coord)), coord)


class ScriptedGameTests(unittest.TestCase):
    def run_script(self, answers, seed=0):
        inputs = iter(answers)
        output = []
        winner = cli.play(lambda _prompt: next(inputs), output.append, random.Random(seed), lambda: None)
        return winner, "\n".join(output)

    def test_manual_placement_retries_invalid_then_human_vs_ai(self):
        manual = [
            "A7", "H",              # Carrier off the edge -> rejected
            "A1", "H",              # Carrier A1-A5
            "A3", "V",              # Battleship overlaps -> rejected
            "C1", "H", "E1", "H", "G1", "H", "I1", "H",
        ]
        every_cell = [f"{r}{c}" for r in "ABCDEFGHIJ" for c in range(1, 11)]
        winner, out = self.run_script(["1", "M", *manual, *every_cell])
        self.assertIn("outside the grid", out)
        self.assertIn("overlap", out)
        self.assertIn("ships are sunk", out)
        self.assertIn(winner.name, {"You", "Computer"})
        if winner.name == "You":
            self.assertIn('"You sunk my', out)

    def test_two_player_mode_reports_sinks_and_winner(self):
        every_cell = [f"{r}{c}" for r in "ABCDEFGHIJ" for c in range(1, 11)]
        answers = ["2", "R", "", "R", ""]
        for cell in every_cell:
            answers += ["", cell, "", "", cell, ""]
        winner, out = self.run_script(answers)
        loser = "Player 2" if winner.name == "Player 1" else "Player 1"
        for name, _size in FLEET:
            self.assertIn(f"sunk {loser}'s {name}!", out)
        self.assertIn(f"All of {loser}'s ships are sunk. {winner.name} wins!", out)


    def test_two_player_handoff_clears_screen_before_next_player(self):
        every_cell = [f"{r}{c}" for r in "ABCDEFGHIJ" for c in range(1, 11)]
        answers = ["2", "R", "", "R", ""]
        for cell in every_cell:
            answers += ["", cell, "", "", cell, ""]
        inputs = iter(answers)
        events = []

        def fake_input(prompt):
            events.append(("input", prompt))
            return next(inputs)

        cli.play(fake_input, lambda text: events.append(("output", text)), random.Random(0), lambda: events.append(("clear",)))
        handoffs = [i for i, e in enumerate(events) if e == ("input", "Press Enter, then pass to the other player...")]
        self.assertGreater(len(handoffs), 2)
        for i in handoffs:
            self.assertEqual(events[i + 1], ("clear",))
        self.assertNotIn(("output", "\n" * 50), events)
        self.assertIn(("output", cli.SCROLLBACK_WARNING), events)


class ClearScreenTests(unittest.TestCase):
    class FakeTty(io.StringIO):
        def isatty(self):
            return True

    def test_tty_gets_ansi_clear_including_scrollback(self):
        stream = self.FakeTty()
        output = []
        with mock.patch.object(cli.os, "name", "posix"):
            cli.clear_screen(output.append, stream)
        self.assertEqual(stream.getvalue(), "\x1b[H\x1b[2J\x1b[3J")
        self.assertEqual(output, [])

    def test_windows_tty_uses_cls(self):
        with mock.patch.object(cli.os, "name", "nt"), mock.patch.object(cli.os, "system") as system:
            cli.clear_screen(lambda _text: None, self.FakeTty())
        system.assert_called_once_with("cls")

    def test_play_clears_real_terminal_by_default_with_custom_output(self):
        answers = iter(["2", "R", "", "R", ""])
        with mock.patch.object(cli, "clear_screen") as clear, self.assertRaises(StopIteration):
            cli.play(lambda _prompt: next(answers), lambda _text: None, random.Random(0))
        self.assertEqual(clear.call_count, 2)

    def test_non_tty_falls_back_to_blank_lines(self):
        output = []
        cli.clear_screen(output.append, io.StringIO())
        self.assertEqual(output, ["\n" * 50])


if __name__ == "__main__":
    unittest.main()
