# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""
Omnira — MatchRegistry v3.

Removes the separate `registrar` lock; writes are authorized iff the caller's
address is one of the match's players (white_address or black_address).
register_match is additionally restricted to the white side, so the first
onchain action of a game is signed by the player who plays white.
"""

from genlayer import *
from dataclasses import dataclass
from datetime import datetime, timezone


@allow_storage
@dataclass
class MatchRecord:
    white_address: Address
    black_address: Address
    initial_ms: u256
    increment_ms: u256
    started_at: u256
    ended_at: u256
    status: str
    result_reason: str
    final_fen: str
    pgn: str
    move_count: u256


@allow_storage
@dataclass
class MoveRecord:
    ply: u256
    san: str
    uci: str
    fen_after: str
    clock_ms_white: u256
    clock_ms_black: u256
    think_ms: u256
    submitted_at: u256


class MatchRegistry(gl.Contract):
    matches: TreeMap[str, MatchRecord]
    moves:   TreeMap[str, MoveRecord]   # key = f"{match_id}|{ply}"

    def __init__(self):
        pass

    def _now(self) -> u256:
        return u256(int(datetime.now(timezone.utc).timestamp()))

    def _move_key(self, match_id: str, ply: int) -> str:
        return f"{match_id}|{ply}"

    def _require_player(self, match_id: str) -> MatchRecord:
        if match_id not in self.matches:
            raise Exception(f"unknown match: {match_id}")
        rec = self.matches[match_id]
        sender = gl.message.sender_address
        if sender != rec.white_address and sender != rec.black_address:
            raise Exception("only match players may modify this match")
        return rec

    @gl.public.write
    def register_match(
        self,
        match_id: str,
        white_address: Address,
        black_address: Address,
        initial_ms: u256,
        increment_ms: u256,
    ) -> None:
        if match_id in self.matches:
            raise Exception(f"match already registered: {match_id}")
        if gl.message.sender_address != white_address:
            raise Exception("register_match must be signed by the white player")
        self.matches[match_id] = MatchRecord(
            white_address=white_address,
            black_address=black_address,
            initial_ms=initial_ms,
            increment_ms=increment_ms,
            started_at=self._now(),
            ended_at=u256(0),
            status="ACTIVE",
            result_reason="",
            final_fen="",
            pgn="",
            move_count=u256(0),
        )

    @gl.public.write
    def submit_moves_batch(
        self,
        match_id: str,
        plies:           DynArray[u256],
        sans:            DynArray[str],
        ucis:            DynArray[str],
        fens_after:      DynArray[str],
        clocks_ms_white: DynArray[u256],
        clocks_ms_black: DynArray[u256],
        think_mss:       DynArray[u256],
    ) -> None:
        rec = self._require_player(match_id)
        if rec.status != "ACTIVE":
            raise Exception(f"match not active: {rec.status}")
        n = len(plies)
        if not (n == len(sans) == len(ucis) == len(fens_after)
                == len(clocks_ms_white) == len(clocks_ms_black) == len(think_mss)):
            raise Exception("batch arrays must be the same length")
        now = self._now()
        expected = int(rec.move_count) + 1
        i = 0
        while i < n:
            if int(plies[i]) != expected:
                raise Exception(f"out-of-order ply: expected {expected}, got {int(plies[i])}")
            self.moves[self._move_key(match_id, expected)] = MoveRecord(
                ply=plies[i],
                san=sans[i],
                uci=ucis[i],
                fen_after=fens_after[i],
                clock_ms_white=clocks_ms_white[i],
                clock_ms_black=clocks_ms_black[i],
                think_ms=think_mss[i],
                submitted_at=now,
            )
            expected += 1
            i += 1
        rec.move_count = u256(expected - 1)
        self.matches[match_id] = rec

    @gl.public.write
    def finalize_match(
        self,
        match_id: str,
        status: str,
        result_reason: str,
        final_fen: str,
        pgn: str,
    ) -> None:
        rec = self._require_player(match_id)
        if rec.status != "ACTIVE":
            raise Exception(f"already finalized: {rec.status}")
        if status not in ("WHITE_WON", "BLACK_WON", "DRAW", "ABORTED"):
            raise Exception(f"invalid status: {status}")
        rec.status = status
        rec.result_reason = result_reason
        rec.final_fen = final_fen
        rec.pgn = pgn
        rec.ended_at = self._now()
        self.matches[match_id] = rec

    @gl.public.view
    def match_exists(self, match_id: str) -> bool:
        return match_id in self.matches

    @gl.public.view
    def get_match(self, match_id: str) -> MatchRecord:
        if match_id not in self.matches:
            raise Exception(f"unknown match: {match_id}")
        return self.matches[match_id]

    @gl.public.view
    def get_move_count(self, match_id: str) -> u256:
        if match_id not in self.matches:
            raise Exception(f"unknown match: {match_id}")
        return self.matches[match_id].move_count

    @gl.public.view
    def get_move(self, match_id: str, ply: u256) -> MoveRecord:
        key = self._move_key(match_id, int(ply))
        if key not in self.moves:
            raise Exception(f"no move at ply {int(ply)}")
        return self.moves[key]
