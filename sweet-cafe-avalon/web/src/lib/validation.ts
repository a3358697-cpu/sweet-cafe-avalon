import { HOST_MODES, type HostMode } from "../../../src/rules";
import { AppError } from "./errors";

export const NICKNAME_MAX = 16;
/** 房間密碼固定為 4 位數字，可以 0 開頭（所以以字串處理，不轉成數字）。 */
export const PASSWORD_LENGTH = 4;

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

function parseFourDigits(value: unknown, message: string): string {
  // NFKC：輸入法產生的全形數字也當作一般數字
  const text = typeof value === "string" ? value.normalize("NFKC").trim() : "";
  if (!new RegExp(`^[0-9]{${PASSWORD_LENGTH}}$`).test(text)) throw invalid(message);
  return text;
}

/** 房主建立房間時設定的密碼：4 位數字，可以 0 開頭（例如 0123）。 */
export function parsePassword(value: unknown): string {
  return parseFourDigits(value, "房間密碼需為 4 位數字（可以 0 開頭，例如 0123）");
}

/** 玩家輸入的密碼：同樣是 4 位數字，格式不對就直接提示，不送出。 */
export function parsePasswordAttempt(value: unknown): string {
  return parseFourDigits(value, "請輸入 4 位數字密碼");
}

export function parseHostMode(value: unknown): HostMode {
  if (typeof value !== "string" || !(HOST_MODES as readonly string[]).includes(value)) {
    throw invalid("主持模式不正確");
  }
  return value as HostMode;
}
