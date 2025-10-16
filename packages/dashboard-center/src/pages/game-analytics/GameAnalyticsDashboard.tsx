import { Card, Col, Row, Typography } from "antd";

const { Title, Paragraph } = Typography;

export function GameAnalyticsDashboard(): JSX.Element {
  return (
    <Row gutter={[16, 16]}>
      <Col span={24}>
        <Card>
          <Title level={3}>Game Analytics</Title>
          <Paragraph>
            Historical game performance, question bank comparisons, and drill
            downs will populate this workspace.
          </Paragraph>
        </Card>
      </Col>
      <Col span={12}>
        <Card title="Game Explorer">Filterable game list placeholder.</Card>
      </Col>
      <Col span={12}>
        <Card title="Question Bank Performance">
          Accuracy and timing charts placeholder.
        </Card>
      </Col>
    </Row>
  );
}
