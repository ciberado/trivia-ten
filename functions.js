const users = [];

// Add user to user's list
function user_join(id, username, room) {
  const user = { id, username, room, score: 5 };
  users.push(user);
  return user;
}

// Change everyone's score to zero
function set_score_zero(room) {
  for (let i = 0; i < users.length; i++) {
    if (users[i].room == room) {
      users[i].score = 0;
    }
  }
  return;
}

// Remove user from user's list
function user_leave(id) {
  const index = users.findIndex((user) => user.id === id);

  if (index !== -1) {
    return users.splice(index, 1)[0];
  }
}

// Get users in a room
function get_room_users(room) {
  return users
    .filter((user) => {
      return user.room == room;
    })
    .map((user) => {
      return user.username;
    });
}

// Shuffle an array
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    let j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

module.exports = {
  user_join,
  user_leave,
  get_room_users,
  set_score_zero,
  shuffle,
};
