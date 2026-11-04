import { beforeEach, describe, expect, it } from "vitest";
import { newRoomId } from "./ids.js";
import { MemoryStore } from "./memoryStore.js";
import {
  closeRoom,
  createRoom,
  joinRoom,
  kickMember,
  leaveRoom,
  openRoom,
  startRoomGame,
  whoAmI,
  type Deps,
} from "./roomService.js";
import type { Caller } from "./types.js";

const HOST_EMAIL = "shop@example.com";
const PASSWORD = "sweet-2026";

const hostCaller = (uid = "host1", email = HOST_EMAIL): Caller => ({
  uid,
  token: { email, email_verified: true, firebase: { sign_in_provider: "google.com" } },
});
const guest = (uid: string): Caller => ({ uid, token: { firebase: { sign_in_provider: "anonymous" } } });

let store: MemoryStore;
let clock: number;
let deps: Deps;

const makeDeps = (s: MemoryStore): Deps => ({
  store: s,
  now: () => clock,
  newRoomId,
  hostEmails: [HOST_EMAIL, "second@example.com"],
});

beforeEach(() => {
  store = new MemoryStore();
  clock = 1_000_000;
  deps = makeDeps(store);
});

async function errorCode(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code;
  }
}

async function openedRoom(hostMode: "HOST_ONLY" | "HOST_IS_PLAYER" = "HOST_ONLY"): Promise<string> {
  const { roomId } = await createRoom(deps, hostCaller(), { password: PASSWORD, hostMode, hostNickname: "店長" });
  await openRoom(deps, hostCaller(), { roomId });
  return roomId;
}

const join = (roomId: string, uid: string, nickname = `客人${uid}`, password: string = PASSWORD) =>
  joinRoom(deps, guest(uid), { roomId, nickname, password });

describe("createRoom", () => {
  it("非店長、匿名、未登入都不能建立房間", async () => {
    const input = { password: PASSWORD, hostMode: "HOST_ONLY" };
    expect(await errorCode(createRoom(deps, null, input))).toBe("unauthenticated");
    expect(await errorCode(createRoom(deps, guest("g1"), input))).toBe("permission-denied");
    expect(await errorCode(createRoom(deps, hostCaller("x", "other@example.com"), input))).toBe("permission-denied");
  });

  it("店長建立後房間為 created，密碼只以雜湊儲存，沒有任何明文", async () => {
    const { roomId } = await createRoom(deps, hostCaller(), { password: PASSWORD, hostMode: "HOST_ONLY" });
    expect(store.hasSecret(roomId)).toBe(true);
    expect(store.dump()).not.toContain(PASSWORD);
    expect(store.dump()).toContain('"status":"created"');
  });

  it("HOST_ONLY：店長不在成員名單；HOST_IS_PLAYER：店長是成員且必須有暱稱", async () => {
    const a = await createRoom(deps, hostCaller(), { password: PASSWORD, hostMode: "HOST_ONLY" });
    expect(await store.runTransaction((tx) => tx.listMembers(a.roomId))).toHaveLength(0);

    const b = await createRoom(deps, hostCaller(), { password: PASSWORD, hostMode: "HOST_IS_PLAYER", hostNickname: "店長" });
    const members = await store.runTransaction((tx) => tx.listMembers(b.roomId));
    expect(members).toHaveLength(1);
    expect(members[0]?.member.role).toBe("host");

    expect(
      await errorCode(createRoom(deps, hostCaller(), { password: PASSWORD, hostMode: "HOST_IS_PLAYER" })),
    ).toBe("invalid-argument");
  });

  it("密碼太短或模式錯誤會被拒絕", async () => {
    expect(await errorCode(createRoom(deps, hostCaller(), { password: "123", hostMode: "HOST_ONLY" }))).toBe("invalid-argument");
    expect(await errorCode(createRoom(deps, hostCaller(), { password: PASSWORD, hostMode: "X" }))).toBe("invalid-argument");
  });
});

describe("open / close 與擁有權", () => {
  it("只有建立者能開放、關閉；另一位白名單店長也不行", async () => {
    const { roomId } = await createRoom(deps, hostCaller(), { password: PASSWORD, hostMode: "HOST_ONLY" });
    const other = hostCaller("host2", "second@example.com");
    expect(await errorCode(openRoom(deps, other, { roomId }))).toBe("permission-denied");
    expect(await errorCode(closeRoom(deps, other, { roomId }))).toBe("permission-denied");
    expect(await errorCode(openRoom(deps, guest("g1"), { roomId }))).toBe("permission-denied");
    expect(await errorCode(openRoom(deps, hostCaller(), { roomId: newRoomId() }))).toBe("not-found");
  });

  it("開放可重複呼叫；關閉會刪除密碼雜湊且可重複呼叫", async () => {
    const roomId = await openedRoom();
    expect(await openRoom(deps, hostCaller(), { roomId })).toEqual({ status: "open" });
    expect(store.hasSecret(roomId)).toBe(true);
    expect(await closeRoom(deps, hostCaller(), { roomId })).toEqual({ status: "closed" });
    expect(store.hasSecret(roomId)).toBe(false);
    expect(await closeRoom(deps, hostCaller(), { roomId })).toEqual({ status: "closed" });
    expect(await errorCode(openRoom(deps, hostCaller(), { roomId }))).toBe("failed-precondition");
  });
});

describe("joinRoom", () => {
  it("房間尚未開放不能加入，開放後可加入", async () => {
    const { roomId } = await createRoom(deps, hostCaller(), { password: PASSWORD, hostMode: "HOST_ONLY" });
    expect(await errorCode(join(roomId, "g1"))).toBe("failed-precondition");
    await openRoom(deps, hostCaller(), { roomId });
    expect(await join(roomId, "g1")).toEqual({ roomId, alreadyMember: false });
  });

  it("未登入不能加入；房間不存在回報找不到", async () => {
    const roomId = await openedRoom();
    expect(await errorCode(joinRoom(deps, null, { roomId, nickname: "a", password: PASSWORD }))).toBe("unauthenticated");
    expect(await errorCode(join(newRoomId(), "g1"))).toBe("not-found");
  });

  it("密碼錯誤被拒絕且不會加入", async () => {
    const roomId = await openedRoom();
    expect(await errorCode(join(roomId, "g1", "小綿", "wrong-pass"))).toBe("permission-denied");
    const members = await store.runTransaction((tx) => tx.listMembers(roomId));
    expect(members).toHaveLength(0);
  });

  it("關閉後：密碼立即失效，即使密碼正確也不能加入", async () => {
    const roomId = await openedRoom();
    await closeRoom(deps, hostCaller(), { roomId });
    expect(await errorCode(join(roomId, "g1"))).toBe("failed-precondition");
  });

  it("暱稱不可重複（不分大小寫），且重複不會消耗成員名額", async () => {
    const roomId = await openedRoom("HOST_IS_PLAYER");
    await join(roomId, "g1", "Alice");
    expect(await errorCode(join(roomId, "g2", "ALICE"))).toBe("already-exists");
    expect(await errorCode(join(roomId, "g3", "店長"))).toBe("already-exists");
    expect(await join(roomId, "g2", "Bob")).toEqual({ roomId, alreadyMember: false });
  });

  it("店長不能以客人身分加入自己的房間", async () => {
    const roomId = await openedRoom();
    expect(
      await errorCode(joinRoom(deps, hostCaller(), { roomId, nickname: "店長", password: PASSWORD })),
    ).toBe("failed-precondition");
  });

  it("人數上限 12 人（含 HOST_IS_PLAYER 的店長）", async () => {
    const roomId = await openedRoom("HOST_IS_PLAYER");
    for (let i = 1; i <= 11; i++) await join(roomId, `g${i}`);
    expect(await errorCode(join(roomId, "g12"))).toBe("failed-precondition");
  });

  it("已是成員再次加入視為成功，不需再驗證密碼", async () => {
    const roomId = await openedRoom();
    await join(roomId, "g1", "小綿");
    expect(await join(roomId, "g1", "小綿", "totally-wrong")).toEqual({ roomId, alreadyMember: true });
  });

  it("遊戲開始後不能再加入", async () => {
    const roomId = await openedRoom();
    for (let i = 1; i <= 6; i++) await join(roomId, `g${i}`);
    await startRoomGame(deps, hostCaller(), { roomId });
    expect(await errorCode(join(roomId, "g7"))).toBe("failed-precondition");
  });

  it("輸入驗證：暱稱與密碼格式錯誤", async () => {
    const roomId = await openedRoom();
    expect(await errorCode(join(roomId, "g1", "   "))).toBe("invalid-argument");
    expect(await errorCode(join(roomId, "g1", "ok", ""))).toBe("invalid-argument");
    expect(await errorCode(join("bad-id", "g1"))).toBe("invalid-argument");
  });
});

describe("密碼錯誤可自行重試", () => {
  it("連續輸錯很多次都不會鎖定，之後輸入正確密碼就能加入", async () => {
    const roomId = await openedRoom();
    for (let i = 0; i < 40; i++) {
      expect(await errorCode(join(roomId, "g1", "小綿", "wrong-pass"))).toBe("permission-denied");
    }
    expect(await join(roomId, "g1", "小綿", PASSWORD)).toEqual({ roomId, alreadyMember: false });
  });

  it("某人輸錯不影響其他人加入；錯誤不會寫入任何資料", async () => {
    const roomId = await openedRoom();
    const before = store.dump();
    for (let i = 0; i < 10; i++) await errorCode(join(roomId, `bot${i}`, "x", "wrong-pass"));
    expect(store.dump()).toBe(before);
    expect(await join(roomId, "g2", "阿福")).toEqual({ roomId, alreadyMember: false });
  });
});

describe("服務重啟情境", () => {
  it("換一組新的 Deps（模擬重啟／另一個實例），密碼仍可驗證，關閉狀態仍然有效", async () => {
    const roomId = await openedRoom();
    const restarted = makeDeps(store);
    expect(await joinRoom(restarted, guest("g1"), { roomId, nickname: "小綿", password: PASSWORD })).toEqual({
      roomId,
      alreadyMember: false,
    });
    await closeRoom(restarted, hostCaller(), { roomId });
    expect(
      await errorCode(joinRoom(makeDeps(store), guest("g2"), { roomId, nickname: "阿福", password: PASSWORD })),
    ).toBe("failed-precondition");
  });

  it("兩個人同時加入最後一個名額，只有一人成功", async () => {
    const roomId = await openedRoom("HOST_IS_PLAYER");
    for (let i = 1; i <= 10; i++) await join(roomId, `g${i}`);
    const results = await Promise.all([errorCode(join(roomId, "a")), errorCode(join(roomId, "b"))]);
    expect(results.filter((r) => r === undefined)).toHaveLength(1);
    expect(results.filter((r) => r === "failed-precondition")).toHaveLength(1);
  });
});

describe("startRoomGame", () => {
  it("只有擁有者可開始；需房間開放且人數 6～12", async () => {
    const roomId = await openedRoom();
    for (let i = 1; i <= 5; i++) await join(roomId, `g${i}`);
    expect(await errorCode(startRoomGame(deps, hostCaller(), { roomId }))).toBe("failed-precondition");
    await join(roomId, "g6");
    expect(await errorCode(startRoomGame(deps, guest("g1"), { roomId }))).toBe("permission-denied");
    expect(await errorCode(startRoomGame(deps, hostCaller("host2", "second@example.com"), { roomId }))).toBe("permission-denied");
    expect(await startRoomGame(deps, hostCaller(), { roomId })).toEqual({ playerCount: 6 });
    expect(await errorCode(startRoomGame(deps, hostCaller(), { roomId }))).toBe("failed-precondition");
  });

  it("HOST_IS_PLAYER 時店長算一位玩家", async () => {
    const roomId = await openedRoom("HOST_IS_PLAYER");
    for (let i = 1; i <= 5; i++) await join(roomId, `g${i}`);
    expect(await startRoomGame(deps, hostCaller(), { roomId })).toEqual({ playerCount: 6 });
  });

  it("尚未開放的房間不能開始", async () => {
    const { roomId } = await createRoom(deps, hostCaller(), { password: PASSWORD, hostMode: "HOST_ONLY" });
    expect(await errorCode(startRoomGame(deps, hostCaller(), { roomId }))).toBe("failed-precondition");
  });
});

describe("leaveRoom / kickMember", () => {
  it("客人可離開，離開後名額釋出；店長不能離開", async () => {
    const roomId = await openedRoom("HOST_IS_PLAYER");
    await join(roomId, "g1");
    expect(await leaveRoom(deps, guest("g1"), { roomId })).toEqual({ left: true });
    expect(await leaveRoom(deps, guest("g1"), { roomId })).toEqual({ left: false });
    expect(await errorCode(leaveRoom(deps, hostCaller(), { roomId }))).toBe("failed-precondition");
  });

  it("店長可移除客人；客人、其他店長不行；店長自己不能被移除", async () => {
    const roomId = await openedRoom("HOST_IS_PLAYER");
    await join(roomId, "g1");
    await join(roomId, "g2");
    expect(await errorCode(kickMember(deps, guest("g2"), { roomId, uid: "g1" }))).toBe("permission-denied");
    expect(await errorCode(kickMember(deps, hostCaller("host2", "second@example.com"), { roomId, uid: "g1" }))).toBe("permission-denied");
    expect(await errorCode(kickMember(deps, hostCaller(), { roomId, uid: "host1" }))).toBe("not-found");
    expect(await kickMember(deps, hostCaller(), { roomId, uid: "g1" })).toEqual({ removed: true });
    expect(await errorCode(kickMember(deps, hostCaller(), { roomId, uid: "g1" }))).toBe("not-found");
  });

  it("遊戲開始後不能離開或移除", async () => {
    const roomId = await openedRoom();
    for (let i = 1; i <= 6; i++) await join(roomId, `g${i}`);
    await startRoomGame(deps, hostCaller(), { roomId });
    expect(await errorCode(leaveRoom(deps, guest("g1"), { roomId }))).toBe("failed-precondition");
    expect(await errorCode(kickMember(deps, hostCaller(), { roomId, uid: "g1" }))).toBe("failed-precondition");
  });

  it("房間關閉後離開視為沒有動作", async () => {
    const roomId = await openedRoom();
    await join(roomId, "g1");
    await closeRoom(deps, hostCaller(), { roomId });
    expect(await leaveRoom(deps, guest("g1"), { roomId })).toEqual({ left: false });
  });
});

describe("whoAmI", () => {
  it("只有白名單 Google 帳號是店長", () => {
    expect(whoAmI(deps, hostCaller())).toEqual({ isHost: true });
    expect(whoAmI(deps, hostCaller("h2", "second@example.com"))).toEqual({ isHost: true });
    expect(whoAmI(deps, guest("g1"))).toEqual({ isHost: false });
    expect(whoAmI(deps, null)).toEqual({ isHost: false });
  });
});
