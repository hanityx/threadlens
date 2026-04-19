import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { SegmentedNav } from "@/shared/ui/components/SegmentedNav";

const meta: Meta<typeof SegmentedNav> = {
  title: "Design System/SegmentedNav",
  component: SegmentedNav,
};

export default meta;
type Story = StoryObj<typeof SegmentedNav>;

const navItems = [
  { id: "overview", label: "Overview" },
  { id: "providers", label: "Providers" },
  { id: "threads", label: "Threads" },
  { id: "search", label: "Search" },
];

export const Default: Story = {
  args: {
    items: navItems,
    activeId: "overview",
    onSelect: () => {},
  },
};

export const Interactive: Story = {
  render: () => {
    const [active, setActive] = useState("overview");
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <SegmentedNav items={navItems} activeId={active} onSelect={setActive} />
        <span
          style={{
            color: "var(--text-secondary)",
            fontSize: "var(--text-sm)",
            textAlign: "center",
          }}
        >
          Active: {active}
        </span>
      </div>
    );
  },
};
