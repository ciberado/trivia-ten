export interface GameSummary {
  id: string;
  roomId: string;
  quizTitle: string;
  category: string;
  playedAt: string;
  playerCount: number;
  durationMinutes: number;
  winner: string;
  averageScore: number;
  accuracy: number;
  fastestAnswerMs: number;
}

export interface QuestionBankPerformance {
  id: string;
  quizTitle: string;
  category: string;
  gamesPlayed: number;
  averageAccuracy: number;
  averageTimeMs: number;
  mostChallengingTopic: string;
  mostReliableQuestion: string;
}

export interface GameQuestionBreakdown {
  questionNumber: number;
  prompt: string;
  accuracy: number;
  fastestAnswerMs: number;
  averageAnswerMs: number;
}

export const MOCK_GAME_SUMMARIES: GameSummary[] = [
  {
    id: "game-aws-01",
    roomId: "cloud-ops",
    quizTitle: "AWS: Basic Networking",
    category: "aws-basic-networking",
    playedAt: "2025-10-14T19:05:00.000Z",
    playerCount: 9,
    durationMinutes: 21,
    winner: "Maya",
    averageScore: 245,
    accuracy: 0.68,
    fastestAnswerMs: 1440,
  },
  {
    id: "game-sec-02",
    roomId: "security-guild",
    quizTitle: "AWS: Permissions",
    category: "aws-permissions",
    playedAt: "2025-10-15T02:30:00.000Z",
    playerCount: 7,
    durationMinutes: 19,
    winner: "Reed",
    averageScore: 228,
    accuracy: 0.61,
    fastestAnswerMs: 1625,
  },
  {
    id: "game-obs-03",
    roomId: "observability",
    quizTitle: "AWS: CloudWatch Deep Dive",
    category: "aws-cloudwatch",
    playedAt: "2025-10-15T15:15:00.000Z",
    playerCount: 11,
    durationMinutes: 23,
    winner: "Priya",
    averageScore: 255,
    accuracy: 0.73,
    fastestAnswerMs: 1302,
  },
];

export const MOCK_QUESTION_BANK_PERFORMANCE: QuestionBankPerformance[] = [
  {
    id: "qb-aws-networking",
    quizTitle: "AWS: Basic Networking",
    category: "aws-basic-networking",
    gamesPlayed: 28,
    averageAccuracy: 0.66,
    averageTimeMs: 3420,
    mostChallengingTopic: "Route tables & ACLs",
    mostReliableQuestion: "VPC Peering prerequisites",
  },
  {
    id: "qb-aws-permissions",
    quizTitle: "AWS: Permissions",
    category: "aws-permissions",
    gamesPlayed: 31,
    averageAccuracy: 0.59,
    averageTimeMs: 4025,
    mostChallengingTopic: "IAM policy evaluation",
    mostReliableQuestion: "Resource vs identity policies",
  },
  {
    id: "qb-aws-cloudwatch",
    quizTitle: "AWS: CloudWatch",
    category: "aws-cloudwatch",
    gamesPlayed: 19,
    averageAccuracy: 0.72,
    averageTimeMs: 3150,
    mostChallengingTopic: "Composite alarms",
    mostReliableQuestion: "Log insights syntax basics",
  },
];

export const MOCK_GAME_BREAKDOWNS: Record<
  string,
  GameQuestionBreakdown[]
> = {
  "game-aws-01": [
    {
      questionNumber: 1,
      prompt: "Which service provides DNS within AWS?",
      accuracy: 0.89,
      fastestAnswerMs: 1500,
      averageAnswerMs: 2850,
    },
    {
      questionNumber: 5,
      prompt: "What component controls outbound traffic at the subnet level?",
      accuracy: 0.42,
      fastestAnswerMs: 2040,
      averageAnswerMs: 3988,
    },
    {
      questionNumber: 9,
      prompt: "Which tool captures VPC flow logs?",
      accuracy: 0.63,
      fastestAnswerMs: 1560,
      averageAnswerMs: 3410,
    },
    {
      questionNumber: 10,
      prompt: "How many AZs are required for a multi-AZ RDS deployment?",
      accuracy: 0.77,
      fastestAnswerMs: 1390,
      averageAnswerMs: 3211,
    },
  ],
  "game-sec-02": [
    {
      questionNumber: 2,
      prompt: "What is the default IAM policy evaluation behavior?",
      accuracy: 0.47,
      fastestAnswerMs: 1775,
      averageAnswerMs: 4150,
    },
    {
      questionNumber: 6,
      prompt: "Which policy type is needed for cross-account access?",
      accuracy: 0.59,
      fastestAnswerMs: 1880,
      averageAnswerMs: 3785,
    },
    {
      questionNumber: 8,
      prompt: "Where do service control policies apply?",
      accuracy: 0.54,
      fastestAnswerMs: 1705,
      averageAnswerMs: 3490,
    },
    {
      questionNumber: 10,
      prompt: "How do you audit unused IAM roles?",
      accuracy: 0.39,
      fastestAnswerMs: 1985,
      averageAnswerMs: 4360,
    },
  ],
  "game-obs-03": [
    {
      questionNumber: 1,
      prompt: "Which namespace tracks EC2 CPU metrics?",
      accuracy: 0.93,
      fastestAnswerMs: 1288,
      averageAnswerMs: 2980,
    },
    {
      questionNumber: 4,
      prompt: "What feature enables cross-account dashboards?",
      accuracy: 0.65,
      fastestAnswerMs: 1345,
      averageAnswerMs: 3325,
    },
    {
      questionNumber: 7,
      prompt: "How do metric filters map logs to metrics?",
      accuracy: 0.58,
      fastestAnswerMs: 1490,
      averageAnswerMs: 3560,
    },
    {
      questionNumber: 9,
      prompt: "What is the retention limit for log groups?",
      accuracy: 0.71,
      fastestAnswerMs: 1370,
      averageAnswerMs: 3115,
    },
  ],
};
