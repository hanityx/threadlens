import type { Preview } from "@storybook/react";
import "../src/design-system/index.css";

const preview: Preview = {
  parameters: {
    backgrounds: {
      default: "dark",
      values: [
        { name: "dark", value: "#0b0c0d" },
        { name: "light", value: "#f8f9fb" },
      ],
    },
    layout: "centered",
  },
  decorators: [
    (Story, context) => {
      const bg = context.globals?.backgrounds?.value;
      const isLight = bg === "#f8f9fb";
      if (typeof document !== "undefined") {
        document.documentElement.setAttribute(
          "data-theme",
          isLight ? "light" : "dark",
        );
      }
      return <Story />;
    },
  ],
};

export default preview;
