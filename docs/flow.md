# Flow

## Original flow

```
c:ask_start_game --> s:(read question bank)

-- 800ms --> loop:
             c:ask_question --> s:display_question(q) -> c:(show question)
                            -- 10000ms --> c:ask_results(idx) --> s:display_results(answer) --> c:(shows correct answer)
                                                              -- 2000ms --> c:ask_leaderboard --> s:display_leaderboard(scores) --> c:(show scores)
                                                                                              -- 3000ms --> loop
```