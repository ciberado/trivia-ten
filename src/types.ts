export interface RoomUser {
  user_id: string;
  user_name: string;
  room_name: string;
  score: number;
  is_host?: boolean;
}

export interface RawQuestion {
  category: string;
  type: string;
  difficulty: string;
  question: string;
  correct_answer: string;
  incorrect_answers: string[];
}

export interface Question extends Omit<RawQuestion, "correct_answer"> {
  correct_answer: number;
}

export interface Room {
  room_name: string;
  host_socket_id: string;
  host_user_id: string;
  users: RoomUser[];
  ten_questions: Question[];
  index: number;
}
