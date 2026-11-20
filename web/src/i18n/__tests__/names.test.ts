import { describe, expect, it } from "vitest";
import { departmentName, facultyName, moduleName } from "../names";

describe("moduleName", () => {
  it("dùng name_en khi giao diện EN và có tên", () => {
    expect(moduleName({ name: "Kế toán quản trị 1", name_en: "Management Accounting 1" }, "en")).toBe("Management Accounting 1");
  });
  it("rơi về tên tiếng Việt khi chưa có name_en (null hoặc thiếu)", () => {
    expect(moduleName({ name: "Môn lạ", name_en: null }, "en")).toBe("Môn lạ");
    expect(moduleName({ name: "Môn lạ" }, "en")).toBe("Môn lạ");
  });
  it("giao diện VI luôn dùng tên tiếng Việt", () => {
    expect(moduleName({ name: "Kế toán quản trị 1", name_en: "Management Accounting 1" }, "vi")).toBe("Kế toán quản trị 1");
  });
});

describe("facultyName / departmentName", () => {
  it("'Khoa X' và 'X' cho cùng kết quả", () => {
    expect(facultyName("Khoa Kinh tế", "en")).toBe("Faculty of Economics");
    expect(facultyName("Kinh tế", "en")).toBe("Faculty of Economics");
    expect(facultyName("Khoa Tài chính – Ngân hàng", "en")).toBe("Faculty of Finance and Banking");
  });
  it("Luật khác Luật Kinh tế", () => {
    expect(facultyName("Khoa Luật", "en")).toBe("Faculty of Law");
    expect(facultyName("Luật Kinh tế", "en")).toBe("Faculty of Business Law");
  });
  it("bộ môn và đơn vị không phải bộ môn", () => {
    expect(departmentName("Bộ môn Tài chính", "en")).toBe("Department of Finance");
    expect(departmentName("Phòng Đào tạo", "en")).toBe("Academic Affairs Office");
  });
  it("giá trị lạ và giao diện VI giữ nguyên; rỗng trả chuỗi rỗng", () => {
    expect(facultyName("Khoa Chưa Biết", "en")).toBe("Khoa Chưa Biết");
    expect(departmentName("Bộ môn Tài chính", "vi")).toBe("Bộ môn Tài chính");
    expect(facultyName(null, "en")).toBe("");
  });
});
