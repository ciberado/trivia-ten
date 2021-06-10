// Get next question
function get_next_question(ten_questions, index) {
  // Shuffle answers
  let all_answers = [];
  all_answers[0] = ten_questions[index].correct_answer;
  all_answers[1] = ten_questions[index].incorrect_answers[0];
  all_answers[2] = ten_questions[index].incorrect_answers[1];
  all_answers[3] = ten_questions[index].incorrect_answers[2];
  for (let i = all_answers.length - 1; i > 0; i--) {
    let j = Math.floor(Math.random() * (i + 1));
    [all_answers[i], all_answers[j]] = [all_answers[j], all_answers[i]];
  }

  correct_answer = all_answers.findIndex(
    (element) => element == ten_questions[index].correct_answer
  );

  // Return question object
  obj = {
    question: ten_questions[index].question,
    category: ten_questions[index].category,
    difficulty: ten_questions[index].difficulty,
    correct_answer: correct_answer,
    all_answers: all_answers,
  };
  return obj;
}

module.exports = {
  get_next_question,
};
