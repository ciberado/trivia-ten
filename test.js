setInterval(function () {
  is_first_to_answer = true;

  // Display questions while it's less than 10
  if (i < 10) {
    // Get next question
    current_question = ten_questions[i];
    console.log(`⚠ ${i + 1}th question is: ${current_question.question}`);
    console.log(
      `⚠ Answer is: ${current_question.difficulty} ${current_question.correct_answer}`
    );

    // Get shuffled responses and correct one
    correct_response = current_question.correct_answer;
    responses = [
      current_question.correct_answer,
      ...current_question.incorrect_answers,
    ];
    shuffle(responses);

    // Display question
    io.in(room).emit("show_question", {
      number: i + 1,
      difficulty: current_question.difficulty,
      category: current_question.category,
      question: current_question.question,
      choices: responses,
    });

    // Next
    i++;
  }
}, 2000);

// Receive user choice and add his score
socket.on("send_choice", (choice_id) => {
  // Calculate score
  score_to_add = 0;
  if (responses[choice_id] == correct_response) {
    if (current_question.difficulty == "easy") {
      score_to_add = 20;
    } else if (current_question.difficulty == "medium") {
      score_to_add = 30;
    } else {
      score_to_add = 40;
    }
    if (is_first_to_answer) {
      score_to_add += 10;
      is_first_to_answer = false;
    }
    if (i == 9) {
      score_to_add *= 2;
    }

    // Add score
    add_score(socket.id, score_to_add);
  }
});
