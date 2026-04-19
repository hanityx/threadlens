import type { Meta, StoryObj } from "@storybook/react";
import { Badge } from "@/shared/ui/components/Badge";

const meta: Meta<typeof Badge> = {
  title: "Design System/Badge",
  component: Badge,
};

export default meta;
type Story = StoryObj<typeof Badge>;

export const Default: Story = {
  args: { children: "v0.2.2" },
};

export const BadgeRow: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      <Badge>Claude</Badge>
      <Badge>14 turns</Badge>
      <Badge>2.4K tokens</Badge>
      <Badge>Active</Badge>
    </div>
  ),
};
