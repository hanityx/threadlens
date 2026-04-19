import type { Meta, StoryObj } from "@storybook/react";
import { Disclosure } from "./Disclosure";

const meta: Meta<typeof Disclosure> = {
  title: "Design System/Disclosure",
  component: Disclosure,
};

export default meta;
type Story = StoryObj<typeof Disclosure>;

export const Closed: Story = {
  args: {
    label: "Session Overview",
    children: (
      <div style={{ display: "grid", gap: 8 }}>
        <span style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)" }}>
          Provider: Claude · 14 turns · 2.4K tokens
        </span>
      </div>
    ),
  },
};

export const Open: Story = {
  args: {
    label: "Transcript",
    open: true,
    children: (
      <div style={{ display: "grid", gap: 8 }}>
        <span style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)" }}>
          Message log content would appear here with user/assistant bubbles.
        </span>
      </div>
    ),
  },
};

export const Stacked: Story = {
  render: () => (
    <div style={{ display: "grid", gap: 8, maxWidth: 420 }}>
      <Disclosure label="Overview">
        <span style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)" }}>
          Session metadata and key-value pairs.
        </span>
      </Disclosure>
      <Disclosure label="Transcript" open>
        <span style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)" }}>
          Chat log with user and assistant messages.
        </span>
      </Disclosure>
      <Disclosure label="Actions">
        <span style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)" }}>
          Export, backup, and delete actions.
        </span>
      </Disclosure>
    </div>
  ),
};
