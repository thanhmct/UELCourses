import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ModuleDescriptionText } from "../ModuleDescriptionText";

describe("ModuleDescriptionText", () => {
  afterEach(cleanup);

  it("renders inline bullet characters as a readable list", () => {
    render(
      <ModuleDescriptionText
        lang="vi"
        text="Nội dung chính của môn học bao gồm: • Phân loại chi phí. 2 • Ứng dụng công cụ ra quyết định. • Lập dự toán và kiểm soát chi phí."
      />,
    );

    expect(screen.getByText("Nội dung chính của môn học bao gồm:")).toBeVisible();
    const list = screen.getByRole("list");
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    expect(within(list).getByText("Ứng dụng công cụ ra quyết định.")).toBeVisible();
    expect(screen.queryByText(/^2$/)).not.toBeInTheDocument();
  });

  it("keeps ordinary line breaks as separate paragraphs", () => {
    render(<ModuleDescriptionText lang="en" text={"First paragraph.\nSecond paragraph."} />);

    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.getByText("First paragraph.").tagName).toBe("P");
    expect(screen.getByText("Second paragraph.").tagName).toBe("P");
  });
});
