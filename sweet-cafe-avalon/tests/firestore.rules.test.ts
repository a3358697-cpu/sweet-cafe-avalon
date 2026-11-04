import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

let env: RulesTestEnvironment;
const ROOM = "roomAAAAAAAAAAAAAAAA";

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-sweet-cafe",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});
afterAll(async () => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc(`rooms/${ROOM}`).set({ hostUid: "host", hostMode: "HOST_ONLY", status: "open", maxPlayers: 12 });
    await db.doc(`rooms/${ROOM}/members/guest1`).set({ nickname: "小綿", role: "guest", joinedAtMs: 1 });
    await db.doc(`rooms/${ROOM}/members/guest2`).set({ nickname: "阿福", role: "guest", joinedAtMs: 2 });
    await db.doc(`rooms/${ROOM}/private/guest1`).set({ secretRole: "x" });
    await db.doc(`roomSecrets/${ROOM}`).set({ hashB64: "x" });
  });
});

const as = (uid: string) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

describe("rooms", () => {
  it("店長與成員可讀房間，外人與未登入不行", async () => {
    await assertSucceeds(as("host").doc(`rooms/${ROOM}`).get());
    await assertSucceeds(as("guest1").doc(`rooms/${ROOM}`).get());
    await assertFails(as("stranger").doc(`rooms/${ROOM}`).get());
    await assertFails(anon().doc(`rooms/${ROOM}`).get());
  });

  it("任何人都不能直接寫入房間（建立、改狀態、刪除）", async () => {
    for (const uid of ["host", "guest1", "stranger"]) {
      await assertFails(as(uid).doc(`rooms/new1`).set({ hostUid: uid }));
      await assertFails(as(uid).doc(`rooms/${ROOM}`).update({ status: "closed" }));
      await assertFails(as(uid).doc(`rooms/${ROOM}`).delete());
    }
  });
});

describe("members", () => {
  it("店長與同房成員可讀名單，外人不行", async () => {
    await assertSucceeds(as("host").collection(`rooms/${ROOM}/members`).get());
    await assertSucceeds(as("guest1").collection(`rooms/${ROOM}/members`).get());
    await assertFails(as("stranger").collection(`rooms/${ROOM}/members`).get());
  });

  it("客人不能自己加入或改暱稱", async () => {
    await assertFails(as("stranger").doc(`rooms/${ROOM}/members/stranger`).set({ nickname: "x", role: "guest" }));
    await assertFails(as("guest1").doc(`rooms/${ROOM}/members/guest1`).update({ nickname: "改名" }));
    await assertFails(as("host").doc(`rooms/${ROOM}/members/guest1`).delete());
  });
});

describe("private（秘密職業）", () => {
  it("只有本人可讀；其他玩家與店長都不能直接讀", async () => {
    await assertSucceeds(as("guest1").doc(`rooms/${ROOM}/private/guest1`).get());
    await assertFails(as("guest2").doc(`rooms/${ROOM}/private/guest1`).get());
    await assertFails(as("host").doc(`rooms/${ROOM}/private/guest1`).get());
    await assertFails(as("guest2").collection(`rooms/${ROOM}/private`).get());
  });

  it("沒有人能寫入", async () => {
    await assertFails(as("guest1").doc(`rooms/${ROOM}/private/guest1`).set({ secretRole: "evil" }));
  });
});

describe("密碼雜湊", () => {
  it("任何人都讀不到也寫不了", async () => {
    for (const uid of ["host", "guest1", "stranger"]) {
      await assertFails(as(uid).doc(`roomSecrets/${ROOM}`).get());
      await assertFails(as(uid).doc(`roomSecrets/${ROOM}`).set({ hashB64: "y" }));
    }
  });
});

describe("房間清單查詢", () => {
  it("店長可查自己的房間，不能查全部或別人的", async () => {
    await assertSucceeds(as("host").collection("rooms").where("hostUid", "==", "host").get());
    await assertFails(as("host").collection("rooms").get());
    await assertFails(as("stranger").collection("rooms").where("hostUid", "==", "host").get());
  });
});
