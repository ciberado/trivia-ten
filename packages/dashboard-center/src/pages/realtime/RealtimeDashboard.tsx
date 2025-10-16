import { Card, Col, Row, Typography } from "antd";

const { Title, Paragraph } = Typography;

export function RealtimeDashboard(): JSX.Element {
  return (
    <Row gutter={[16, 16]}>
      <Col span={24}>
        <Card>
          <Title level={3}>Realtime Operations</Title>
          <Paragraph>
            This view will stream active room states, player presence, and
            system alerts using the trivia server WebSocket feeds.
          </Paragraph>
        </Card>
      </Col>
      <Col span={8}>
        <Card title="Active Rooms">Live room cards will render here.</Card>
      </Col>
      <Col span={8}>
        <Card title="Player Presence">Online player roster placeholder.</Card>
      </Col>
      <Col span={8}>
        <Card title="System Health">Operational metrics placeholder.</Card>
      </Col>
    </Row>
  );
}
