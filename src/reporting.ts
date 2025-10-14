import path from "node:path";
import os from "node:os";
import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import { logger } from "./logger";

export interface AnswerReportRow {
  timestamp: string;
  hostName: string;
  roomName: string;
  quizName: string;
  questionCount: number;
  questionNumber: number;
  playerName: string;
  difficulty: string;
  category: string;
  correctAnswer: string;
  providedAnswer: string;
  providedAnswerIndex: number;
  correct: boolean;
  timeMs: number;
  scoreAwarded: number;
  totalScore: number;
  leaderboardPosition: number;
  playersCount: number;
}

export interface GameSummaryRow {
  timestamp: string;
  hostName: string;
  roomName: string;
  quizName: string;
  questionCount: number;
  playerCount: number;
  totalAnswers: number;
  correctAnswers: number;
  incorrectAnswers: number;
  correctRatio: number;
  incorrectRatio: number;
  averageTimeMs: number;
  varianceTimeMs2: number;
  fastestTimeMs: number;
  slowestTimeMs: number;
  averageScorePerPlayer: number;
  winnerName?: string;
  winnerScore?: number;
}

const ANSWERS_SHEET = "Answers";
const GAMES_SHEET = "Games";

const defaultReportPath = path.join(
  process.cwd(),
  "reports",
  "trivia-report.xlsx"
);

/**
 * FILE LOCKING MECHANISM TO PREVENT CONCURRENT EXCEL WRITES
 * 
 * PROBLEM SOLVED: Multiple quiz rounds finishing simultaneously could cause:
 * 1. File corruption (ExcelJS doesn't handle concurrent writes well)
 * 2. Data loss (later writes overwriting earlier writes)
 * 3. Race conditions in file read/write operations
 * 
 * SOLUTION: Recursive atomic locking pattern that ensures only one Excel operation
 * happens at a time per file, with proper queuing of concurrent requests.
 */
const fileLocks = new Map<string, Promise<unknown>>();

/**
 * Executes an operation with exclusive file access using atomic locking.
 * 
 * PATTERN USED: Recursive Retry with Promise-based Mutual Exclusion
 * 
 * Why not traditional mutexes?
 * - JavaScript is single-threaded with async operations
 * - No native mutex/semaphore primitives
 * - Event loop makes Map operations atomic
 * - Promises provide natural queuing mechanism
 * 
 * @param filePath - Path to the file being locked
 * @param operation - Async operation to execute with exclusive access
 * @returns Promise that resolves when operation completes
 */
async function withFileLock<T>(filePath: string, operation: () => Promise<T>): Promise<T> {
  // Create unique lock key per file path to allow concurrent operations on different files
  const lockKey = createHash('md5').update(filePath).digest('hex');
  
  /**
   * RECURSIVE ATOMIC LOCK ACQUISITION
   * 
   * This pattern solves the classic "check-then-act" race condition:
   * 
   * RACE CONDITION (what we prevent):
   * Thread A: check lock → sees null → [Context Switch] → set lock
   * Thread B: check lock → sees null → set lock ← COLLISION!
   * 
   * ATOMIC SOLUTION:
   * Thread A: check → null → create promise → set lock atomically
   * Thread B: check → finds A's lock → waits → recursively retries
   */
  const acquireLock = async (): Promise<T> => {
    const existingLock = fileLocks.get(lockKey);
    
    if (existingLock) {
      // Another operation is in progress - wait for it to complete
      logger.debug("Waiting for existing file lock", { filePath, lockKey });
      await existingLock;
      
      // CRITICAL: Recursive retry after waiting
      // Why? Another thread might have started while we were waiting!
      // This ensures we don't proceed until we truly have exclusive access
      return acquireLock();
    }
    
    // No existing lock found - we can proceed, but first create our promise
    const operationPromise = (async (): Promise<T> => {
      try {
        logger.debug("Acquired file lock", { filePath, lockKey });
        return await operation();
      } finally {
        // CRITICAL: Always clean up lock, even if operation fails
        // This prevents deadlocks and ensures other waiting operations can proceed
        fileLocks.delete(lockKey);
        logger.debug("Released file lock", { filePath, lockKey });
      }
    })();
    
    // ATOMIC OPERATION: Set lock immediately after creating promise
    // JavaScript's single-threaded nature guarantees this is atomic
    fileLocks.set(lockKey, operationPromise);
    
    return operationPromise;
  };
  
  return acquireLock();
}

function resolveReportPath(raw?: string): string {
  if (raw && raw.startsWith("~")) {
    return path.resolve(os.homedir(), raw.slice(1));
  }
  return path.resolve(raw ?? defaultReportPath);
}

/**
 * EXCEL WORKBOOK MANAGEMENT WITH FILE CORRUPTION RESILIENCE
 * 
 * PROBLEM SOLVED: ExcelJS library has issues with appending data to existing files:
 * 1. Silent write failures - writeFile() succeeds but data isn't persisted
 * 2. File corruption when multiple operations try to modify the same file
 * 3. Inconsistent row counts between in-memory objects and actual file contents
 * 
 * ROOT CAUSE DISCOVERED: ExcelJS struggles with modifying existing Excel files,
 * especially when the file has been written to multiple times or when there
 * are concurrent access patterns.
 * 
 * SOLUTION PATTERN: "Extract-Transform-Recreate"
 * Instead of appending to existing files (which fails):
 * 1. Extract all existing data from current file
 * 2. Create completely fresh workbook
 * 3. Restore all existing data to fresh workbook  
 * 4. Add new data
 * 5. Write complete file (replacing old one)
 * 
 * This avoids ExcelJS corruption issues while preserving all historical data.
 */
async function ensureWorkbook(reportPath: string): Promise<{ workbook: ExcelJS.Workbook; existingData: { answers: any[], games: any[] } }> {
  let existingData: { answers: any[], games: any[] } = { answers: [], games: [] };
  
  // CRITICAL: Always create fresh workbook to avoid ExcelJS corruption
  // Never reuse existing workbook objects as they may be corrupted
  const workbook = new ExcelJS.Workbook();
  
  try {
    // STEP 1: Extract all existing data from current file (if it exists)
    await fs.access(reportPath);
    
    // Use separate workbook instance for reading to avoid cross-contamination
    const existingWorkbook = new ExcelJS.Workbook();
    await existingWorkbook.xlsx.readFile(reportPath);
    
    const existingAnswersSheet = existingWorkbook.getWorksheet(ANSWERS_SHEET);
    const existingGamesSheet = existingWorkbook.getWorksheet(GAMES_SHEET);
    
    // STEP 2: Extract all existing data row by row
    // We manually extract each cell to ensure data integrity and avoid ExcelJS object references
    if (existingAnswersSheet && existingAnswersSheet.rowCount > 1) {
      // Start from row 2 to skip header row
      for (let i = 2; i <= existingAnswersSheet.rowCount; i++) {
        const row = existingAnswersSheet.getRow(i);
        // Extract each cell by column index to ensure consistency with our schema
        existingData.answers.push({
          timestamp: row.getCell(1).value,
          hostName: row.getCell(2).value,
          roomName: row.getCell(3).value,
          quizName: row.getCell(4).value,
          questionCount: row.getCell(5).value,
          questionNumber: row.getCell(6).value,
          playerName: row.getCell(7).value,
          difficulty: row.getCell(8).value,
          category: row.getCell(9).value,
          correctAnswer: row.getCell(10).value,
          providedAnswer: row.getCell(11).value,
          providedAnswerIndex: row.getCell(12).value,
          correct: row.getCell(13).value,
          timeMs: row.getCell(14).value,
          scoreAwarded: row.getCell(15).value,
          totalScore: row.getCell(16).value,
          leaderboardPosition: row.getCell(17).value,
          playersCount: row.getCell(18).value,
        });
      }
    }
    
    // Extract game summary data with same pattern
    if (existingGamesSheet && existingGamesSheet.rowCount > 1) {
      for (let i = 2; i <= existingGamesSheet.rowCount; i++) {
        const row = existingGamesSheet.getRow(i);
        // Extract game summary data by column position
        existingData.games.push({
          timestamp: row.getCell(1).value,
          hostName: row.getCell(2).value,
          roomName: row.getCell(3).value,
          quizName: row.getCell(4).value,
          questionCount: row.getCell(5).value,
          playerCount: row.getCell(6).value,
          totalAnswers: row.getCell(7).value,
          correctAnswers: row.getCell(8).value,
          incorrectAnswers: row.getCell(9).value,
          correctRatio: row.getCell(10).value,
          incorrectRatio: row.getCell(11).value,
          averageTimeMs: row.getCell(12).value,
          varianceTimeMs2: row.getCell(13).value,
          fastestTimeMs: row.getCell(14).value,
          slowestTimeMs: row.getCell(15).value,
          averageScorePerPlayer: row.getCell(16).value,
          winnerName: row.getCell(17).value,
          winnerScore: row.getCell(18).value,
        });
      }
    }
    
    logger.info("Existing Excel data extracted", {
      reportPath,
      existingAnswers: existingData.answers.length,
      existingGames: existingData.games.length,
    });
    
  } catch (readError) {
    // File doesn't exist or is corrupted - that's fine, we'll create fresh
    // This handles first-time creation and recovery from corrupted files
    logger.info("Creating fresh Excel file", { reportPath });
  }
  
  // STEP 3: Create completely fresh worksheets with proper structure
  // Always create new sheets to avoid any corruption from existing workbook objects
  const answersSheet = workbook.addWorksheet(ANSWERS_SHEET, {
    views: [{ state: "frozen", ySplit: 1 }], // Freeze header row for better UX
  });
  answersSheet.columns = [
        { header: "Date", key: "timestamp", width: 22 },
        { header: "Host", key: "hostName", width: 18 },
        { header: "Room", key: "roomName", width: 16 },
        { header: "Quiz", key: "quizName", width: 24 },
        { header: "Question Count", key: "questionCount", width: 15 },
        { header: "Question #", key: "questionNumber", width: 12 },
        { header: "Player", key: "playerName", width: 18 },
        { header: "Difficulty", key: "difficulty", width: 12 },
        { header: "Category", key: "category", width: 24 },
        { header: "Correct Answer", key: "correctAnswer", width: 32 },
        { header: "Provided Answer", key: "providedAnswer", width: 32 },
        { header: "Answer Index", key: "providedAnswerIndex", width: 13 },
        { header: "Correct", key: "correct", width: 9 },
        { header: "Answer Time (ms)", key: "timeMs", width: 16 },
        { header: "Score Delta", key: "scoreAwarded", width: 12 },
        { header: "Player Score", key: "totalScore", width: 12 },
        { header: "Leaderboard Pos", key: "leaderboardPosition", width: 16 },
        { header: "Players In Game", key: "playersCount", width: 16 },
      ];

    const gamesSheet = workbook.addWorksheet(GAMES_SHEET, {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    gamesSheet.columns = [
        { header: "Date", key: "timestamp", width: 22 },
        { header: "Host", key: "hostName", width: 18 },
        { header: "Room", key: "roomName", width: 16 },
        { header: "Quiz", key: "quizName", width: 24 },
        { header: "Question Count", key: "questionCount", width: 16 },
        { header: "Players", key: "playerCount", width: 10 },
        { header: "Total Answers", key: "totalAnswers", width: 14 },
        { header: "Correct Answers", key: "correctAnswers", width: 15 },
        { header: "Incorrect Answers", key: "incorrectAnswers", width: 17 },
        { header: "Correct Ratio", key: "correctRatio", width: 14 },
        { header: "Incorrect Ratio", key: "incorrectRatio", width: 16 },
        { header: "Avg Time (ms)", key: "averageTimeMs", width: 14 },
        { header: "Variance Time", key: "varianceTimeMs2", width: 16 },
        { header: "Fastest Time (ms)", key: "fastestTimeMs", width: 16 },
        { header: "Slowest Time (ms)", key: "slowestTimeMs", width: 16 },
        { header: "Avg Score/Player", key: "averageScorePerPlayer", width: 16 },
        { header: "Winner", key: "winnerName", width: 18 },
        { header: "Winner Score", key: "winnerScore", width: 14 },
      ];

  // STEP 4: Restore all existing data to the fresh workbook
  // This ensures we preserve all historical data while avoiding ExcelJS corruption
  existingData.answers.forEach((answerRow) => {
    answersSheet.addRow(answerRow);
  });

  existingData.games.forEach((gameRow) => {
    gamesSheet.addRow(gameRow);
  });

  logger.info("Fresh workbook created with existing data", {
    reportPath,
    restoredAnswers: existingData.answers.length,
    restoredGames: existingData.games.length,
    totalAnswerRows: answersSheet.rowCount,
    totalGameRows: gamesSheet.rowCount,
  });

  return { workbook, existingData };
}

export interface QuizReportPayload {
  answers: AnswerReportRow[];
  summary: GameSummaryRow;
}

/**
 * MAIN ENTRY POINT: Append quiz results to Excel report with full data integrity
 * 
 * This function combines multiple patterns to solve the multi-round reporting problem:
 * 
 * 1. FILE LOCKING: Prevents concurrent access conflicts
 * 2. EXTRACT-RECREATE: Avoids ExcelJS append corruption issues  
 * 3. WRITE VERIFICATION: Detects and reports any persistence failures
 * 4. COMPREHENSIVE ERROR HANDLING: Provides detailed logging for debugging
 * 
 * USAGE CONTEXT: Called after each quiz round completes, potentially with
 * multiple rounds finishing nearly simultaneously (hence the need for locking).
 */
export async function appendQuizReport({ answers, summary }: QuizReportPayload): Promise<void> {
  const reportPath = resolveReportPath(process.env.REPORT_DATABASE);

  // Apply file locking to ensure exclusive access during the entire operation
  return withFileLock(reportPath, async () => {
    try {
      // Ensure output directory exists
      await fs.mkdir(path.dirname(reportPath), { recursive: true });
      
      // Get fresh workbook with all existing data restored
      const { workbook, existingData } = await ensureWorkbook(reportPath);

      const answersSheet = workbook.getWorksheet(ANSWERS_SHEET)!;
      const gamesSheet = workbook.getWorksheet(GAMES_SHEET)!;

      const beforeAnswerRows = answersSheet.rowCount;
      const beforeGameRows = gamesSheet.rowCount;

      // Log current state for debugging and monitoring
      logger.info("Fresh workbook prepared for appending", {
        reportPath,
        existingAnswersRestored: existingData.answers.length,
        existingGamesRestored: existingData.games.length,
        currentAnswerRows: beforeAnswerRows, // Should equal existingAnswers + 1 (header)
        currentGameRows: beforeGameRows,     // Should equal existingGames + 1 (header)
        newAnswersToAdd: answers.length,
        newGamesToAdd: 1,
      });

      // Add answer rows one by one with detailed logging
      logger.debug("Adding answer rows to workbook", {
        reportPath,
        answersToAdd: answers.length,
      });

      answers.forEach((row, index) => {
        const newRow = answersSheet.addRow({
          ...row,
          correct: row.correct ? "YES" : "NO",
        });
        logger.debug("Added answer row", {
          reportPath,
          rowIndex: index + 1,
          newRowNumber: newRow.number,
          playerName: row.playerName,
          questionNumber: row.questionNumber,
          currentSheetRowCount: answersSheet.rowCount,
        });
      });

      // Add game summary row with detailed logging
      logger.debug("Adding game summary row", {
        reportPath,
        roomName: summary.roomName,
        hostName: summary.hostName,
        beforeAddGameRows: gamesSheet.rowCount,
      });

      const newGameRow = gamesSheet.addRow({
        ...summary,
        correctRatio: Number.isFinite(summary.correctRatio)
          ? summary.correctRatio
          : 0,
        incorrectRatio: Number.isFinite(summary.incorrectRatio)
          ? summary.incorrectRatio
          : 0,
      });

      logger.debug("Added game summary row", {
        reportPath,
        newGameRowNumber: newGameRow.number,
        afterAddGameRows: gamesSheet.rowCount,
      });

      const expectedAnswerRows = beforeAnswerRows + answers.length;
      const expectedGameRows = beforeGameRows + 1;

      logger.debug("Writing Excel file", {
        reportPath,
        expectedAnswerRows,
        expectedGameRows,
        inMemoryAnswerRows: answersSheet.rowCount,
        inMemoryGameRows: gamesSheet.rowCount,
      });

      /**
       * CRITICAL: Write file with error handling
       * ExcelJS writeFile() can fail silently, so we need explicit error handling
       */
      try {
        await workbook.xlsx.writeFile(reportPath);
        logger.debug("Excel file write completed", { reportPath });
      } catch (writeError) {
        logger.error("Failed to write Excel file", {
          error: writeError,
          reportPath,
        });
        throw writeError;
      }

      /**
       * WRITE VERIFICATION PATTERN
       * 
       * PROBLEM: ExcelJS sometimes reports successful writes that didn't actually persist
       * SOLUTION: Re-read the file immediately after writing to verify data was saved
       * 
       * This catches silent failures and provides early detection of corruption issues
       */
      try {
        const verificationWorkbook = new ExcelJS.Workbook();
        await verificationWorkbook.xlsx.readFile(reportPath);
        
        const verifyAnswersSheet = verificationWorkbook.getWorksheet(ANSWERS_SHEET);
        const verifyGamesSheet = verificationWorkbook.getWorksheet(GAMES_SHEET);

        const actualAnswerRows = verifyAnswersSheet?.rowCount || 0;
        const actualGameRows = verifyGamesSheet?.rowCount || 0;

        // Verify that our write actually persisted the expected data
        if (actualAnswerRows !== expectedAnswerRows || actualGameRows !== expectedGameRows) {
          const discrepancy = {
            expectedAnswerRows,
            actualAnswerRows,
            expectedGameRows,
            actualGameRows,
            reportPath,
          };
          
          // This error indicates ExcelJS silent failure - the write appeared to succeed
          // but the data wasn't actually persisted to disk
          logger.error("Excel file verification failed - data not properly persisted", discrepancy);
          throw new Error(`Excel write verification failed: expected ${expectedGameRows} game rows and ${expectedAnswerRows} answer rows, but file contains ${actualGameRows} game rows and ${actualAnswerRows} answer rows`);
        }

        // SUCCESS: Data has been verified as properly persisted
        logger.info("Quiz report appended and verified", {
          reportPath,
          answersAdded: answers.length,
          answersRowCount: actualAnswerRows,  // Verified count from re-read file
          gamesRowCount: actualGameRows,      // Verified count from re-read file
          roomName: summary.roomName,
          hostName: summary.hostName,
        });

      } catch (verifyError) {
        logger.error("Failed to verify Excel file write", {
          error: verifyError,
          reportPath,
        });
        throw verifyError;
      }

    } catch (error) {
      // Comprehensive error logging for debugging multi-round issues
      logger.error("Failed to append quiz report", {
        error: error instanceof Error ? error.message : String(error),
        errorDetails: error,
        reportPath,
        roomName: summary?.roomName,
        hostName: summary?.hostName,
      });
      // Re-throw to ensure the caller knows the operation failed
      throw error;
    }
  }); // End of withFileLock - lock is automatically released here
}
