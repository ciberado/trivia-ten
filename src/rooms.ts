import type { Question, RawQuestion, Room, RoomUser } from "./types";
import { roomLogger } from "./logger";

const rooms: Room[] = [];

export function create_room(
  user_id: string,
  user_name: string,
  room_name: string
): { user: RoomUser; room: Room } {
  const existing = rooms.find((room) => room.room_name === room_name);
  if (existing) {
    roomLogger.warn("Attempt to create existing room", {
      user_id,
      user_name,
      room_name,
    });
    throw new Error("room_exists");
  }

  const user: RoomUser = {
    user_id,
    user_name,
    room_name,
    score: 0,
    is_host: true,
  };

  const room: Room = {
    room_name,
    host_socket_id: user_id,
    host_user_id: user_id,
    users: [user],
    ten_questions: [],
    index: 0,
  };

  rooms.push(room);
  roomLogger.info("Room created", {
    room_name,
    host_socket_id: user_id,
    user_count: room.users.length,
  });

  return { user, room };
}

export function join_room(
  user_id: string,
  user_name: string,
  room_name: string
): { user: RoomUser; room: Room } {
  const current_room = rooms.find((room) => room.room_name === room_name);
  if (!current_room) {
    roomLogger.warn("Join attempt for missing room", {
      user_id,
      user_name,
      room_name,
    });
    throw new Error("room_not_found");
  }

  const user: RoomUser = { user_id, user_name, room_name, score: 0 };
  user.is_host = false;
  current_room.users.push(user);
  roomLogger.info("User joined room", {
    room_name,
    user_id,
    user_name,
    total_users: current_room.users.length,
  });
  return { user, room: current_room };
}

export function remove_user(
  current_user: RoomUser,
  current_room: Room
): boolean {
  const userIndex = current_room.users.findIndex(
    (candidate) => candidate.user_id === current_user.user_id
  );

  if (userIndex !== -1) {
    current_room.users.splice(userIndex, 1);
  }

  roomLogger.info("User removed from room", {
    room_name: current_room.room_name,
    user_id: current_user.user_id,
    remaining_users: current_room.users.length,
  });

  const is_host = current_user.user_id === current_room.host_user_id;
  const is_empty = current_room.users.length === 0;

  if (is_host || is_empty) {
    const roomIndex = rooms.findIndex(
      (candidate) => candidate.room_name === current_room.room_name
    );

    if (roomIndex !== -1) {
      rooms.splice(roomIndex, 1);
    }
    roomLogger.warn("Room removed", {
      room_name: current_room.room_name,
      reason: is_host ? "host_disconnect" : "empty_room",
    });
    return true;
  }

  return false;
}

export function get_room_by_name(room_name: string): Room | undefined {
  return rooms.find((room) => room.room_name === room_name);
}

export function get_room_usernames(current_room: Room): string[] {
  return current_room.users.map((entry) => entry.user_name);
}

export function add_ten_questions(
  current_room: Room,
  json_results: RawQuestion[]
): void {
  current_room.ten_questions = json_results.map((rawQuestion) =>
    normalise_question(rawQuestion)
  );
  current_room.index = 0;
  roomLogger.info("Questions loaded for room", {
    room_name: current_room.room_name,
    question_count: current_room.ten_questions.length,
  });
}

export function get_a_question(current_room: Room): Question | undefined {
  const question = current_room.ten_questions[current_room.index];
  if (question) {
    current_room.index += 1;
    roomLogger.debug("Question served", {
      room_name: current_room.room_name,
      next_index: current_room.index,
    });
  }
  return question;
}

export function get_last_question(current_room: Room): Question | undefined {
  const previousIndex = current_room.index - 1;
  if (previousIndex < 0) {
    return undefined;
  }
  roomLogger.debug("Retrieving last question", {
    room_name: current_room.room_name,
    index: previousIndex,
  });
  return current_room.ten_questions[previousIndex];
}

function compare_scores(a: RoomUser, b: RoomUser): number {
  if (a.score < b.score) {
    return 1;
  }
  if (a.score > b.score) {
    return -1;
  }
  return 0;
}

export function get_room_scores(current_room: Room): RoomUser[] {
  return current_room.users
    .filter((user) => user.user_id !== current_room.host_user_id)
    .sort(compare_scores);
}

export function add_score(
  current_room: Room,
  userid: string,
  score: number
): void {
  const userIndex = current_room.users.findIndex(
    (entry) => entry.user_id === userid
  );

  if (userIndex !== -1) {
    current_room.users[userIndex].score += score;
    roomLogger.info("Score updated", {
      room_name: current_room.room_name,
      user_id: userid,
      new_score: current_room.users[userIndex].score,
      added: score,
    });
  }
}

function normalise_question(raw: RawQuestion): Question {
  const answers = [...raw.incorrect_answers, raw.correct_answer];
  const shuffled = [...answers].sort(() => Math.random() - 0.5);
  const correctIndex = shuffled.indexOf(raw.correct_answer);

  return {
    ...raw,
    incorrect_answers: shuffled,
    correct_answer: correctIndex,
  };
}
