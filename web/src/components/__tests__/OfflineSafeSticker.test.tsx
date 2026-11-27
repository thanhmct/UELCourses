import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OfflineSafeSticker } from "../OfflineSafeSticker";

describe("OfflineSafeSticker", () => {
  it("removes the image element when the sticker cannot load", () => {
    render(<OfflineSafeSticker src="/stickers/03_ket_noi_loa.svg" alt="" width={220} height={160} />);
    const image = document.querySelector("img");
    expect(image).not.toBeNull();
    fireEvent.error(image!);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
