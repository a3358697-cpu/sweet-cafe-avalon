import type { Caller } from "./types.js";

/** 解析以逗號、分號或空白分隔的店長信箱清單（一律轉小寫）。 */
export function parseHostEmails(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(/[\s,;]+/)
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email !== "");
}

/**
 * 是否為店長：必須以 Google 登入、信箱已驗證，且信箱在後端設定的白名單內。
 * 資料來自 Firebase 驗證過的 ID Token，不信任客戶端自報的任何欄位。
 * 匿名帳號沒有信箱，永遠不是店長。
 */
export function isHostCaller(caller: Caller | null, allowedEmails: readonly string[]): boolean {
  if (caller === null) return false;
  const { token } = caller;
  if (token.firebase?.sign_in_provider !== "google.com") return false;
  if (token.email_verified !== true) return false;
  const email = token.email?.trim().toLowerCase();
  return email !== undefined && email !== "" && allowedEmails.includes(email);
}
