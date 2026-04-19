import type { Meta, StoryObj } from "@storybook/react";
import { Panel } from "@/shared/ui/components/Panel";
import { PanelHeader } from "@/shared/ui/components/PanelHeader";
import { Button } from "@/shared/ui/components/Button";

const meta: Meta<typeof Panel> = {
  title: "Design System/Panel",
  component: Panel,
};

export default meta;
type Story = StoryObj<typeof Panel>;

export const Default: Story = {
  args: {
    children: (
      <>
        <PanelHeader
          title="Panel Title"
          subtitle="Subtitle text"
          actions={<Button variant="outline">Action</Button>}
        />
        <div style={{ padding: "16px 18px" }}>
          <p style={{ margin: 0, color: "var(--text-secondary)" }}>
            Panel body content goes here. This is a frosted glass container used
            for major content sections.
          </p>
        </div>
      </>
    ),
  },
};

export const WithHeader: Story = {
  render: () => (
    <Panel style={{ maxWidth: 520 }}>
      <PanelHeader
        title="Sessions"
        subtitle="3 active providers"
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="outline">Export</Button>
            <Button variant="accent">Scan</Button>
          </div>
        }
      />
      <div style={{ padding: "16px 18px" }}>
        <p style={{ margin: 0, color: "var(--text-secondary)" }}>
          Content area with toolbar and data table would go here.
        </p>
      </div>
    </Panel>
  ),
};
