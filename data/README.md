# data/

This project uses no external datasets, data files, or pre-trained models.

- The game board is generated procedurally at runtime from just two numbers
  (rows, columns) chosen in the setup menu — there is no data file behind it.
- The AI opponent (`support/src/ChainReactionAI.js`) is a hand-designed
  weighted-heuristic evaluator (see `PROJECT_REPORT.md` §6.2 for the full
  formulas) — it is not trained on data and loads no model file.
- The only content loaded from outside the repository at all is a Google
  Fonts stylesheet, which is cosmetic (typefaces), not data, and the game
  runs fully correctly without it.

This folder is kept, empty of datasets, to satisfy the project's required
repository layout.
