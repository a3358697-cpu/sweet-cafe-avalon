import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import type { PasswordRecord } from "./types.js";

const PARAMS = { n: 16384, r: 8, p: 1, keyLen: 32 } as const;

function derive(
  password: string,
  salt: Buffer,
  n: number,
  r: number,
  p: number,
  keyLen: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // NFKC：全形與半形等價字元視為相同，輸入法切換時比較不容易打錯
    scrypt(password.normalize("NFKC"), salt, keyLen, { N: n, r, p }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

/** 產生加鹽雜湊。每次呼叫的鹽都不同，因此同一組密碼的結果也不同。 */
export async function hashPassword(password: string): Promise<PasswordRecord> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, PARAMS.n, PARAMS.r, PARAMS.p, PARAMS.keyLen);
  return {
    v: 1,
    saltB64: salt.toString("base64"),
    hashB64: key.toString("base64"),
    n: PARAMS.n,
    r: PARAMS.r,
    p: PARAMS.p,
    keyLen: PARAMS.keyLen,
  };
}

/** 以固定時間比較驗證密碼；紀錄格式異常時一律視為不符。 */
export async function verifyPassword(password: string, record: PasswordRecord): Promise<boolean> {
  try {
    const expected = Buffer.from(record.hashB64, "base64");
    const key = await derive(
      password,
      Buffer.from(record.saltB64, "base64"),
      record.n,
      record.r,
      record.p,
      record.keyLen,
    );
    return key.length === expected.length && timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}
