const rooms = [];

module.exports = {
  add_user,
  get_room_usernames,
  remove_user,
  add_ten_questions,
  get_a_question,
  get_last_question,
  get_room_scores,
  add_score,
};

function add_user(user_id, user_name, room_name) {
  // Define user object
  const user = { user_id, user_name, room_name, score: 0 };

  // Check if room exists
  const found = rooms.some((el) => el.room_name === room_name);
  let index_of_room;

  // If yes, add user to it
  if (found) {
    index_of_room = rooms.findIndex(
      (room_to_find) => room_to_find.room_name === room_name
    );
    rooms[index_of_room].users.push(user);
  }

  // If not, add room and then user
  if (!found) {
    const room = { room_name, users: [], ten_questions: [], index: 0 };
    rooms.push(room);
    index_of_room = rooms.length - 1;
    rooms[index_of_room].users.push(user);
  }

  // Return user
  return { user, room: rooms[index_of_room] };
}

function remove_user(current_user, current_room) {
  // Remove user from room
  let i = current_room.users.findIndex(
    (el) => el.user_name == current_user.user_name
  );
  if (i !== -1) {
    current_room.users.splice(i, 1)[0];
  }

  // Remove room if there's no users left
  if (get_room_usernames(current_room).length == 0) {
    let i = rooms.findIndex((el) => el.room_name == current_user.room_name);
    if (i !== -1) {
      rooms.splice(i, 1)[0];
    }
  }
  return { current_user, current_room };
}

function get_room_usernames(current_room) {
  return current_room.users.map((el) => {
    return el.user_name;
  });
}

function add_ten_questions(current_room, json_results) {
  // Add the ten questions
  current_room.ten_questions = json_results;

  // Add the correct question to the incorrect ones
  // Shuffle all
  // Save correct answer index in correct_answer
  for (i = 0; i < current_room.ten_questions.length; i++) {
    current_room.ten_questions[i].incorrect_answers.push(
      current_room.ten_questions[i].correct_answer
    );
    current_room.ten_questions[i].incorrect_answers.sort(
      () => Math.random() - 0.5
    );
    current_room.ten_questions[i].correct_answer = current_room.ten_questions[
      i
    ].incorrect_answers.indexOf(current_room.ten_questions[i].correct_answer);
  }
}

function get_a_question(current_room) {
  return current_room.ten_questions[current_room.index++];
}

function get_last_question(current_room) {
  return current_room.ten_questions[current_room.index - 1];
}

function compare(a, b) {
  let comparison = 0;
  if (a.score < b.score) {
    comparison = 1;
  } else if (a.score > b.score) {
    comparison = -1;
  }
  return comparison;
}

function get_room_scores(current_room) {
  return current_room.users.sort(compare);
}

function add_score(current_room, userid, score) {
  let index;
  index = current_room.users.findIndex((el) => el.user_id == userid);
  current_room.users[index].score += score;
}
