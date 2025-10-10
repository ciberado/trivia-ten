import { createLogger, format, transports } from "winston";

const timestampFormat = format.timestamp({ format: "YYYY-MM-DD HH:mm:ss.SSS" });

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
  ],
});

export const requestLogger = logger.child({ scope: "request" });
export const socketLogger = logger.child({ scope: "socket" });
export const roomLogger = logger.child({ scope: "room" });
