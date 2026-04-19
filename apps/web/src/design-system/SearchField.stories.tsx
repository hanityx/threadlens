import type { Meta, StoryObj } from "@storybook/react";

function SearchFieldPreview() {
  return (
    <div style={{ display: "grid", gap: 12, maxWidth: 640 }}>
      <div className="toolbar-search-shell is-input">
        <span className="toolbar-search-prompt" aria-hidden="true">
          &gt;
        </span>
        <input className="search-input toolbar-search-input" placeholder="Search sessions or threads" defaultValue="" />
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div className="toolbar-search-shell is-input" style={{ flex: "1 1 320px" }}>
          <span className="toolbar-search-prompt" aria-hidden="true">
            &gt;
          </span>
          <input className="search-input toolbar-search-input" placeholder="Search transcript lines" defaultValue="" />
        </div>
        <div className="toolbar-search-shell is-select" style={{ minWidth: 170 }}>
          <select className="filter-select toolbar-search-select" defaultValue="all">
            <option value="all">All</option>
            <option value="ok">OK</option>
            <option value="fail">Fail</option>
          </select>
          <span className="toolbar-search-chevron" aria-hidden="true">
            ▾
          </span>
        </div>
      </div>
    </div>
  );
}

const meta: Meta<typeof SearchFieldPreview> = {
  title: "Design System/Search Field",
  component: SearchFieldPreview,
};

export default meta;
type Story = StoryObj<typeof SearchFieldPreview>;

export const Default: Story = {
  render: () => <SearchFieldPreview />,
};
