import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Tabs } from "@scc-health/ui";

describe("Tabs", () => {
  const items = [
    { id: "summary", label: "Summary" },
    { id: "drivers", label: "Drivers" },
    { id: "evidence", label: "Evidence" },
  ];

  it("moves selection to the next tab on ArrowRight, following the WAI-ARIA tabs pattern", () => {
    const onChange = vi.fn();
    render(<Tabs items={items} activeId="summary" onChange={onChange} label="Tract detail tabs" />);
    fireEvent.keyDown(screen.getByRole("tab", { name: "Summary" }), { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith("drivers");
  });

  it("wraps from the last tab to the first on ArrowRight", () => {
    const onChange = vi.fn();
    render(<Tabs items={items} activeId="evidence" onChange={onChange} label="Tract detail tabs" />);
    fireEvent.keyDown(screen.getByRole("tab", { name: "Evidence" }), { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith("summary");
  });

  it("only the active tab is in the keyboard tab order (roving tabindex)", () => {
    render(<Tabs items={items} activeId="drivers" onChange={() => {}} label="Tract detail tabs" />);
    expect(screen.getByRole("tab", { name: "Drivers" })).toHaveAttribute("tabIndex", "0");
    expect(screen.getByRole("tab", { name: "Summary" })).toHaveAttribute("tabIndex", "-1");
    expect(screen.getByRole("tab", { name: "Evidence" })).toHaveAttribute("tabIndex", "-1");
  });
});
