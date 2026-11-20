import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RelationshipBranch } from "../RelationshipBranch";

describe("RelationshipBranch", () => {
  it("preserves AND/OR conditions and lets the user collapse a branch", () => {
    render(<ul><RelationshipBranch node={{ code: "", name: "", type: "and", children: [
      { code: "BIE3004", name: "Cơ sở dữ liệu", type: "previous", children: [] },
      { code: "", name: "", type: "or", children: [{ code: "BIM5013", name: "Hệ thống thông tin quản lý", type: "prereq", children: [] }] },
    ] }} /></ul>);
    expect(screen.getByText("Tất cả các môn")).toBeInTheDocument();
    expect(screen.getByText("Một trong các môn")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "BIE3004" })).toHaveAttribute("href", "/modules/BIE3004");
    fireEvent.click(screen.getByRole("button", { name: "Thu gọn nhánh Tất cả các môn" }));
    expect(screen.queryByRole("link", { name: "BIE3004" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mở rộng nhánh Tất cả các môn" }));
    expect(screen.getByRole("link", { name: "BIM5013" })).toBeInTheDocument();
  });
  it("stops a repeated code without rendering its descendants", () => {
    render(<ul><RelationshipBranch seen={["BIE3004"]} node={{ code: "BIE3004", name: "Cơ sở dữ liệu", type: "previous", children: [{ code: "LOOP", name: "Không hiện", type: "previous", children: [] }] }} /></ul>);
    expect(screen.getByText("Quan hệ lặp, cần rà soát")).toBeInTheDocument();
    expect(screen.queryByText("LOOP")).not.toBeInTheDocument();
  });
});
