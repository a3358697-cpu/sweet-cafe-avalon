import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password.js";

describe("hashPassword / verifyPassword", () => {
  it("正確密碼驗證成功，錯誤密碼驗證失敗", async () => {
    const record = await hashPassword("甜綿菓室-2026");
    expect(await verifyPassword("甜綿菓室-2026", record)).toBe(true);
    expect(await verifyPassword("甜綿菓室-2027", record)).toBe(false);
    expect(await verifyPassword("", record)).toBe(false);
  });

  it("紀錄中沒有明文密碼", async () => {
    const password = "my-secret-pass";
    const record = await hashPassword(password);
    expect(JSON.stringify(record)).not.toContain(password);
    expect(Object.keys(record).sort()).toEqual(
      ["hashB64", "keyLen", "n", "p", "r", "saltB64", "v"].sort(),
    );
  });

  it("每次加鹽不同：同一組密碼產生不同的紀錄，但都能驗證", async () => {
    const a = await hashPassword("same-password");
    const b = await hashPassword("same-password");
    expect(a.saltB64).not.toBe(b.saltB64);
    expect(a.hashB64).not.toBe(b.hashB64);
    expect(await verifyPassword("same-password", a)).toBe(true);
    expect(await verifyPassword("same-password", b)).toBe(true);
  });

  it("全形與半形視為相同（NFKC）", async () => {
    const record = await hashPassword("abc123");
    expect(await verifyPassword("ａｂｃ１２３", record)).toBe(true);
  });

  it("紀錄格式異常時視為不符，而不是丟出錯誤", async () => {
    const record = await hashPassword("abcdef");
    expect(await verifyPassword("abcdef", { ...record, hashB64: "" })).toBe(false);
    expect(await verifyPassword("abcdef", { ...record, n: 3 })).toBe(false);
  });
});
