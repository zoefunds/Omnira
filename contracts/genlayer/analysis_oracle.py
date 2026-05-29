# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""
Omnira — AnalysisOracle Intelligent Contract.

For each match the API has finished and Stockfish has evaluated, request_analysis
asks a GenLayer LLM (via the comparative equivalence principle) to produce a rich
JSON coaching report. The contract stores the raw LLM JSON; the worker reads it
back and persists into the off-chain AnalysisReport row, then the UI renders it.

Why on-chain: it's the differentiator. The LLM's verdict on your game is a
multi-validator consensus output, not a single provider's whim.
"""

from genlayer import *
from dataclasses import dataclass
from datetime import datetime, timezone


@allow_storage
@dataclass
class AnalysisRecord:
    requester: Address
    requested_at: u256
    completed_at: u256
    raw_output: str   # JSON string emitted by the LLM
    completed: bool


def _build_prompt(match_id: str, engine_summary: str, pgn: str) -> str:
    # Truncate inputs defensively so a runaway PGN can't blow the prompt window.
    pgn_short = pgn if len(pgn) < 4000 else pgn[:4000] + "\n... [truncated]"
    eng_short = engine_summary if len(engine_summary) < 4000 else engine_summary[:4000] + "\n... [truncated]"
    return f"""You are a Grandmaster-level chess coach giving a detailed, instructive post-game analysis.

GAME PGN:
{pgn_short}

STOCKFISH PER-PLY ANALYSIS (depth 12, centipawns from mover POV):
{eng_short}

Produce a detailed analysis as a single JSON object with EXACTLY these top-level keys:
{{
  "summary": "<5-7 sentence engaging narrative of how the game went>",
  "opening": {{
    "name": "<opening name + variation if identifiable, e.g. 'Sicilian Najdorf'>",
    "eco": "<ECO code or null>",
    "assessment": "<2-3 sentences on opening play and who came out better>"
  }},
  "middlegame": {{
    "structure": "<short pawn-structure description>",
    "plans": "<what each side was trying to achieve>",
    "assessment": "<2-3 sentences on middlegame play>"
  }},
  "endgame": {{
    "type": "<endgame type, or 'no endgame reached'>",
    "assessment": "<2-3 sentences or null>"
  }},
  "turning_points": [
    {{
      "ply": <integer ply number>,
      "san": "<move actually played, SAN>",
      "best_san": "<engine's best move, SAN>",
      "what_happened": "<2-3 sentence concrete tactical/positional explanation>",
      "tactical_motif": "<e.g. 'fork', 'pin', 'discovered attack', or null if purely positional>"
    }}
  ],
  "themes": ["<short strategic theme>", "..."],
  "advice": {{
    "white": "<2-3 sentence actionable improvement for white, with concrete reasoning>",
    "black": "<2-3 sentence actionable improvement for black, with concrete reasoning>"
  }}
}}

Rules:
- Identify 2-4 turning points. Reference moves by SAN.
- Be concrete. Cite specific tactics, weak squares, piece coordination.
- Themes should be short labels (e.g. "king safety", "central control", "minor-piece coordination"). 3-6 items.
- Return ONLY the JSON object. No markdown fences. No commentary outside JSON.
"""


class AnalysisOracle(gl.Contract):
    analyses: TreeMap[str, AnalysisRecord]

    def __init__(self):
        pass

    def _now(self) -> u256:
        return u256(int(datetime.now(timezone.utc).timestamp()))

    @gl.public.write
    def request_analysis(
        self,
        match_id: str,
        engine_summary: str,
        pgn: str,
    ) -> None:
        # Idempotent — if already completed, skip the (expensive) LLM call.
        if match_id in self.analyses and self.analyses[match_id].completed:
            return

        self.analyses[match_id] = AnalysisRecord(
            requester=gl.message.sender_address,
            requested_at=self._now(),
            completed_at=u256(0),
            raw_output="",
            completed=False,
        )

        prompt = _build_prompt(match_id, engine_summary, pgn)

        def task() -> str:
            return gl.nondet.exec_prompt(prompt)

        result = gl.eq_principle.prompt_comparative(
            task,
            principle=(
                "Both outputs are JSON chess analyses of the same game. They are equivalent if: "
                "(a) both are valid JSON with the top-level keys "
                "'summary', 'opening', 'middlegame', 'endgame', 'turning_points', 'themes', 'advice'; "
                "(b) they identify at least one of the same turning points within 2 plies of each other; "
                "(c) they reach a substantively similar overall assessment of which side played better. "
                "Differences in phrasing, additional optional fields, or non-overlapping minor themes do NOT make them inequivalent."
            ),
        )

        self.analyses[match_id] = AnalysisRecord(
            requester=gl.message.sender_address,
            requested_at=self.analyses[match_id].requested_at,
            completed_at=self._now(),
            raw_output=result,
            completed=True,
        )

    @gl.public.view
    def get_analysis(self, match_id: str) -> AnalysisRecord:
        if match_id not in self.analyses:
            raise Exception(f"no analysis for: {match_id}")
        return self.analyses[match_id]

    @gl.public.view
    def analysis_exists(self, match_id: str) -> bool:
        return match_id in self.analyses

    @gl.public.view
    def analysis_completed(self, match_id: str) -> bool:
        if match_id not in self.analyses:
            return False
        return self.analyses[match_id].completed
