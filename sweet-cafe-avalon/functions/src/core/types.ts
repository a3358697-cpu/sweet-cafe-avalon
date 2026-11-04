import type { HostMode } from "../../../src/rules.js";

/** 房間狀態：created 已建立未開放；open 開放加入；playing 遊戲進行中；closed 已關閉。 */
export type RoomStatus = "created" | "open" | "playing" | "closed";

/** 房間公開資料（不含任何密碼）。時間一律用毫秒數，與儲存體無關。 */
export type RoomRecord = {
  hostUid: string;
  hostMode: HostMode;
  status: RoomStatus;
  maxPlayers: number;
  createdAtMs: number;
  openedAtMs: number | null;
  closedAtMs: number | null;
};

export type MemberRole = "host" | "guest";

/** 大廳成員資料：只放暱稱等公開資訊，秘密職業另存、不放這裡。 */
export type MemberRecord = {
  nickname: string;
  role: MemberRole;
  joinedAtMs: number;
};

/** 房間密碼驗證資料：只有加鹽雜湊，沒有明文。僅後端可讀寫，關房即刪除。 */
export type PasswordRecord = {
  v: 1;
  saltB64: string;
  hashB64: string;
  n: number;
  r: number;
  p: number;
  keyLen: number;
};

/** 已通過 Firebase Auth 驗證的呼叫者（由 Cloud Functions 提供，不信任客戶端自報）。 */
export type CallerToken = {
  email?: string;
  email_verified?: boolean;
  firebase?: { sign_in_provider?: string };
};

export type Caller = { uid: string; token: CallerToken };
