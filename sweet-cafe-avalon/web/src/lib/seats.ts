import { MAX_PLAYERS } from "../../../src/rules";
import { nicknameKey } from "./validation";

/** 座位編號 1～12，對應 Firestore 的 seats/{1..12}；文件只能建立一次，所以不會超過 12 人。 */
export const SEAT_NUMBERS: readonly number[] = Array.from({ length: MAX_PLAYERS }, (_, i) => i + 1);

/** 回傳最小的空位，沒有空位回傳 null。忽略超出範圍的編號。 */
export function pickFreeSeat(taken: Iterable<number>): number | null {
  const used = new Set(taken);
  return SEAT_NUMBERS.find((n) => !used.has(n)) ?? null;
}

/**
 * 暱稱索引文件編號：由正規化後的暱稱組成，同一房間同名（不分大小寫、全形半形）只能建立一次。
 * 加上 n_ 前綴並編碼，避免出現 Firestore 不允許的編號（含 / 、「.」、「__x__」）。
 */
export function nicknameDocId(nickname: string): string {
  return `n_${encodeURIComponent(nicknameKey(nickname))}`;
}
