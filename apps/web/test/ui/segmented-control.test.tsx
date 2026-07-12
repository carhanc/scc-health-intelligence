import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { SegmentedControl } from "@scc-health/ui";

describe("SegmentedControl", () => {
  const options = [
    { value: "map", label: "Map" },
    { value: "table", label: "Table" },
  ] as const;

  it("marks the current selection with aria-checked for screen-reader users", () => {
    render(<SegmentedControl label="View" value="map" onChange={() => {}} options={[...options]} />);
    expect(screen.getByRole("radio", { name: "Map" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Table" })).toHaveAttribute("aria-checked", "false");
  });

  it("calls onChange with the clicked option's value", () => {
    const onChange = vi.fn();
    render(<SegmentedControl label="View" value="map" onChange={onChange} options={[...options]} />);
    fireEvent.click(screen.getByRole("radio", { name: "Table" }));
    expect(onChange).toHaveBeenCalledWith("table");
  });
});
