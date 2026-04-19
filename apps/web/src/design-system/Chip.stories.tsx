import type { Meta, StoryObj } from "@storybook/react";
import { Chip } from "./Chip";

const meta: Meta<typeof Chip> = {
  title: "Design System/Chip",
  component: Chip,
  argTypes: {
    active: { control: "boolean" },
    interactive: { control: "boolean" },
  },
};

export default meta;
type Story = StoryObj<typeof Chip>;

export const Default: Story = {
  args: { children: "Claude" },
};

export const Active: Story = {
  args: { children: "ChatGPT", active: true },
};

export const NonInteractive: Story = {
  args: { children: "Label", interactive: false },
};

export const ChipSet: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <Chip active>All</Chip>
      <Chip>Claude</Chip>
      <Chip>ChatGPT</Chip>
      <Chip>Gemini</Chip>
      <Chip>Copilot</Chip>
    </div>
  ),
};
