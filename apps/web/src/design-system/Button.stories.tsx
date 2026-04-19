import { useEffect } from "react";
import type { ReactNode } from "react";
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

function ButtonShowcase() {
  return (
    <div style={{ display: "grid", gap: 14, maxWidth: 720 }}>
      <div style={{ display: "grid", gap: 6 }}>
        <strong>Primary action</strong>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Button variant="accent">Run review</Button>
          <Button variant="accent" disabled>
            Running
          </Button>
        </div>
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        <strong>Secondary action</strong>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Button variant="outline">Inspect details</Button>
          <Button variant="outline">Open transcript</Button>
        </div>
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        <strong>Utility filled</strong>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Button variant="base">Copy path</Button>
          <Button variant="base">Preview export</Button>
        </div>
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        <strong>Destructive action</strong>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Button variant="danger">Delete local</Button>
        </div>
      </div>
    </div>
  );
}

function SurfaceFrame({
  theme,
  children,
}: {
  theme: "light" | "dark";
  children: ReactNode;
}) {
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    return () => {
      document.documentElement.removeAttribute("data-theme");
    };
  }, [theme]);

  return (
    <div
      style={{
        display: "grid",
        gap: 16,
        padding: 16,
        background: "var(--page-bg)",
      }}
    >
      {children}
    </div>
  );
}

function ThreadsActionSurface() {
  return (
    <div className="sub-toolbar sticky-action-bar action-toolbar">
      <div className="thread-toolbar-inline">
        <Button variant="outline">Archive selected locally</Button>
        <Button variant="outline">Impact analysis</Button>
        <Button variant="outline">Cleanup dry-run</Button>
        <Button variant="danger">Hard delete</Button>
      </div>
    </div>
  );
}

function TopControlsSurface() {
  return (
    <div className="top-controls">
      <Button variant="outline">Sync now</Button>
    </div>
  );
}

function SessionActionsSurface() {
  return (
    <div className="session-desktop-actions">
      <Button variant="outline">Open desktop transcript</Button>
      <Button variant="outline">Reveal in Finder</Button>
    </div>
  );
}

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

export const SemanticRoles: Story = {
  render: () => <ButtonShowcase />,
};

function ThemedButtonShowcase({ theme }: { theme: "light" | "dark" }) {
  return (
    <SurfaceFrame theme={theme}>
      <ButtonShowcase />
    </SurfaceFrame>
  );
}

export const SemanticRolesDark: Story = {
  render: () => <ThemedButtonShowcase theme="dark" />,
};

export const SemanticRolesLight: Story = {
  render: () => <ThemedButtonShowcase theme="light" />,
};

export const RealSurfacesLight: Story = {
  render: () => (
    <SurfaceFrame theme="light">
      <TopControlsSurface />
      <ThreadsActionSurface />
      <SessionActionsSurface />
    </SurfaceFrame>
  ),
};

export const RealSurfacesDark: Story = {
  render: () => (
    <SurfaceFrame theme="dark">
      <TopControlsSurface />
      <ThreadsActionSurface />
      <SessionActionsSurface />
    </SurfaceFrame>
  ),
};
