import path from "node:path";
import os from "node:os";
import { promises as fs } from "node:fs";
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

const defaultReportPath = path.join(os.homedir(), "trivia-report.xlsx");

function resolveReportPath(raw?: string): string {
  if (raw && raw.startsWith("~")) {
    return path.resolve(os.homedir(), raw.slice(1));
  }
  return path.resolve(raw ?? defaultReportPath);
}

async function ensureWorkbook(reportPath: string): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  try {
    await fs.access(reportPath);
    await workbook.xlsx.readFile(reportPath);
  } catch {
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
  }

  if (!workbook.getWorksheet(ANSWERS_SHEET)) {
    workbook.addWorksheet(ANSWERS_SHEET);
  }
  if (!workbook.getWorksheet(GAMES_SHEET)) {
    workbook.addWorksheet(GAMES_SHEET);
  }

  return workbook;
}

export interface QuizReportPayload {
  answers: AnswerReportRow[];
  summary: GameSummaryRow;
}

export async function appendQuizReport({ answers, summary }: QuizReportPayload): Promise<void> {
  const reportPath = resolveReportPath(process.env.REPORT_DATABASE);

  try {
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    const workbook = await ensureWorkbook(reportPath);

    const answersSheet = workbook.getWorksheet(ANSWERS_SHEET)!;
    const gamesSheet = workbook.getWorksheet(GAMES_SHEET)!;

    answers.forEach((row) => {
      answersSheet.addRow({
        ...row,
        correct: row.correct ? "YES" : "NO",
      });
    });

    gamesSheet.addRow({
      ...summary,
      correctRatio: Number.isFinite(summary.correctRatio)
        ? summary.correctRatio
        : 0,
      incorrectRatio: Number.isFinite(summary.incorrectRatio)
        ? summary.incorrectRatio
        : 0,
    });

    await workbook.xlsx.writeFile(reportPath);
    logger.info("Quiz report appended", {
      reportPath,
      answersAdded: answers.length,
    });
  } catch (error) {
    logger.error("Failed to append quiz report", {
      error,
      reportPath,
    });
  }
}
