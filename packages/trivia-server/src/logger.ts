import { createLogger, format, transports } from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import path from "node:path";
import fs from "node:fs";

const timestampFormat = format.timestamp({ format: "YYYY-MM-DD HH:mm:ss.SSS" });

const logDir = path.join(process.cwd(), "logs");
fs.mkdirSync(logDir, { recursive: true });

export const logger = createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: format.combine(
    timestampFormat,
    format.errors({ stack: true }),
    format.splat(),
    format.json()
  ),
  defaultMeta: { service: "trivia-ten-server" },
  transports: [
    new transports.Console({
      format: format.combine(
        format.colorize(),
        timestampFormat,
        format.printf(({ level, message, timestamp, ...meta }) => {
          const metaString = Object.keys(meta).length
            ? ` ${JSON.stringify(meta)}`
            : "";
          return `${timestamp} [${level}] ${message}${metaString}`;
        })
      ),
    }),
    new DailyRotateFile({
      dirname: logDir,
      filename: "trivia-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      zippedArchive: false,
      maxSize: "20m",
      maxFiles: process.env.LOG_MAX_FILES || "14d",
    }),
  ],
});

export const requestLogger = logger.child({ scope: "request" });
export const socketLogger = logger.child({ scope: "socket" });
export const roomLogger = logger.child({ scope: "room" });
