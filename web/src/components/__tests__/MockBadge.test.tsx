import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ConnectionNotice } from "@/components/MockBadge";
import { useDataSource } from "@/lib/dataSource";

describe("ConnectionNotice", () => {
  afterEach(() => {
    cleanup();
    useDataSource.setState({ offline: false, mock: false });
  });

  it("hiển thị gà con nở trứng nhún cạnh thông báo mất kết nối", () => {
    useDataSource.setState({ offline: true, mock: false });
    render(<ConnectionNotice />);

    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent("🐣");
    expect(notice).toHaveTextContent("Chờ tí UELer, tui quay lại giờ!!!");
    expect(screen.getByText("🐣")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("🐣")).toHaveClass("animate-bounce", "motion-reduce:animate-none");
  });
});
