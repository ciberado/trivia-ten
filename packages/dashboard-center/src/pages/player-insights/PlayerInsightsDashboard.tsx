import { Card, Col, Row, Typography } from "antd";

const { Title, Paragraph } = Typography;

export function PlayerInsightsDashboard(): JSX.Element {
  return (
    <Row gutter={[16, 16]}>
      <Col span={24}>
        <Card>
          <Title level={3}>Player & Cohort Insights</Title>
          <Paragraph>
            Individual player drill-downs and cohort level trends will surface
            here once data integrations are implemented.
          </Paragraph>
        </Card>
      </Col>
      <Col span={12}>
        <Card title="Player Directory">Player lookup placeholder.</Card>
      </Col>
      <Col span={12}>
        <Card title="Cohort Metrics">Room based cohort trends placeholder.</Card>
      </Col>
    </Row>
  );
}
