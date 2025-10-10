import type { Question, RawQuestion, Room, RoomUser } from "./types";

const rooms: Room[] = [];

export function add_user(
  user_id: string,
  user_name: string,
  room_name: string
): { user: RoomUser; room: Room } {
  const user: RoomUser = { user_id, user_name, room_name, score: 0 };

  const existingIndex = rooms.findIndex(
    (roomToFind) => roomToFind.room_name === room_name
  );

  if (existingIndex >= 0) {
    rooms[existingIndex].users.push(user);
    return { user, room: rooms[existingIndex] };
  }

  const room: Room = { room_name, users: [user], ten_questions: [], index: 0 };
  rooms.push(room);

  return { user, room };
}

export function remove_user(current_user: RoomUser, current_room: Room): void {
  const userIndex = current_room.users.findIndex(
    (candidate) => candidate.user_name === current_user.user_name
  );

  if (userIndex !== -1) {
    current_room.users.splice(userIndex, 1);
  }

  if (get_room_usernames(current_room).length === 0) {
    const roomIndex = rooms.findIndex(
      (candidate) => candidate.room_name === current_user.room_name
    );

    if (roomIndex !== -1) {
      rooms.splice(roomIndex, 1);
    }
  }
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
}

export function get_a_question(current_room: Room): Question | undefined {
  const question = current_room.ten_questions[current_room.index];
  if (question) {
    current_room.index += 1;
  }
  return question;
}

export function get_last_question(current_room: Room): Question | undefined {
  const previousIndex = current_room.index - 1;
  if (previousIndex < 0) {
    return undefined;
  }
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
  return current_room.users.sort(compare_scores);
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
  }
}

function normalise_question(raw: RawQuestion): Question {
  const answers = [...raw.incorrect_answers, raw.correct_answer];
  const shuffled = answers.sort(() => Math.random() - 0.5);
  const correctIndex = shuffled.indexOf(raw.correct_answer);

  return {
    ...raw,
    incorrect_answers: shuffled,
    correct_answer: correctIndex,
  };
}
