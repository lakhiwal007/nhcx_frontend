import { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "nhcx_cli";

export const Default = () => {
  const [value, setValue] = useState("");
  return <Input placeholder="Search claim ref or payment ref..." value={value} onChange={(e) => setValue(e.target.value)} />;
};

export const WithLabel = () => {
  const [value, setValue] = useState("Star Health Insurance");
  return <Input label="Payer" value={value} onChange={(e) => setValue(e.target.value)} />;
};

export const WithIcon = () => {
  const [value, setValue] = useState("");
  return (
    <Input
      icon={Search}
      placeholder="Search patient or claim ID..."
      value={value}
      onChange={(e) => setValue(e.target.value)}
    />
  );
};
