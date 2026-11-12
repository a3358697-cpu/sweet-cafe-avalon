import { describe, expect, it } from "vitest";
import { SEAT_NUMBERS, nicknameDocId, pickFreeSeat } from "./seats";

describe("pickFreeSeat", () => {
  it("座位為 1～12，共 12 個", () => {
    expect(SEAT_NUMBERS).toHaveLength(12);
    expect(SEAT_NUMBERS[0]).toBe(1);
    expect(SEAT_NUMBERS[11]).toBe(12);
  });
  it("回傳最小的空位", () => {
    expect(pickFreeSeat([])).toBe(1);
    expect(pickFreeSeat([1, 2, 4])).toBe(3);
    expect(pickFreeSeat([2])).toBe(1);
  });
  it("全滿回傳 null；超出範圍或重複的編號不影響結果", () => {
    expect(pickFreeSeat(SEAT_NUMBERS)).toBeNull();
    expect(pickFreeSeat([1, 1, 99, 0])).toBe(2);
  });
});

describe("nicknameDocId", () => {
  it("不分大小寫與全形半形，同名得到同一個編號", () => {
    expect(nicknameDocId("Alice")).toBe(nicknameDocId("ａｌｉｃｅ"));
    expect(nicknameDocId("ALICE")).toBe(nicknameDocId("alice"));
    expect(nicknameDocId("小綿")).not.toBe(nicknameDocId("阿福"));
  });
  it("編號符合 Firestore 限制：以 n_ 開頭、沒有斜線、不是 . 或 ..、長度合理", () => {
    for (const name of ["a/b", ".", "..", "__x__", "a b", "😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀"]) {
      const id = nicknameDocId(name);
      expect(id.startsWith("n_")).toBe(true);
      expect(id.includes("/")).toBe(false);
      expect(id.length < 400).toBe(true);
    }
  });
  it("規則要求的格式（^n_.+）成立", () => {
    expect(/^n_.+/.test(nicknameDocId("x"))).toBe(true);
  });
});
