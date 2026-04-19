import type { Meta, StoryObj } from "@storybook/react";
import { Card, CardTitle, CardDescription } from "@/shared/ui/components/Card";

const meta: Meta<typeof Card> = {
  title: "Design System/Card",
  component: Card,
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "primary", "review", "mini", "kpi"],
    },
  },
};

export default meta;
type Story = StoryObj<typeof Card>;

export const Default: Story = {
  args: {
    variant: "default",
    children: (
      <>
        <CardTitle>Insight Title</CardTitle>
        <CardDescription>
          A card for displaying aggregate insights and metrics.
        </CardDescription>
      </>
    ),
  },
};

export const Primary: Story = {
  args: {
    variant: "primary",
    children: (
      <>
        <CardTitle>Primary Insight</CardTitle>
        <CardDescription>
          The most prominent card variant with larger padding and emphasis.
        </CardDescription>
      </>
    ),
  },
};

export const Review: Story = {
  args: {
    variant: "review",
    children: (
      <>
        <CardTitle>Review Queue</CardTitle>
        <CardDescription>
          Used for review/flagged items that need attention.
        </CardDescription>
      </>
    ),
  },
};

export const Mini: Story = {
  args: {
    variant: "mini",
    children: (
      <>
        <CardTitle>42</CardTitle>
        <CardDescription>Sessions scanned</CardDescription>
      </>
    ),
  },
};

export const Kpi: Story = {
  args: {
    variant: "kpi",
    children: (
      <>
        <p className="kpi-label">Total Threads</p>
        <p className="kpi-value">1,247</p>
        <p className="kpi-hint">Across all providers</p>
      </>
    ),
  },
};

export const AllVariants: Story = {
  render: () => (
    <div style={{ display: "grid", gap: 16, maxWidth: 400 }}>
      <Card variant="default">
        <CardTitle>Default</CardTitle>
        <CardDescription>Base card style</CardDescription>
      </Card>
      <Card variant="primary">
        <CardTitle>Primary</CardTitle>
        <CardDescription>Emphasized card</CardDescription>
      </Card>
      <Card variant="review">
        <CardTitle>Review</CardTitle>
        <CardDescription>Items needing attention</CardDescription>
      </Card>
      <Card variant="mini">
        <CardTitle>128</CardTitle>
        <CardDescription>Compact metric</CardDescription>
      </Card>
      <Card variant="kpi">
        <p className="kpi-label">KPI</p>
        <p className="kpi-value">3,842</p>
        <p className="kpi-hint">Total records</p>
      </Card>
    </div>
  ),
};
