import { Button, Card } from "nhcx_cli";

export const Default = () => (
  <Card>
    <p style={{ margin: 0 }}>Plain card body content, no title.</p>
  </Card>
);

export const WithTitle = () => (
  <Card title="Insurance Plan">
    <div style={{ fontWeight: 700, marginBottom: 4 }}>GeneralHealth-2026</div>
    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Group Health - Active</div>
  </Card>
);

export const WithHeaderAction = () => (
  <Card
    title="Recent Claims"
    headerAction={
      <Button variant="outline" size="small" onClick={() => {}}>
        Refresh
      </Button>
    }
  >
    <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>
      4 claims in the last 30 days.
    </p>
  </Card>
);
