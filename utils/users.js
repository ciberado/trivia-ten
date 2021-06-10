const users = [];

// Add user to user's list
function user_join(id, username, room) {
  const user = { id, username, room, score: 0 };
  users.push(user);
  console.log(users);
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

// Get scores in a room
function get_room_scores(room) {
  let temp = users
    .filter((user) => {
      return user.room == room;
    })
    .map((user) => {
      return { name: user.username, score: user.score };
    });
  return temp.sort(compare);
}

// Function to sort room scores
function compare(a, b) {
  let comparison = 0;
  if (a.score < b.score) {
    comparison = 1;
  } else if (a.score > b.score) {
    comparison = -1;
  }
  return comparison;
}

// Add score to user
function add_score(userid, score) {
  let index;
  index = users.findIndex((element) => element.id == userid);
  users[index].score += score;
  console.log(`adding ${score}`);
}

module.exports = {
  user_join,
  user_leave,
  get_room_users,
  get_room_scores,
  set_score_zero,
  add_score,
};
