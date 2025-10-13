import { io, Socket } from "socket.io-client";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

interface Args {
  address: string;
  players: number;
  rounds: number;
  category?: string;
  delayMin?: number;
  delayMax?: number;
}

interface PlayerContext {
  socket: Socket;
  name: string;
  questionTimings: Record<number, number>;
}

interface HostContext {
  socket: Socket;
  room: string;
  name: string;
}

const DEFAULT_CATEGORY = "aws-basic-networking";
const NAME_PREFIX = "Bot";
const HOST_NAME = "QuizMaster";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandomIndex(length: number): number {
  return Math.floor(Math.random() * length);
}

function createHost(address: string): HostContext {
  const socket = io(address, {
    transports: ["websocket"],
  });

  return {
    socket,
    room: `room-${Math.random().toString(36).slice(2, 8)}`,
    name: HOST_NAME,
  };
}

function createPlayers(address: string, count: number): PlayerContext[] {
  return new Array(count).fill(null).map((_, index) => {
    const socket = io(address, {
      transports: ["websocket"],
    });
    const name = `${NAME_PREFIX}-${index + 1}`;
    return {
      socket,
      name,
      questionTimings: {},
    };
  });
}

async function waitForEvent<T>(socket: Socket, event: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timeout waiting for event ${event}`));
    }, 15000);

    socket.once(event, (payload: T) => {
      clearTimeout(timeout);
      resolve(payload);
    });
  });
}

async function runRound(args: Args, host: HostContext, players: PlayerContext[], roundIndex: number) {
  console.log(`\n=== Round ${roundIndex + 1} ===`);
  console.log(`Using room: ${host.room}`);

  const hostReady = waitForEvent<{ room: string }>(host.socket, "room_created");
  host.socket.emit("create_room", { username: host.name, room: host.room });
  await hostReady;
  console.log(`Host created room ${host.room}`);

  const playerJoins = players.map(async (player) => {
    const joined = waitForEvent<{ room: string }>(player.socket, "room_joined");
    player.socket.emit("join_room", { username: player.name, room: host.room });
    await joined;
    console.log(`Player ${player.name} joined ${host.room}`);
  });

  await Promise.all(playerJoins);

  const startSignal = waitForEvent<{
    players: string[];
    questionCount: number;
  }>(host.socket, "quiz_started");
  host.socket.emit("ask_start_game", args.category ?? DEFAULT_CATEGORY);
  const { players: startPlayers, questionCount } = await startSignal;
  console.log(
    `Quiz has ${questionCount} questions for players: ${startPlayers.join(", ")}`
  );

  players.forEach((player) => {
    player.socket.on("display_question", async (payload) => {
      const { all_answers, index } = payload;
      player.questionTimings[index] = Date.now();
      const choice = pickRandomIndex(all_answers.length);
      const delay = randomDelay(args.delayMin ?? 500, args.delayMax ?? 2000);
      await sleep(delay);
      player.socket.emit("user_sent_choice", String(choice));
    });
  });

  await waitForEvent(host.socket, "quiz_finished");
  console.log("Quiz finished");

  players.forEach((player) => {
    player.socket.off("display_question");
    player.questionTimings = {};
  });
}

async function runSimulation(args: Args) {
  const host = createHost(args.address);
  const players = createPlayers(args.address, args.players);

  try {
    for (let round = 0; round < args.rounds; round += 1) {
      await runRound(args, host, players, round);
      host.room = `room-${Math.random().toString(36).slice(2, 8)}`;
      await sleep(1000);
    }
  } catch (error) {
    console.error("Simulation error", error);
  } finally {
    host.socket.disconnect();
    players.forEach((player) => player.socket.disconnect());
  }
}

async function main() {
  const argv = (await yargs(hideBin(process.argv))
    .scriptName("trivia-sim")
    .usage("$0 --address <url> --players <n> --rounds <n>")
    .option("address", {
      type: "string",
      demandOption: true,
      describe: "Socket.IO server address",
    })
    .option("players", {
      type: "number",
      default: 3,
      describe: "Number of simulated players",
    })
    .option("rounds", {
      type: "number",
      default: 1,
      describe: "Number of quizzes to play",
    })
    .option("category", {
      type: "string",
      default: DEFAULT_CATEGORY,
      describe: "Quiz category identifier",
    })
    .option("delayMin", {
      type: "number",
      default: 500,
      describe: "Minimum simulated answer delay (ms)",
    })
    .option("delayMax", {
      type: "number",
      default: 2000,
      describe: "Maximum simulated answer delay (ms)",
    })
    .check((parsed: Partial<Args>) => {
      if (!parsed.players || parsed.players <= 0) {
        throw new Error("Players must be greater than 0");
      }
      if (!parsed.rounds || parsed.rounds <= 0) {
        throw new Error("Rounds must be greater than 0");
      }
      if ((parsed.delayMin ?? 0) < 0 || (parsed.delayMax ?? 0) < 0) {
        throw new Error("Delays must be non-negative");
      }
      if (
        parsed.delayMin !== undefined &&
        parsed.delayMax !== undefined &&
        parsed.delayMin > parsed.delayMax
      ) {
        throw new Error("delayMin cannot be greater than delayMax");
      }
      return true;
    })
    .help().argv) as Args;

  await runSimulation(argv);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
