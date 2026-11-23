import { render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import NotFound from "../not-found";

it("shows the Vietnamese 404 message with the bouncing chick", () => {
  render(<NotFound />);

  const message = screen.getByRole("heading", { name: "Chờ xíu nhe, quay lại liền!!!" });
  const chick = within(message).getByText("🐣");
  expect(chick).toHaveClass("motion-safe:animate-bounce");
  expect(chick).toHaveAttribute("aria-hidden", "true");
});
