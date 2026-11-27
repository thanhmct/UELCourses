import { describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { EffectiveBadgeChip, EnBadge, ErrorBox } from "../ui";
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
  it("shows one shared missing-content message and sticker without error details", () => {
    render(<ErrorBox>HTTP 404</ErrorBox>);
    expect(screen.getByRole("alert")).toHaveTextContent("Mất tiu nội dung òi!");
    expect(screen.getByRole("alert")).not.toHaveTextContent("HTTP 404");
    expect(screen.getByRole("alert").querySelector("img")?.getAttribute("src")).toContain("/stickers/02_mat_sau.svg");
  });
  it("only displays the highest-severity error when multiple errors are active", async () => {
    render(
      <>
        <ErrorBox severity="error">Minor failure</ErrorBox>
        <ErrorBox severity="critical">Major failure</ErrorBox>
      </>,
    );
    expect(await screen.findAllByRole("alert")).toHaveLength(1);
  });
});
