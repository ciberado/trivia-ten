import { useMemo, useState } from "react";
import {
  Card,
  Col,
  Descriptions,
  Divider,
  Empty,
  Progress,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";

import {
  MOCK_GAME_BREAKDOWNS,
  MOCK_GAME_SUMMARIES,
  MOCK_QUESTION_BANK_PERFORMANCE,
  type GameQuestionBreakdown,
  type GameSummary,
  type QuestionBankPerformance,
} from "../../mocks/gameAnalytics";

const { Title, Paragraph, Text } = Typography;

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatMilliseconds(value: number): string {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(2)}s`;
  }
  return `${value}ms`;
}

function formatMinutes(value: number): string {
  return `${value} min`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function GameAnalyticsDashboard(): JSX.Element {
  const [selectedGameId, setSelectedGameId] = useState<string | undefined>(
    MOCK_GAME_SUMMARIES[0]?.id
  );

  const gameColumns: ColumnsType<GameSummary> = useMemo(
    () => [
      {
        title: "Quiz",
        dataIndex: "quizTitle",
        key: "quizTitle",
        render: (value, record) => (
          <Space direction="vertical" size={0}>
            <Text strong>{value}</Text>
            <Tag color="blue">{record.category}</Tag>
          </Space>
        ),
      },
      {
        title: "Played",
        dataIndex: "playedAt",
        key: "playedAt",
        render: (value: string) => formatDate(value),
      },
      {
        title: "Players",
        dataIndex: "playerCount",
        key: "playerCount",
      },
      {
        title: "Duration",
        dataIndex: "durationMinutes",
        key: "durationMinutes",
        render: (value: number) => formatMinutes(value),
      },
      {
        title: "Accuracy",
        dataIndex: "accuracy",
        key: "accuracy",
        render: (value: number) => (
          <Progress
            percent={Math.round(value * 100)}
            size="small"
            status={value >= 0.7 ? "success" : value >= 0.5 ? "normal" : "exception"}
          />
        ),
      },
      {
        title: "Winner",
        dataIndex: "winner",
        key: "winner",
      },
    ],
    []
  );

  const bankColumns: ColumnsType<QuestionBankPerformance> = useMemo(
    () => [
      {
        title: "Question Bank",
        dataIndex: "quizTitle",
        key: "quizTitle",
        render: (value: string, record) => (
          <Space direction="vertical" size={0}>
            <Text strong>{value}</Text>
            <Tag color="purple">{record.category}</Tag>
          </Space>
        ),
      },
      {
        title: "Games",
        dataIndex: "gamesPlayed",
        key: "gamesPlayed",
      },
      {
        title: "Avg Accuracy",
        dataIndex: "averageAccuracy",
        key: "averageAccuracy",
        render: (value: number) => formatPercent(value),
      },
      {
        title: "Avg Answer Time",
        dataIndex: "averageTimeMs",
        key: "averageTimeMs",
        render: (value: number) => formatMilliseconds(value),
      },
      {
        title: "Most Challenging",
        dataIndex: "mostChallengingTopic",
        key: "mostChallengingTopic",
      },
    ],
    []
  );

  const questionColumns: ColumnsType<GameQuestionBreakdown> = useMemo(
    () => [
      {
        title: "#",
        dataIndex: "questionNumber",
        key: "questionNumber",
        width: 60,
        align: "center",
      },
      {
        title: "Prompt",
        dataIndex: "prompt",
        key: "prompt",
      },
      {
        title: "Accuracy",
        dataIndex: "accuracy",
        key: "accuracy",
        render: (value: number) => formatPercent(value),
      },
      {
        title: "Fastest",
        dataIndex: "fastestAnswerMs",
        key: "fastestAnswerMs",
        render: (value: number) => formatMilliseconds(value),
      },
      {
        title: "Average",
        dataIndex: "averageAnswerMs",
        key: "averageAnswerMs",
        render: (value: number) => formatMilliseconds(value),
      },
    ],
    []
  );

  const selectedGame = useMemo(
    () => MOCK_GAME_SUMMARIES.find((entry) => entry.id === selectedGameId),
    [selectedGameId]
  );

  const questionBreakdown = useMemo(
    () => (selectedGameId ? MOCK_GAME_BREAKDOWNS[selectedGameId] ?? [] : []),
    [selectedGameId]
  );

  const aggregateStats = useMemo(() => {
    if (MOCK_GAME_SUMMARIES.length === 0) {
      return {
        totalGames: 0,
        averageAccuracy: 0,
        totalPlayers: 0,
      };
    }

    const totals = MOCK_GAME_SUMMARIES.reduce(
      (acc, current) => {
        acc.accuracy += current.accuracy;
        acc.players += current.playerCount;
        return acc;
      },
      { accuracy: 0, players: 0 }
    );

    return {
      totalGames: MOCK_GAME_SUMMARIES.length,
      averageAccuracy: totals.accuracy / MOCK_GAME_SUMMARIES.length,
      totalPlayers: totals.players,
    };
  }, []);

  return (
    <Row gutter={[16, 16]}>
      <Col span={24}>
        <Card>
          <Row gutter={[16, 16]}>
            <Col span={24}>
              <Title level={3}>Game Analytics</Title>
              <Paragraph>
                Review recently completed games, compare question bank
                performance, and dig into the questions players found most
                challenging. Data uses representative mock values while the live
                feed is under development.
              </Paragraph>
            </Col>
            <Col xs={24} md={8}>
              <Statistic
                title="Games tracked"
                value={aggregateStats.totalGames}
              />
            </Col>
            <Col xs={24} md={8}>
              <Statistic
                title="Average accuracy"
                value={formatPercent(aggregateStats.averageAccuracy)}
              />
            </Col>
            <Col xs={24} md={8}>
              <Statistic
                title="Total participants"
                value={aggregateStats.totalPlayers}
              />
            </Col>
          </Row>
        </Card>
      </Col>

      <Col xl={14} lg={24}>
        <Card title="Game Explorer">
          <Table<GameSummary>
            rowKey="id"
            size="small"
            dataSource={MOCK_GAME_SUMMARIES}
            columns={gameColumns}
            pagination={false}
            onRow={(record) => ({
              onClick: () => setSelectedGameId(record.id),
            })}
            rowClassName={(record) =>
              record.id === selectedGameId ? "ant-table-row-selected" : ""
            }
          />
        </Card>
      </Col>

      <Col xl={10} lg={24}>
        <Card title="Question Bank Performance">
          <Table<QuestionBankPerformance>
            rowKey="id"
            size="small"
            dataSource={MOCK_QUESTION_BANK_PERFORMANCE}
            columns={bankColumns}
            pagination={false}
          />
          <Divider />
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            {MOCK_QUESTION_BANK_PERFORMANCE.slice(0, 3).map((bank) => (
              <Card key={bank.id} size="small" bordered>
                <Space direction="vertical" size={4}>
                  <Text strong>{bank.quizTitle}</Text>
                  <Text type="secondary">
                    {formatPercent(bank.averageAccuracy)} average accuracy •{" "}
                    {formatMilliseconds(bank.averageTimeMs)} average answer time
                  </Text>
                  <Text>
                    Reliable: {bank.mostReliableQuestion} | Challenging:{" "}
                    {bank.mostChallengingTopic}
                  </Text>
                </Space>
              </Card>
            ))}
          </Space>
        </Card>
      </Col>

      <Col span={24}>
        <Card title="Selected Game Breakdown">
          {selectedGame ? (
            <Space direction="vertical" size="large" style={{ width: "100%" }}>
              <Descriptions
                size="small"
                column={{ xs: 1, sm: 2, md: 3 }}
                bordered
              >
                <Descriptions.Item label="Room">
                  {selectedGame.roomId}
                </Descriptions.Item>
                <Descriptions.Item label="Quiz">
                  {selectedGame.quizTitle}
                </Descriptions.Item>
                <Descriptions.Item label="Played at">
                  {formatDate(selectedGame.playedAt)}
                </Descriptions.Item>
                <Descriptions.Item label="Players">
                  {selectedGame.playerCount}
                </Descriptions.Item>
                <Descriptions.Item label="Avg score">
                  {selectedGame.averageScore}
                </Descriptions.Item>
                <Descriptions.Item label="Overall accuracy">
                  {formatPercent(selectedGame.accuracy)}
                </Descriptions.Item>
                <Descriptions.Item label="Fastest correct answer">
                  {formatMilliseconds(selectedGame.fastestAnswerMs)}
                </Descriptions.Item>
                <Descriptions.Item label="Winner">
                  <Tag color="green">{selectedGame.winner}</Tag>
                </Descriptions.Item>
              </Descriptions>

              <Table<GameQuestionBreakdown>
                rowKey={(record) => `${selectedGame.id}-${record.questionNumber}`}
                size="small"
                dataSource={questionBreakdown}
                columns={questionColumns}
                pagination={false}
              />
            </Space>
          ) : (
            <Empty
              description="Select a game from the explorer to view question-level insights."
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          )}
        </Card>
      </Col>
    </Row>
  );
}
