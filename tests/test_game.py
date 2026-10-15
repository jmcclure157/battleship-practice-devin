import unittest

from battleship.board import Direction, Outcome, ShotError
from battleship.game import Game, GameOverError, Player


def make_game():
    p1, p2 = Player("Alice"), Player("Bob")
    p1.board.place_ship("Destroyer", 2, (0, 0), Direction.HORIZONTAL)
    p2.board.place_ship("Destroyer", 2, (4, 4), Direction.VERTICAL)
    p2.board.place_ship("Submarine", 3, (9, 0), Direction.HORIZONTAL)
    return Game(p1, p2), p1, p2


class GameTests(unittest.TestCase):
    def test_turns_alternate(self):
        game, p1, p2 = make_game()
        self.assertIs(game.current, p1)
        game.fire((9, 9))
        self.assertIs(game.current, p2)
        game.fire((9, 9))
        self.assertIs(game.current, p1)

    def test_shot_lands_on_opponent_board(self):
        game, p1, p2 = make_game()
        result = game.fire((4, 4))
        self.assertEqual(result.outcome, Outcome.HIT)
        self.assertIn((4, 4), p2.board.shots)
        self.assertNotIn((4, 4), p1.board.shots)

    def test_invalid_shot_keeps_turn(self):
        game, p1, _ = make_game()
        game.fire((1, 1))
        game.fire((1, 1))  # p2 shoots p1's (1,1)
        with self.assertRaises(ShotError):
            game.fire((1, 1))  # p1 already shot p2's (1,1)
        self.assertIs(game.current, p1)

    def test_win_detected_when_last_ship_sinks(self):
        game, p1, p2 = make_game()
        p1_targets = [(4, 4), (5, 4), (9, 0), (9, 1), (9, 2)]
        p2_misses = iter([(9, 9), (9, 8), (9, 7), (9, 6)])
        for i, target in enumerate(p1_targets):
            self.assertFalse(game.is_over)
            result = game.fire(target)
            if i < len(p1_targets) - 1:
                game.fire(next(p2_misses))
        self.assertEqual(result.outcome, Outcome.SUNK)
        self.assertTrue(game.is_over)
        self.assertIs(game.winner, p1)
        self.assertIs(game.opponent, p2)

    def test_sinking_one_ship_is_not_a_win(self):
        game, _, _ = make_game()
        game.fire((4, 4))
        game.fire((9, 9))
        self.assertEqual(game.fire((5, 4)).outcome, Outcome.SUNK)
        self.assertFalse(game.is_over)

    def test_no_shots_after_game_over(self):
        game, p1, p2 = make_game()
        for target in [(4, 4), (5, 4), (9, 0), (9, 1)]:
            game.fire(target)
            game.fire((8, 9 - len(p2.board.shots)))
        game.fire((9, 2))
        with self.assertRaises(GameOverError):
            game.fire((0, 9))


if __name__ == "__main__":
    unittest.main()
