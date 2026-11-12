/**
 * 房間密碼的瀏覽器端雜湊（Web Crypto PBKDF2-SHA256）。
 * 注意：Firestore 規則只能比對「相等」，無法執行 PBKDF2，所以加入房間時客人的瀏覽器送出雜湊值，
 * 由規則與 roomSecrets 內的雜湊比對。這不等同伺服器端密碼驗證，詳見 README。
 */
export const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BITS = 256;

const toBase64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));
const fromBase64 = (b64: string): Uint8Array => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/** 16 位元組隨機鹽的 base64（固定 24 個字元）。鹽不是祕密，存在房間文件裡。 */
export function newSaltB64(): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(SALT_BYTES)));
}

/** 以 PBKDF2 算出密碼雜湊的 base64（固定 44 個字元）。全形半形以 NFKC 視為相同。 */
export async function derivePasswordHash(password: string, saltB64: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password.normalize("NFKC")), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: fromBase64(saltB64) as BufferSource, iterations: PBKDF2_ITERATIONS },
    key,
    HASH_BITS,
  );
  return toBase64(new Uint8Array(bits));
}
