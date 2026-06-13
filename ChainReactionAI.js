/**
 * ============================================================
 * NEXUS PROTOCOL — CHAIN REACTION AI ENGINE
 * ============================================================
 */
class ChainReactionAI {
    /**
     * Analyzes the board state and returns the optimal row and column choice.
     * @param {ChainReactionGame} gameInstance - The active engine instance
     * @param {number} aiPlayerId - The player ID assigned to the computer
     * @returns {{row: number, col: number} | null}
     */
    static getBestMove(gameInstance, aiPlayerId) {
        const snapshot = gameInstance.getSnapshot();
        const validMoves = [];

        // 1. Scan the matrix to compile all legal moves
        for (let r = 0; r < snapshot.rows; r++) {
            for (let c = 0; c < snapshot.cols; c++) {
                const cell = snapshot.grid[r][c];
                // A cell is valid if it's empty (-1) or currently owned by the AI
                if (cell.owner === -1 || cell.owner === aiPlayerId) {
                    validMoves.push({ row: r, col: c, ...cell });
                }
            }
        }

        if (validMoves.length === 0) return null;

        // HEURISTIC 1: Look for an instant chain-reaction setup (Critical Cells)
        // Find cells owned by the AI that are exactly 1 orb away from exploding
        const criticalCells = validMoves.filter(cell => cell.owner === aiPlayerId && cell.orbCount === cell.capacity - 1);
        if (criticalCells.length > 0) {
            // Pick a critical cell to intentionally detonate an explosion wave
            const choice = criticalCells[Math.floor(Math.random() * criticalCells.length)];
            return { row: choice.row, col: choice.col };
        }

        // HEURISTIC 2: Secure completely open corner structures early on
        const corners = validMoves.filter(cell => {
            const isCorner = (cell.row === 0 || cell.row === snapshot.rows - 1) && 
                             (cell.col === 0 || cell.col === snapshot.cols - 1);
            return isCorner && cell.owner === -1;
        });
        if (corners.length > 0) {
            const choice = corners[Math.floor(Math.random() * corners.length)];
            return { row: choice.row, col: choice.col };
        }

        // HEURISTIC 3: Prefer interior cells over edge exposures if available
        const interiors = validMoves.filter(cell => cell.capacity === 4);
        if (interiors.length > 0) {
            const choice = interiors[Math.floor(Math.random() * interiors.length)];
            return { row: choice.row, col: choice.col };
        }

        // Fallback: Select any entirely legal coordinate spot randomly
        const randomChoice = validMoves[Math.floor(Math.random() * validMoves.length)];
        return { row: randomChoice.row, col: randomChoice.col };
    }
}

if (typeof module !== 'undefined') {
    module.exports = { ChainReactionAI };
}
