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

// File locking mechanism to prevent concurrent writes
const fileLocks = new Map<string, Promise<unknown>>();

async function withFileLock<T>(filePath: string, operation: () => Promise<T>): Promise<T> {
  const lockKey = createHash('md5').update(filePath).digest('hex');
  
  // Wait for any existing lock on this file
  const existingLock = fileLocks.get(lockKey);
  if (existingLock) {
    logger.debug("Waiting for existing file lock", { filePath, lockKey });
    await existingLock;
  }
  
  // Create new lock
  const lockPromise = operation().finally(() => {
    fileLocks.delete(lockKey);
    logger.debug("Released file lock", { filePath, lockKey });
  });
  
  fileLocks.set(lockKey, lockPromise);
  logger.debug("Acquired file lock", { filePath, lockKey });
  return lockPromise;
}

function resolveReportPath(raw?: string): string {
  if (raw && raw.startsWith("~")) {
    return path.resolve(os.homedir(), raw.slice(1));
  }
  return path.resolve(raw ?? defaultReportPath);
}

async function ensureWorkbook(reportPath: string): Promise<{ workbook: ExcelJS.Workbook; existingData: { answers: any[], games: any[] } }> {
  let existingData = { answers: [], games: [] };
  
  // Always create a fresh workbook to avoid ExcelJS corruption issues
  const workbook = new ExcelJS.Workbook();
  
  try {
    // If file exists, read all existing data first
    await fs.access(reportPath);
    const existingWorkbook = new ExcelJS.Workbook();
    await existingWorkbook.xlsx.readFile(reportPath);
    
    const existingAnswersSheet = existingWorkbook.getWorksheet(ANSWERS_SHEET);
    const existingGamesSheet = existingWorkbook.getWorksheet(GAMES_SHEET);
    
    // Extract all existing data
    if (existingAnswersSheet && existingAnswersSheet.rowCount > 1) {
      for (let i = 2; i <= existingAnswersSheet.rowCount; i++) {
        const row = existingAnswersSheet.getRow(i);
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
    
    if (existingGamesSheet && existingGamesSheet.rowCount > 1) {
      for (let i = 2; i <= existingGamesSheet.rowCount; i++) {
        const row = existingGamesSheet.getRow(i);
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
    // File doesn't exist or can't be read - that's fine, we'll create fresh
    logger.info("Creating fresh Excel file", { reportPath });
  }
  
  // Create fresh worksheets with headers
  const answersSheet = workbook.addWorksheet(ANSWERS_SHEET, {
    views: [{ state: "frozen", ySplit: 1 }],
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

  // Add all existing data back to the fresh workbook
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

export async function appendQuizReport({ answers, summary }: QuizReportPayload): Promise<void> {
  const reportPath = resolveReportPath(process.env.REPORT_DATABASE);

  return withFileLock(reportPath, async () => {
    try {
      await fs.mkdir(path.dirname(reportPath), { recursive: true });
      const { workbook, existingData } = await ensureWorkbook(reportPath);

      const answersSheet = workbook.getWorksheet(ANSWERS_SHEET)!;
      const gamesSheet = workbook.getWorksheet(GAMES_SHEET)!;

      const beforeAnswerRows = answersSheet.rowCount;
      const beforeGameRows = gamesSheet.rowCount;

      logger.info("Fresh workbook prepared for appending", {
        reportPath,
        existingAnswersRestored: existingData.answers.length,
        existingGamesRestored: existingData.games.length,
        currentAnswerRows: beforeAnswerRows,
        currentGameRows: beforeGameRows,
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

      // Write the file with enhanced error handling
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

      // Verify the write was successful by re-reading the file
      try {
        const verificationWorkbook = new ExcelJS.Workbook();
        await verificationWorkbook.xlsx.readFile(reportPath);
        
        const verifyAnswersSheet = verificationWorkbook.getWorksheet(ANSWERS_SHEET);
        const verifyGamesSheet = verificationWorkbook.getWorksheet(GAMES_SHEET);

        const actualAnswerRows = verifyAnswersSheet?.rowCount || 0;
        const actualGameRows = verifyGamesSheet?.rowCount || 0;

        if (actualAnswerRows !== expectedAnswerRows || actualGameRows !== expectedGameRows) {
          const discrepancy = {
            expectedAnswerRows,
            actualAnswerRows,
            expectedGameRows,
            actualGameRows,
            reportPath,
          };
          
          logger.error("Excel file verification failed - data not properly persisted", discrepancy);
          throw new Error(`Excel write verification failed: expected ${expectedGameRows} game rows and ${expectedAnswerRows} answer rows, but file contains ${actualGameRows} game rows and ${actualAnswerRows} answer rows`);
        }

        logger.info("Quiz report appended and verified", {
          reportPath,
          answersAdded: answers.length,
          answersRowCount: actualAnswerRows,
          gamesRowCount: actualGameRows,
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
      logger.error("Failed to append quiz report", {
        error: error instanceof Error ? error.message : String(error),
        errorDetails: error,
        reportPath,
        roomName: summary?.roomName,
        hostName: summary?.hostName,
      });
      throw error;
    }
  });
}
