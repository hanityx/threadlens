import type { Meta, StoryObj } from "@storybook/react";
import { StatusPill } from "./StatusPill";

const meta: Meta<typeof StatusPill> = {
  title: "Design System/StatusPill",
  component: StatusPill,
  argTypes: {
    variant: {
      control: "select",
      options: ["active", "detected", "missing", "preview"],
    },
    interactive: { control: "boolean" },
  },
};

export default meta;
type Story = StoryObj<typeof StatusPill>;

export const Active: Story = {
  args: { variant: "active", children: "Active" },
};

export const Detected: Story = {
  args: { variant: "detected", children: "Detected" },
};

export const Missing: Story = {
  args: { variant: "missing", children: "Missing" },
};

export const Interactive: Story = {
  args: {
    variant: "active",
    children: "Active",
    interactive: true,
    action: "→ View",
  },
};

export const AllVariants: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      <StatusPill variant="active">Active</StatusPill>
      <StatusPill variant="detected">Detected</StatusPill>
      <StatusPill variant="missing">Missing</StatusPill>
      <StatusPill variant="active" interactive action="→ View">
        Interactive
      </StatusPill>
    </div>
  ),
};
