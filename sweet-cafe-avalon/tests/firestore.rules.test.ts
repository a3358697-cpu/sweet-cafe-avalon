import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, serverTimestamp, writeBatch, updateDoc, getDoc, getDocs, collection, setDoc, deleteDoc, query, where } from "firebase/firestore";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

// 這份測試需要 Firestore 模擬器：npm run test:rules（需要 Java 與 firebase-tools）。
let env: RulesTestEnvironment;
const ROOM = "roomAAAAAAAAAAAAAAAA"; // 20 字元
const NEW_ROOM = "roomBBBBBBBBBBBBBBBB";
const HASH = "A".repeat(43) + "=";
const SALT = "B".repeat(22) + "==";

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: "demo-sweet-cafe", firestore: { rules: readFileSync("firestore.rules", "utf8") } });
});
afterAll(async () => env.cleanup());

const hostToken = { email: "h@example.com", email_verified: true, firebase: { sign_in_provider: "google.com" } };
const host = () => env.authenticatedContext("host", hostToken).firestore();
const strangerGoogle = () => env.authenticatedContext("gstranger", { ...hostToken, email: "x@example.com" }).firestore();
const guest = (uid: string) => env.authenticatedContext(uid, { firebase: { sign_in_provider: "anonymous" } }).firestore();
const anon = () => env.unauthenticatedContext().firestore();

async function seedRoom(status: "created" | "open" | "playing" | "closed" = "open", withSecret = status !== "closed") {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "rooms", ROOM), { hostUid: "host", hostMode: "HOST_ONLY", status, maxPlayers: 12, pwSaltB64: SALT, createdAt: new Date(), openedAt: null, closedAt: null });
    if (withSecret) await setDoc(doc(db, "roomSecrets", ROOM), { hashB64: HASH });
  });
}

async function seedMember(uid: string, seatNo: number, nick: string) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "rooms", ROOM, "seats", String(seatNo)), { uid });
    await setDoc(doc(db, "rooms", ROOM, "nicknames", `n_${nick}`), { uid });
    await setDoc(doc(db, "rooms", ROOM, "members", uid), { nickname: nick, nickDocId: `n_${nick}`, role: "guest", seatNo, joinedAt: new Date() });
  });
}

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "admins", "host"), { enabled: true });
  });
});

function joinBatch(db: ReturnType<typeof guest>, uid: string, seatNo: number, nick: string, proof = HASH) {
  const b = writeBatch(db);
  b.set(doc(db, "rooms", ROOM, "joinProofs", uid), { proof });
  b.set(doc(db, "rooms", ROOM, "seats", String(seatNo)), { uid });
  b.set(doc(db, "rooms", ROOM, "nicknames", `n_${nick}`), { uid });
  b.set(doc(db, "rooms", ROOM, "members", uid), { nickname: nick, nickDocId: `n_${nick}`, role: "guest", seatNo, joinedAt: serverTimestamp() });
  return b;
}

describe("admins 白名單", () => {
  it("只能讀自己的文件，任何人都不能寫", async () => {
    await assertSucceeds(getDoc(doc(host(), "admins", "host")));
    await assertFails(getDoc(doc(guest("g1"), "admins", "host")));
    await assertFails(setDoc(doc(guest("g1"), "admins", "g1"), { enabled: true }));
    await assertFails(setDoc(doc(host(), "admins", "host"), { enabled: true }));
    await assertFails(getDocs(collection(host(), "admins")));
  });
});

describe("建立房間", () => {
  function createBatch(db: ReturnType<typeof host>, extra: Record<string, unknown> = {}) {
    const b = writeBatch(db);
    b.set(doc(db, "rooms", NEW_ROOM), { hostUid: "host", hostMode: "HOST_ONLY", status: "created", maxPlayers: 12, pwSaltB64: SALT, createdAt: serverTimestamp(), openedAt: null, closedAt: null, ...extra });
    b.set(doc(db, "roomSecrets", NEW_ROOM), { hashB64: HASH });
    return b;
  }
  it("白名單內的 Google 店長可以建立", async () => {
    await assertSucceeds(createBatch(host()).commit());
  });
  it("匿名玩家、不在白名單的 Google 帳號、未登入都不能建立", async () => {
    await assertFails(createBatch(guest("g1") as never, { hostUid: "g1" }).commit());
    await assertFails(createBatch(strangerGoogle() as never, { hostUid: "gstranger" }).commit());
    await assertFails(createBatch(anon() as never).commit());
  });
  it("不能替別人當店長、不能沒有密碼資料、不能帶不合法欄位", async () => {
    await assertFails(createBatch(host(), { hostUid: "other" }).commit());
    await assertFails(createBatch(host(), { status: "open" }).commit());
    await assertFails(createBatch(host(), { maxPlayers: 99 }).commit());
    const noSecret = writeBatch(host());
    noSecret.set(doc(host(), "rooms", NEW_ROOM), { hostUid: "host", hostMode: "HOST_ONLY", status: "created", maxPlayers: 12, pwSaltB64: SALT, createdAt: serverTimestamp(), openedAt: null, closedAt: null });
    await assertFails(noSecret.commit());
  });
});

describe("房間狀態", () => {
  it("店長依序開放、開始、關閉（關閉時同批刪除密碼雜湊）", async () => {
    await seedRoom("created");
    await assertSucceeds(updateDoc(doc(host(), "rooms", ROOM), { status: "open", openedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(host(), "rooms", ROOM), { status: "playing" }));
    const b = writeBatch(host());
    b.update(doc(host(), "rooms", ROOM), { status: "closed", closedAt: serverTimestamp() });
    b.delete(doc(host(), "roomSecrets", ROOM));
    await assertSucceeds(b.commit());
  });
  it("關閉房間時沒有刪除密碼雜湊會被拒絕；已關閉不能再改", async () => {
    await seedRoom("open");
    await assertFails(updateDoc(doc(host(), "rooms", ROOM), { status: "closed", closedAt: serverTimestamp() }));
    await seedRoom("closed");
    await assertFails(updateDoc(doc(host(), "rooms", ROOM), { status: "open", openedAt: serverTimestamp() }));
  });
  it("玩家、其他 Google 帳號不能改狀態、擁有者或其他欄位", async () => {
    await seedRoom("open");
    await assertFails(updateDoc(doc(guest("g1"), "rooms", ROOM), { status: "closed", closedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(strangerGoogle(), "rooms", ROOM), { status: "playing" }));
    await assertFails(updateDoc(doc(host(), "rooms", ROOM), { hostUid: "g1" }));
    await assertFails(updateDoc(doc(host(), "rooms", ROOM), { status: "playing", maxPlayers: 3 }));
    await assertFails(deleteDoc(doc(host(), "rooms", ROOM)));
  });
  it("登入者（含匿名玩家）可讀房間與公開列表，未登入不行", async () => {
    await seedRoom("open");
    await assertSucceeds(getDoc(doc(guest("g1"), "rooms", ROOM)));
    await assertSucceeds(getDocs(collection(guest("g1"), "rooms")));
    await assertSucceeds(getDocs(query(collection(guest("g1"), "rooms"), where("status", "in", ["created", "open", "playing"]))));
    await assertFails(getDoc(doc(anon(), "rooms", ROOM)));
    await assertFails(getDocs(collection(anon(), "rooms")));
  });
});

describe("密碼雜湊與密碼證明不可讀", () => {
  it("roomSecrets、joinProofs 任何人都讀不到", async () => {
    await seedRoom("open");
    for (const db of [host(), guest("g1")]) {
      await assertFails(getDoc(doc(db, "roomSecrets", ROOM)));
      await assertFails(getDoc(doc(db, "rooms", ROOM, "joinProofs", "g1")));
    }
  });
});

describe("加入房間", () => {
  it("開放中的房間 + 正確密碼證明可以加入", async () => {
    await seedRoom("open");
    await assertSucceeds(joinBatch(guest("g1"), "g1", 1, "小綿").commit());
  });
  it("密碼證明錯誤不能加入", async () => {
    await seedRoom("open");
    await assertFails(joinBatch(guest("g1"), "g1", 1, "小綿", "C".repeat(43) + "=").commit());
  });
  it("未開放、已開始、已關閉（密碼已刪除）都不能加入", async () => {
    for (const status of ["created", "playing"] as const) {
      await env.clearFirestore();
      await seedRoom(status);
      await assertFails(joinBatch(guest("g1"), "g1", 1, "小綿").commit());
    }
    await env.clearFirestore();
    await seedRoom("closed");
    await assertFails(joinBatch(guest("g1"), "g1", 1, "小綿").commit());
  });
  it("座位不能重複占用，暱稱不能重複", async () => {
    await seedRoom("open");
    await seedMember("g1", 1, "小綿");
    await assertFails(joinBatch(guest("g2"), "g2", 1, "阿福").commit());
    await assertFails(joinBatch(guest("g2"), "g2", 2, "小綿").commit());
    await assertSucceeds(joinBatch(guest("g2"), "g2", 2, "阿福").commit());
  });
  it("座位只能是 1～12，不能單獨占位或單獨建立暱稱", async () => {
    await seedRoom("open");
    await assertFails(joinBatch(guest("g1"), "g1", 13, "小綿").commit());
    await assertFails(setDoc(doc(guest("g1"), "rooms", ROOM, "seats", "5"), { uid: "g1" }));
    await assertFails(setDoc(doc(guest("g1"), "rooms", ROOM, "nicknames", "n_x"), { uid: "g1" }));
  });
  it("不能用別人的 uid 加入、不能自己當店長角色", async () => {
    await seedRoom("open");
    await assertFails(joinBatch(guest("g1"), "g2", 1, "小綿").commit());
    const db = guest("g1");
    const b = writeBatch(db);
    b.set(doc(db, "rooms", ROOM, "joinProofs", "g1"), { proof: HASH });
    b.set(doc(db, "rooms", ROOM, "seats", "1"), { uid: "g1" });
    b.set(doc(db, "rooms", ROOM, "nicknames", "n_x"), { uid: "g1" });
    b.set(doc(db, "rooms", ROOM, "members", "g1"), { nickname: "x", nickDocId: "n_x", role: "host", seatNo: 1, joinedAt: serverTimestamp() });
    await assertFails(b.commit());
  });
});

describe("成員資料與離開／移除", () => {
  it("成員與店長可讀名單，外人不行", async () => {
    await seedRoom("open");
    await seedMember("g1", 1, "小綿");
    await assertSucceeds(getDocs(collection(guest("g1"), "rooms", ROOM, "members")));
    await assertSucceeds(getDocs(collection(host(), "rooms", ROOM, "members")));
    await assertFails(getDocs(collection(guest("g2"), "rooms", ROOM, "members")));
  });
  it("成員不能修改自己或別人的資料", async () => {
    await seedRoom("open");
    await seedMember("g1", 1, "小綿");
    await assertFails(updateDoc(doc(guest("g1"), "rooms", ROOM, "members", "g1"), { nickname: "改名" }));
    await assertFails(updateDoc(doc(guest("g2"), "rooms", ROOM, "members", "g1"), { role: "host" }));
  });
  it("客人可自己離開、店長可移除客人（需同批刪除三份文件）；別人不行", async () => {
    await seedRoom("open");
    await seedMember("g1", 1, "小綿");
    const del = (db: ReturnType<typeof guest>) => {
      const b = writeBatch(db);
      b.delete(doc(db, "rooms", ROOM, "members", "g1"));
      b.delete(doc(db, "rooms", ROOM, "seats", "1"));
      b.delete(doc(db, "rooms", ROOM, "nicknames", "n_小綿"));
      return b;
    };
    await assertFails(del(guest("g2")).commit());
    await assertFails(deleteDoc(doc(guest("g1"), "rooms", ROOM, "members", "g1")));
    await assertSucceeds(del(guest("g1")).commit());
    await seedMember("g1", 1, "小綿");
    await assertSucceeds(del(host() as never).commit());
  });
  it("遊戲開始後不能離開或移除", async () => {
    await seedRoom("playing");
    await seedMember("g1", 1, "小綿");
    const b = writeBatch(guest("g1"));
    b.delete(doc(guest("g1"), "rooms", ROOM, "members", "g1"));
    b.delete(doc(guest("g1"), "rooms", ROOM, "seats", "1"));
    b.delete(doc(guest("g1"), "rooms", ROOM, "nicknames", "n_小綿"));
    await assertFails(b.commit());
  });
});

describe("店長兼玩家（HOST_IS_PLAYER）建立房間時一併加入", () => {
  it("店長可同批建立房間、密碼與自己的成員資料", async () => {
    const db = host();
    const b = writeBatch(db);
    b.set(doc(db, "rooms", NEW_ROOM), { hostUid: "host", hostMode: "HOST_IS_PLAYER", status: "created", maxPlayers: 12, pwSaltB64: SALT, createdAt: serverTimestamp(), openedAt: null, closedAt: null });
    b.set(doc(db, "roomSecrets", NEW_ROOM), { hashB64: HASH });
    b.set(doc(db, "rooms", NEW_ROOM, "seats", "1"), { uid: "host" });
    b.set(doc(db, "rooms", NEW_ROOM, "nicknames", "n_店長"), { uid: "host" });
    b.set(doc(db, "rooms", NEW_ROOM, "members", "host"), { nickname: "店長", nickDocId: "n_店長", role: "host", seatNo: 1, joinedAt: serverTimestamp() });
    await assertSucceeds(b.commit());
  });
});

describe("private（秘密職業）", () => {
  it("只有本人可讀；其他玩家與店長都不能直接讀，也沒有人能寫", async () => {
    await seedRoom("playing");
    await seedMember("g1", 1, "小綿");
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "rooms", ROOM, "private", "g1"), { secretRole: "x" });
    });
    await assertSucceeds(getDoc(doc(guest("g1"), "rooms", ROOM, "private", "g1")));
    await assertFails(getDoc(doc(guest("g2"), "rooms", ROOM, "private", "g1")));
    await assertFails(getDoc(doc(host(), "rooms", ROOM, "private", "g1")));
    await assertFails(setDoc(doc(guest("g1"), "rooms", ROOM, "private", "g1"), { secretRole: "evil" }));
  });
});
