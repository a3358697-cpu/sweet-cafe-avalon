import { describe, expect, it } from "vitest";
import { isHostCaller, parseHostEmails } from "./hostAuth.js";
import type { Caller } from "./types.js";

const allowed = ["shop@example.com"];
const caller = (token: Caller["token"]): Caller => ({ uid: "u1", token });
const google = { email: "shop@example.com", email_verified: true, firebase: { sign_in_provider: "google.com" } };

describe("parseHostEmails", () => {
  it("以逗號、分號、空白或換行分隔，轉小寫並略過空項", () => {
    expect(parseHostEmails(" Shop@Example.com, b@x.com;c@x.com\nd@x.com ,, ")).toEqual([
      "shop@example.com",
      "b@x.com",
      "c@x.com",
      "d@x.com",
    ]);
    expect(parseHostEmails(undefined)).toEqual([]);
    expect(parseHostEmails("")).toEqual([]);
  });
});

describe("isHostCaller", () => {
  it("Google 登入、信箱已驗證且在白名單內才是店長（信箱大小寫不拘）", () => {
    expect(isHostCaller(caller(google), allowed)).toBe(true);
    expect(isHostCaller(caller({ ...google, email: "SHOP@Example.com" }), allowed)).toBe(true);
  });

  it("未登入不是店長", () => {
    expect(isHostCaller(null, allowed)).toBe(false);
  });

  it("匿名帳號不是店長", () => {
    expect(isHostCaller(caller({ firebase: { sign_in_provider: "anonymous" } }), allowed)).toBe(false);
  });

  it("信箱不在白名單內不是店長", () => {
    expect(isHostCaller(caller({ ...google, email: "other@example.com" }), allowed)).toBe(false);
  });

  it("信箱未驗證不是店長", () => {
    expect(isHostCaller(caller({ ...google, email_verified: false }), allowed)).toBe(false);
    expect(isHostCaller(caller({ email: google.email, firebase: google.firebase }), allowed)).toBe(false);
  });

  it("非 Google 登入方式（例如信箱密碼）即使信箱相同也不是店長", () => {
    const token = { ...google, firebase: { sign_in_provider: "password" } };
    expect(isHostCaller(caller(token), allowed)).toBe(false);
  });

  it("白名單為空時沒有任何人是店長", () => {
    expect(isHostCaller(caller(google), [])).toBe(false);
  });

  it("沒有信箱欄位不是店長", () => {
    expect(isHostCaller(caller({ email_verified: true, firebase: google.firebase }), allowed)).toBe(false);
  });
});
