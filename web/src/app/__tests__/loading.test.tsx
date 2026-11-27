import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import PageLoading from "../loading";

it("shows the shared waiting animation as a status while a page loads", () => {
  render(<PageLoading />);

  const status = screen.getByRole("status");
  expect(status).toHaveTextContent("Chờ chíu đang kết nối...");
  expect(status.querySelector("img")).toHaveAttribute(
    "src",
    "/stickers/05_vuot_troi_may_tinh_bang.svg",
  );
});
