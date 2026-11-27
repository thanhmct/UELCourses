import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ConnectionNotice } from "@/components/MockBadge";
import { useDataSource } from "@/lib/dataSource";

describe("ConnectionNotice", () => {
  afterEach(() => {
    cleanup();
    useDataSource.setState({ offline: false, mock: false });
  });

  it("hiển thị sticker máy tính bảng và câu kết nối có dấu chấm nhảy", () => {
    useDataSource.setState({ offline: true, mock: false });
    render(<ConnectionNotice />);

    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent("Chờ chíu đang kết nối...");
    expect(notice.querySelector("img")?.getAttribute("src")).toContain("/stickers/05_vuot_troi_may_tinh_bang.svg");
  });
});
