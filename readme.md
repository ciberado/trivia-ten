# Trivia Ten

A multiplayer trivia game made in pure javascript using express & socketio.
Create a room and play with your friends.
There's more than 4000 questions and 20 categories from open trivia database.

Try it here: https://trivia-ten.herokuapp.com/

## Reporting

- Quiz results are appended to `reports/trivia-report.xlsx` by default. Override with `REPORT_DATABASE` if needed (tilde paths like `~/report.xlsx` are expanded).
- The `Answers` sheet holds per-answer detail; the `Games` sheet holds per-quiz summaries.
- Make sure the `reports/` directory is writable wherever you run the server.

## Rules

- 10 questions, 10 seconds for each one.
- The score you get depends on the difficulty of the question.
- Get more points by being the first one to give a correct answer.
- The last question gives twice as many points but the difficulty is hidden.

![demo](https://i.imgur.com/yEr9sDy.gif)
