import { AmountGrid } from "nhcx_cli";

export const Default = () => (
  <AmountGrid
    totals={{
      billed: { currency: "₹", value: 68000 },
      approved: { currency: "₹", value: 63250 },
      eligible: { currency: "₹", value: 65000 },
      disallowed: { currency: "₹", value: 4750 },
    }}
  />
);
