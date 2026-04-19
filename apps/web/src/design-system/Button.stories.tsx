import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "./Button";

const meta: Meta<typeof Button> = {
  title: "Design System/Button",
  component: Button,
  argTypes: {
    variant: {
      control: "select",
      options: ["outline", "accent", "danger", "base"],
    },
    disabled: { control: "boolean" },
  },
};

export default meta;
type Story = StoryObj<typeof Button>;

export const Outline: Story = {
  args: { variant: "outline", children: "Outline" },
};

export const Accent: Story = {
  args: { variant: "accent", children: "Accent" },
};

export const Danger: Story = {
  args: { variant: "danger", children: "Danger" },
};

export const Base: Story = {
  args: { variant: "base", children: "Base" },
};

export const Disabled: Story = {
  args: { variant: "accent", children: "Disabled", disabled: true },
};

export const AllVariants: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      <Button variant="outline">Outline</Button>
      <Button variant="base">Base</Button>
      <Button variant="accent">Accent</Button>
      <Button variant="danger">Danger</Button>
      <Button variant="accent" disabled>
        Disabled
      </Button>
    </div>
  ),
};
