import { randomBytes } from "node:crypto";

/** 產生 20 字元的房間編號（15 個隨機位元組，約 120 位元），邀請網址靠它不可猜測。 */
export function newRoomId(): string {
  return randomBytes(15).toString("base64url");
}
