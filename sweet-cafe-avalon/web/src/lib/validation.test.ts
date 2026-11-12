import { describe, expect, it } from "vitest";
import {
  nicknameKey,
  parseHostMode,
  parseNickname,
  parsePassword,
  parsePasswordAttempt,
  parseRoomId,
  parseUid,
} from "./validation";

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

describe("parsePassword（房主設定，4 位數字）", () => {
  it("4 位數字可接受，可以 0 開頭，且以字串保留", () => {
    expect(parsePassword("1234")).toBe("1234");
    expect(parsePassword("0123")).toBe("0123");
    expect(parsePassword("0000")).toBe("0000");
  });

  it("全形數字與前後空白會被整理成一般數字", () => {
    expect(parsePassword("０１２３")).toBe("0123");
    expect(parsePassword(" 4567 ")).toBe("4567");
  });

  it("不是剛好 4 位數字都拒絕", () => {
    for (const bad of ["123", "12345", "12a4", "12 34", "abcd", "", "    ", "-123", "1.23"]) {
      expect(code(() => parsePassword(bad))).toBe("invalid-argument");
    }
    for (const bad of [undefined, null, 1234, {}]) {
      expect(code(() => parsePassword(bad))).toBe("invalid-argument");
    }
  });
});

describe("parsePasswordAttempt（玩家輸入）", () => {
  it("規則與設定時相同：4 位數字，可以 0 開頭", () => {
    expect(parsePasswordAttempt("0123")).toBe("0123");
    expect(parsePasswordAttempt("９９９９")).toBe("9999");
    expect(code(() => parsePasswordAttempt("12"))).toBe("invalid-argument");
    expect(code(() => parsePasswordAttempt(""))).toBe("invalid-argument");
    expect(code(() => parsePasswordAttempt(1234))).toBe("invalid-argument");
  });
});

describe("parseRoomId / parseUid / parseHostMode", () => {
  it("房間編號必須是 20 個 URL-safe 字元（Firestore 自動編號符合）", () => {
    const autoId = "AbCdEfGhIjKlMnOpQrSt";
    expect(parseRoomId(autoId)).toBe(autoId);
    expect(code(() => parseRoomId("short"))).toBe("invalid-argument");
    expect(code(() => parseRoomId("../../etc/passwd/xxxx"))).toBe("invalid-argument");
    expect(code(() => parseRoomId(`${"a".repeat(19)}/`))).toBe("invalid-argument");
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
