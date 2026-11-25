import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CheckFacet, FacetFilter } from "../FacetFilter";
import { useLang } from "@/i18n";

describe("FacetFilter", () => {
  beforeEach(() => {
    useLang.getState().setLang("vi");
  });

  afterEach(() => {
    cleanup();
    useLang.getState().setLang("vi");
  });

  const sampleItems = [
    { value: "Khoa Luật", count: 15 },
    { value: "Khoa Kinh tế", count: 25 },
    { value: "Khoa Toán - Thống kê", count: 8 },
    { value: "Khoa CNTT", count: 12 },
  ];

  describe("Multiple mode (checkboxes)", () => {
    it("renders checkboxes and 'All' option", () => {
      render(
        <FacetFilter
          title="Khoa / Bộ môn"
          items={sampleItems}
          multiple
          values={[]}
          onValuesChange={() => {}}
          total={60}
        />,
      );

      // 'All' checkbox should be checked when values is empty
      const allCheckbox = screen.getByRole("checkbox", { name: /tất cả/i });
      expect(allCheckbox).toBeChecked();

      const checkboxes = screen.getAllByRole("checkbox");
      // 1 'All' checkbox + 4 item checkboxes = 5
      expect(checkboxes).toHaveLength(5);
    });

    it("selecting an unselected value appends it to values", () => {
      const onValuesChange = vi.fn();
      render(
        <FacetFilter
          title="Khoa / Bộ môn"
          items={sampleItems}
          multiple
          values={["Khoa Luật"]}
          onValuesChange={onValuesChange}
        />,
      );

      const ecoCheckbox = screen.getByRole("checkbox", { name: /Khoa Kinh tế/i });
      expect(ecoCheckbox).not.toBeChecked();

      fireEvent.click(ecoCheckbox);
      expect(onValuesChange).toHaveBeenCalledWith(["Khoa Luật", "Khoa Kinh tế"]);
    });

    it("selecting a selected value deselects it", () => {
      const onValuesChange = vi.fn();
      render(
        <FacetFilter
          title="Khoa / Bộ môn"
          items={sampleItems}
          multiple
          values={["Khoa Luật", "Khoa Kinh tế"]}
          onValuesChange={onValuesChange}
        />,
      );

      const lawCheckbox = screen.getByRole("checkbox", { name: /Khoa Luật/i });
      expect(lawCheckbox).toBeChecked();

      fireEvent.click(lawCheckbox);
      expect(onValuesChange).toHaveBeenCalledWith(["Khoa Kinh tế"]);
    });

    it("clicking 'All' when items are selected clears all selections", () => {
      const onValuesChange = vi.fn();
      render(
        <FacetFilter
          title="Khoa / Bộ môn"
          items={sampleItems}
          multiple
          values={["Khoa Luật"]}
          onValuesChange={onValuesChange}
        />,
      );

      const allCheckbox = screen.getByRole("checkbox", { name: /tất cả/i });
      expect(allCheckbox).not.toBeChecked();

      fireEvent.click(allCheckbox);
      expect(onValuesChange).toHaveBeenCalledWith([]);
    });

    it("ignores Vietnamese accents when filtering with search", () => {
      render(
        <FacetFilter
          title="Khoa / Bộ môn"
          items={sampleItems}
          multiple
          values={[]}
          onValuesChange={() => {}}
          searchable
          searchPlaceholder="Tìm khoa..."
        />,
      );

      const searchInput = screen.getByPlaceholderText("Tìm khoa...");
      // Search with no accents
      fireEvent.change(searchInput, { target: { value: "kinh te" } });

      expect(screen.getByText("Khoa Kinh tế")).toBeInTheDocument();
      expect(screen.queryByText("Khoa Luật")).not.toBeInTheDocument();
      expect(screen.queryByText("Khoa CNTT")).not.toBeInTheDocument();
    });

    it("preserves selected options during search even when query does not match them", () => {
      render(
        <FacetFilter
          title="Khoa / Bộ môn"
          items={sampleItems}
          multiple
          values={["Khoa Luật"]}
          onValuesChange={() => {}}
          searchable
        />,
      );

      const searchInput = screen.getByRole("searchbox");
      // Search for "kinh te", which doesn't match "Khoa Luật"
      fireEvent.change(searchInput, { target: { value: "kinh te" } });

      // Khoa Kinh tế matches search
      expect(screen.getByText("Khoa Kinh tế")).toBeInTheDocument();
      // Khoa Luật was selected, so it MUST remain visible and accessible!
      const lawCheckbox = screen.getByRole("checkbox", { name: /Khoa Luật/i });
      expect(lawCheckbox).toBeInTheDocument();
      expect(lawCheckbox).toBeChecked();
    });

    it("renders English label 'All' deterministically when language is set to English", () => {
      useLang.getState().setLang("en");
      render(
        <FacetFilter
          title="Khoa / Bộ môn"
          items={sampleItems}
          multiple
          values={[]}
          onValuesChange={() => {}}
          total={60}
        />,
      );

      const allCheckbox = screen.getByRole("checkbox", { name: /^all/i });
      expect(allCheckbox).toBeInTheDocument();
      expect(allCheckbox).toBeChecked();
    });

    it("hides 0-count items by default unless the item is selected", () => {
      const itemsWithZero = [
        { value: "Khoa Luật", count: 15 },
        { value: "Khoa Kinh tế", count: 0 },
        { value: "Khoa CNTT", count: 0 },
      ];
      render(
        <FacetFilter
          title="Khoa"
          items={itemsWithZero}
          multiple
          values={["Khoa Kinh tế"]}
          onValuesChange={() => {}}
        />,
      );

      expect(screen.getByText("Khoa Luật")).toBeInTheDocument();
      expect(screen.getByText("Khoa Kinh tế")).toBeInTheDocument();
      expect(screen.queryByText("Khoa CNTT")).not.toBeInTheDocument();

      const ecoCheckbox = screen.getByRole("checkbox", { name: /Khoa Kinh tế/i });
      expect(ecoCheckbox).toBeChecked();
    });

    it("displays countNote in legend when provided", () => {
      render(
        <FacetFilter
          title="Khoa"
          items={sampleItems}
          multiple
          values={[]}
          onValuesChange={() => {}}
          countNote="Số lượng trong chương trình đang lọc"
        />,
      );
      expect(screen.getByText("Số lượng trong chương trình đang lọc")).toBeInTheDocument();
    });

    it("uses default common.expand/collapse labels when collapsibleOnMobile is set without custom labels", () => {
      render(
        <FacetFilter
          title="Khoa"
          items={sampleItems}
          multiple
          values={[]}
          onValuesChange={() => {}}
          collapsibleOnMobile
        />,
      );

      const toggleBtn = screen.getByRole("button", { name: "Mở danh sách" });
      expect(toggleBtn).toHaveAttribute("aria-expanded", "false");
      fireEvent.click(toggleBtn);
      expect(screen.getByRole("button", { name: "Thu gọn" })).toHaveAttribute("aria-expanded", "true");
    });

    it("uses custom expandLabel when collapsed and keeps collapse label when expanded in VI and EN", () => {
      const { rerender } = render(
        <FacetFilter
          title="Khoa quản lý"
          items={sampleItems}
          multiple
          values={[]}
          onValuesChange={() => {}}
          collapsibleOnMobile
          expandLabel="Thêm bộ lọc khoa quản lý"
        />,
      );

      const toggleVi = screen.getByRole("button", { name: "Thêm bộ lọc khoa quản lý" });
      expect(toggleVi).toHaveAttribute("aria-expanded", "false");
      fireEvent.click(toggleVi);
      expect(screen.getByRole("button", { name: "Thu gọn" })).toHaveAttribute("aria-expanded", "true");

      useLang.getState().setLang("en");
      rerender(
        <FacetFilter
          title="Faculty"
          items={sampleItems}
          multiple
          values={[]}
          onValuesChange={() => {}}
          collapsibleOnMobile
          expandLabel="Add faculty filter"
        />,
      );
      expect(screen.getByRole("button", { name: "Collapse" })).toHaveAttribute("aria-expanded", "true");
      fireEvent.click(screen.getByRole("button", { name: "Collapse" }));
      expect(screen.getByRole("button", { name: "Add faculty filter" })).toHaveAttribute("aria-expanded", "false");
    });
  });

  describe("Single mode (radios)", () => {
    it("renders radio group and calls onChange on selection", () => {
      const onChange = vi.fn();
      render(
        <FacetFilter
          title="Ngôn ngữ"
          items={[
            { value: "vi", count: 100 },
            { value: "en", count: 20 },
          ]}
          value="vi"
          onChange={onChange}
        />,
      );

      const enRadio = screen.getByRole("radio", { name: /en/i });
      expect(enRadio).not.toBeChecked();

      fireEvent.click(enRadio);
      expect(onChange).toHaveBeenCalledWith("en");
    });

    it("selecting 'All' radio passes empty string", () => {
      const onChange = vi.fn();
      render(
        <FacetFilter
          title="Ngôn ngữ"
          items={[
            { value: "vi", count: 100 },
            { value: "en", count: 20 },
          ]}
          value="en"
          onChange={onChange}
        />,
      );

      const allRadio = screen.getByRole("radio", { name: /tất cả/i });
      fireEvent.click(allRadio);
      expect(onChange).toHaveBeenCalledWith("");
    });

    it("renders 'All' radio in English mode", () => {
      useLang.getState().setLang("en");
      const onChange = vi.fn();
      render(
        <FacetFilter
          title="Language"
          items={[
            { value: "vi", count: 100 },
            { value: "en", count: 20 },
          ]}
          value="en"
          onChange={onChange}
        />,
      );

      const allRadio = screen.getByRole("radio", { name: /^all/i });
      expect(allRadio).toBeInTheDocument();
      fireEvent.click(allRadio);
      expect(onChange).toHaveBeenCalledWith("");
    });
  });

  describe("CheckFacet", () => {
    it("renders a toggle checkbox", () => {
      const onChange = vi.fn();
      render(<CheckFacet label="Có đề cương" count={42} checked={false} onChange={onChange} />);

      const checkbox = screen.getByRole("checkbox", { name: /Có đề cương/i });
      expect(checkbox).not.toBeChecked();

      fireEvent.click(checkbox);
      expect(onChange).toHaveBeenCalledWith(true);
    });
  });
});
