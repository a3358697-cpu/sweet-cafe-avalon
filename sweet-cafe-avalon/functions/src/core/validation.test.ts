import { describe, expect, it } from "vitest";
import { newRoomId } from "./ids.js";
import {
  nicknameKey,
  parseHostMode,
  parseNickname,
  parsePassword,
  parsePasswordAttempt,
  parseRoomId,
  parseUid,
} from "./validation.js";

const code = (fn: () => unknown): string | undefined => {
  try {
    fn();
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code;
  }
};

describe("parseNickname", () => {
  it("一般暱稱：去除前後空白", () => {
    expect(parseNickname("  小綿  ")).toBe("小綿");
    expect(parseNickname("Alice")).toBe("Alice");
  });

  it("長度限制為 1～16 個字元（以字元計，不是位元組）", () => {
    expect(parseNickname("一二三四五六七八九十一二三四五六")).toBe("一二三四五六七八九十一二三四五六");
    expect(code(() => parseNickname("一二三四五六七八九十一二三四五六七"))).toBe("invalid-argument");
    expect(code(() => parseNickname(""))).toBe("invalid-argument");
    expect(code(() => parseNickname("   "))).toBe("invalid-argument");
  });

  it("拒絕控制字元與不可見的格式字元", () => {
    expect(code(() => parseNickname("a\nb"))).toBe("invalid-argument");
    expect(code(() => parseNickname("a\u0000b"))).toBe("invalid-argument");
    expect(code(() => parseNickname("a‮b"))).toBe("invalid-argument");
    expect(code(() => parseNickname("a​b"))).toBe("invalid-argument");
  });

  it("拒絕非字串", () => {
    for (const value of [undefined, null, 5, {}, ["a"]]) {
      expect(code(() => parseNickname(value))).toBe("invalid-argument");
    }
  });

  it("暱稱比對不分大小寫與全形半形", () => {
    expect(nicknameKey("Alice")).toBe(nicknameKey("ａｌｉｃｅ"));
    expect(nicknameKey("ALICE")).toBe(nicknameKey("alice"));
  });
});

describe("parsePassword（店長設定）", () => {
  it("6～64 個字元可接受，不做複雜度規則", () => {
    expect(parsePassword("123456")).toBe("123456");
    expect(parsePassword("a".repeat(64))).toBe("a".repeat(64));
  });

  it("太短、太長、全空白、非字串都拒絕", () => {
    expect(code(() => parsePassword("12345"))).toBe("invalid-argument");
    expect(code(() => parsePassword("a".repeat(65)))).toBe("invalid-argument");
    expect(code(() => parsePassword("       "))).toBe("invalid-argument");
    expect(code(() => parsePassword(undefined))).toBe("invalid-argument");
  });

  it("不修剪空白：密碼原樣保留", () => {
    expect(parsePassword(" abc def ")).toBe(" abc def ");
  });
});

describe("parsePasswordAttempt（客人輸入）", () => {
  it("只擋空字串、非字串與過長輸入，不洩漏長度規則", () => {
    expect(parsePasswordAttempt("x")).toBe("x");
    expect(code(() => parsePasswordAttempt(""))).toBe("invalid-argument");
    expect(code(() => parsePasswordAttempt(1))).toBe("invalid-argument");
    expect(code(() => parsePasswordAttempt("a".repeat(129)))).toBe("invalid-argument");
  });
});

describe("parseRoomId / parseUid / parseHostMode", () => {
  it("房間編號必須是 20 個 URL-safe 字元，產生器的結果一定通過", () => {
    for (let i = 0; i < 50; i++) {
      const id = newRoomId();
      expect(id).toHaveLength(20);
      expect(parseRoomId(id)).toBe(id);
    }
    expect(code(() => parseRoomId("short"))).toBe("invalid-argument");
    expect(code(() => parseRoomId("../../etc/passwd/xxxx"))).toBe("invalid-argument");
    expect(code(() => parseRoomId(`${"a".repeat(19)}/`))).toBe("invalid-argument");
  });

  it("房間編號每次都不同", () => {
    expect(new Set(Array.from({ length: 200 }, () => newRoomId())).size).toBe(200);
  });

  it("玩家編號限制字元與長度", () => {
    expect(parseUid("abcDEF123_-")).toBe("abcDEF123_-");
    expect(code(() => parseUid("a/b"))).toBe("invalid-argument");
    expect(code(() => parseUid(""))).toBe("invalid-argument");
    expect(code(() => parseUid("a".repeat(129)))).toBe("invalid-argument");
  });

  it("主持模式只接受 HOST_ONLY 與 HOST_IS_PLAYER", () => {
    expect(parseHostMode("HOST_ONLY")).toBe("HOST_ONLY");
    expect(parseHostMode("HOST_IS_PLAYER")).toBe("HOST_IS_PLAYER");
    expect(code(() => parseHostMode("host_only"))).toBe("invalid-argument");
    expect(code(() => parseHostMode(undefined))).toBe("invalid-argument");
  });
});
