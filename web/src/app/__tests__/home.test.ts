import { redirect } from "next/navigation";
import { expect, it, vi } from "vitest";
import Home from "../page";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

it("chuyển hướng trang chủ sang /today", () => {
  Home();

  expect(redirect).toHaveBeenCalledExactlyOnceWith("/today");
});
