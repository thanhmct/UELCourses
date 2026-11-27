import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BatchModuleAdd } from "../BatchModuleAdd";
import { api } from "@/lib/api";
import { usePlanner } from "@/lib/store";

describe("BatchModuleAdd offline support", () => {
  const savedCatalog = usePlanner.getState().catalog;

  beforeEach(() => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    usePlanner.setState({ catalog: {
      ...savedCatalog,
      LOCAL1001: {
        code: "LOCAL1001",
        name: "Locally saved module",
        credits: 3,
        prerequisites: [],
        equivalents: [],
      },
    } });
  });

  afterEach(() => {
    cleanup();
    usePlanner.setState({ catalog: savedCatalog });
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("adds a previously saved course by code without calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const moduleRequest = vi.spyOn(api, "module");
    const onAdd = vi.fn();
    render(<BatchModuleAdd onAdd={onAdd} />);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "LOCAL1001" } });
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(onAdd).toHaveBeenCalledWith(usePlanner.getState().catalog.LOCAL1001));
    expect(moduleRequest).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
