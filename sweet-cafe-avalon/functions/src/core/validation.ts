import { HOST_MODES, type HostMode } from "../../../src/rules.js";
import { AppError } from "./errors.js";

export const NICKNAME_MAX = 16;
export const PASSWORD_MIN = 6;
export const PASSWORD_MAX = 64;
/** 客人輸入的密碼上限，只用來擋掉過大的輸入，不洩漏密碼長度規則。 */
export const PASSWORD_ATTEMPT_MAX = 128;

/** 房間編號：20 個 URL-safe 字元（由後端以 15 個隨機位元組產生）。 */
export const ROOM_ID_PATTERN = /^[A-Za-z0-9_-]{20}$/;

const invalid = (message: string): AppError => new AppError("invalid-argument", message);

export function parseRoomId(value: unknown): string {
  if (typeof value !== "string" || !ROOM_ID_PATTERN.test(value)) {
    throw invalid("房間編號格式不正確");
  }
  return value;
}

/** 玩家編號（Firebase uid）只用於比對，限制長度與字元避免異常輸入。 */
export function parseUid(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw invalid("玩家編號格式不正確");
  }
  return value;
}

/** 暱稱：1～16 字元，不得含控制字元或不可見的格式字元（避免偽造、方向覆寫）。 */
export function parseNickname(value: unknown): string {
  const message = `暱稱需為 1～${NICKNAME_MAX} 個字元，且不能包含控制字元`;
  if (typeof value !== "string") throw invalid(message);
  const nickname = value.normalize("NFC").trim();
  const length = [...nickname].length;
  if (length < 1 || length > NICKNAME_MAX || /\p{C}/u.test(nickname)) throw invalid(message);
  return nickname;
}

/** 比對暱稱是否重複時用：不分大小寫、全形半形視為相同。 */
export function nicknameKey(nickname: string): string {
  return nickname.normalize("NFKC").toLowerCase();
}

/** 店長建立房間時設定的密碼：6～64 字元，不可全是空白。不做複雜度規則。 */
export function parsePassword(value: unknown): string {
  const message = `房間密碼需為 ${PASSWORD_MIN}～${PASSWORD_MAX} 個字元`;
  if (typeof value !== "string") throw invalid(message);
  const length = [...value].length;
  if (length < PASSWORD_MIN || length > PASSWORD_MAX || value.trim() === "") throw invalid(message);
  return value;
}

/** 客人輸入的密碼：只檢查是字串且長度合理，其餘交給雜湊比對。 */
export function parsePasswordAttempt(value: unknown): string {
  if (typeof value !== "string" || value.length < 1 || value.length > PASSWORD_ATTEMPT_MAX) {
    throw invalid("請輸入房間密碼");
  }
  return value;
}

export function parseHostMode(value: unknown): HostMode {
  if (typeof value !== "string" || !(HOST_MODES as readonly string[]).includes(value)) {
    throw invalid("主持模式不正確");
  }
  return value as HostMode;
}
