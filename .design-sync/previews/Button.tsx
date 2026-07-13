import { Search, Plus } from "lucide-react";
import { Button } from "nhcx_cli";

export const Primary = () => (
  <Button variant="primary" onClick={() => {}}>
    Submit Preauth
  </Button>
);

export const Outline = () => (
  <Button variant="outline" onClick={() => {}}>
    View Claim
  </Button>
);

export const Text = () => (
  <Button variant="text" onClick={() => {}}>
    Back
  </Button>
);

export const WithIcon = () => (
  <Button variant="primary" icon={Plus} onClick={() => {}}>
    New Cashless Case
  </Button>
);

export const Sizes = () => (
  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
    <Button variant="outline" size="small" icon={Search} onClick={() => {}}>
      Search
    </Button>
    <Button variant="primary" size="medium" onClick={() => {}}>
      Medium
    </Button>
    <Button variant="primary" size="large" onClick={() => {}}>
      Large
    </Button>
  </div>
);

export const Disabled = () => (
  <Button variant="primary" disabled onClick={() => {}}>
    Submit Preauth
  </Button>
);
