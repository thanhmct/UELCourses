import { describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { EffectiveBadgeChip, EnBadge } from "../ui";
import { MockBadge } from "../MockBadge";
import { useDataSource } from "@/lib/dataSource";

describe("UI components", () => {
  it("renders effectivity badges in Vietnamese", () => {
    render(<EffectiveBadgeChip badge="expired" />);
    expect(screen.getByText("Hết hiệu lực")).toBeInTheDocument();
    render(<EffectiveBadgeChip badge="expiring" />);
    expect(screen.getByText("Sắp hết hiệu lực")).toBeInTheDocument();
    render(<EnBadge />);
    expect(screen.getByText("EN")).toBeInTheDocument();
  });
  it("shows the mock-data label only when using mocks", () => {
    const { container } = render(<MockBadge />);
    expect(container).toBeEmptyDOMElement();
    act(() => useDataSource.getState().setMock(true));
    expect(screen.getByText("Dữ liệu mẫu")).toBeInTheDocument();
  });
});
