import { describe, expect, it } from "vitest";
import { PBKDF2_ITERATIONS, derivePasswordHash, newSaltB64 } from "./password";

describe("PBKDF2 房間密碼雜湊", () => {
  it("鹽值為 24 個字元的 base64、雜湊為 44 個字元（與 Firestore 規則的長度檢查一致）", async () => {
    const salt = newSaltB64();
    expect(salt).toHaveLength(24);
    expect(await derivePasswordHash("甜綿菓室-2026", salt)).toHaveLength(44);
  });

  it("相同密碼與鹽得到相同雜湊；不同密碼或不同鹽得到不同雜湊", async () => {
    const salt = newSaltB64();
    const a = await derivePasswordHash("sweet-2026", salt);
    expect(await derivePasswordHash("sweet-2026", salt)).toBe(a);
    expect(await derivePasswordHash("sweet-2027", salt)).not.toBe(a);
    expect(await derivePasswordHash("sweet-2026", newSaltB64())).not.toBe(a);
  });

  it("全形與半形視為相同；雜湊中不含明文", async () => {
    const salt = newSaltB64();
    expect(await derivePasswordHash("abc123", salt)).toBe(await derivePasswordHash("ａｂｃ１２３", salt));
    expect(await derivePasswordHash("my-secret-pass", salt)).not.toContain("my-secret-pass");
  });

  it("每次鹽都不同", () => {
    expect(new Set(Array.from({ length: 50 }, () => newSaltB64())).size).toBe(50);
  });

  it("已知向量：PBKDF2-HMAC-SHA256（與標準實作一致）", async () => {
    const { pbkdf2Sync } = await import("node:crypto");
    const salt = Buffer.from("0123456789abcdef").toString("base64");
    const expected = pbkdf2Sync("password", Buffer.from("0123456789abcdef"), PBKDF2_ITERATIONS, 32, "sha256").toString("base64");
    expect(await derivePasswordHash("password", salt)).toBe(expected);
  });
});
