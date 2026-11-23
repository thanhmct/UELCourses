import { render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import PageLoading from "../loading";

it("shows the shared waiting animation as a status while a page loads", () => {
  render(<PageLoading />);

  const status = screen.getByRole("status");
  expect(status).toHaveTextContent("chờ xíu nhe");
  const chick = within(status).getByText("🐣");
  expect(chick).toHaveClass("motion-safe:animate-bounce");
  expect(chick).toHaveAttribute("aria-hidden", "true");
});
