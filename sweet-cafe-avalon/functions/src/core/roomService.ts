import { MAX_PLAYERS, MIN_PLAYERS, isValidPlayerCount } from "../../../src/rules.js";
import { AppError, type AppErrorCode } from "./errors.js";
import { isHostCaller } from "./hostAuth.js";
import { hashPassword, verifyPassword } from "./password.js";
import type { RoomStore, RoomTx } from "./store.js";
import type { Caller, RoomRecord } from "./types.js";
import {
  nicknameKey,
  parseHostMode,
  parseNickname,
  parsePassword,
  parsePasswordAttempt,
  parseRoomId,
  parseUid,
} from "./validation.js";

export type Deps = {
  store: RoomStore;
  now: () => number;
  newRoomId: () => string;
  /** 後端設定的店長信箱白名單（小寫）。 */
  hostEmails: readonly string[];
};

/** 交易內以回傳值表達「預期中的失敗」：失敗仍要提交（例如記錄錯誤次數），不能直接丟錯讓交易回滾。 */
type Failure = { ok: false; code: AppErrorCode; message: string };
const fail = (code: AppErrorCode, message: string): Failure => ({ ok: false, code, message });

function requireCaller(caller: Caller | null): Caller {
  if (caller === null) throw new AppError("unauthenticated", "請先登入");
  return caller;
}

function requireHost(deps: Deps, caller: Caller | null): Caller {
  const user = requireCaller(caller);
  if (!isHostCaller(user, deps.hostEmails)) {
    throw new AppError("permission-denied", "只有店長可以執行這個操作");
  }
  return user;
}

/** 讀取房間並確認是呼叫者自己建立的；不是就丟錯（交易內尚未寫入，丟錯安全）。 */
async function loadOwnedRoom(tx: RoomTx, roomId: string, host: Caller): Promise<RoomRecord> {
  const room = await tx.getRoom(roomId);
  if (room === null) throw new AppError("not-found", "找不到這個房間");
  if (room.hostUid !== host.uid) throw new AppError("permission-denied", "這不是您建立的房間");
  return room;
}

// ───────────────────────────── 店長操作 ─────────────────────────────

export type CreateRoomInput = { password: unknown; hostMode: unknown; hostNickname?: unknown };

/** 建立房間（尚未開放）。密碼只存加鹽雜湊；HOST_IS_PLAYER 時店長同時是大廳成員。 */
export async function createRoom(
  deps: Deps,
  caller: Caller | null,
  input: CreateRoomInput,
): Promise<{ roomId: string }> {
  const host = requireHost(deps, caller);
  const password = parsePassword(input.password);
  const hostMode = parseHostMode(input.hostMode);
  const hostNickname = hostMode === "HOST_IS_PLAYER" ? parseNickname(input.hostNickname) : null;

  const secret = await hashPassword(password);
  const now = deps.now();
  const roomId = deps.newRoomId();

  await deps.store.runTransaction(async (tx) => {
    if ((await tx.getRoom(roomId)) !== null) {
      throw new AppError("already-exists", "房間編號重複，請再試一次");
    }
    tx.setRoom(roomId, {
      hostUid: host.uid,
      hostMode,
      status: "created",
      maxPlayers: MAX_PLAYERS,
      createdAtMs: now,
      openedAtMs: null,
      closedAtMs: null,
    });
    tx.setSecret(roomId, secret);
    if (hostNickname !== null) {
      tx.setMember(roomId, host.uid, { nickname: hostNickname, role: "host", joinedAtMs: now });
    }
  });
  return { roomId };
}

/** 開放房間：created → open。已開放視為成功（可重複呼叫）。 */
export async function openRoom(
  deps: Deps,
  caller: Caller | null,
  input: { roomId: unknown },
): Promise<{ status: "open" }> {
  const host = requireHost(deps, caller);
  const roomId = parseRoomId(input.roomId);
  const now = deps.now();
  await deps.store.runTransaction(async (tx) => {
    const room = await loadOwnedRoom(tx, roomId, host);
    if (room.status === "open") return;
    if (room.status !== "created") {
      throw new AppError("failed-precondition", "房間已開始遊戲或已關閉，無法開放");
    }
    tx.setRoom(roomId, { ...room, status: "open", openedAtMs: now });
  });
  return { status: "open" };
}

/** 關閉房間：任何狀態都可關閉；同時刪除密碼雜湊，密碼立即失效。已關閉視為成功。 */
export async function closeRoom(
  deps: Deps,
  caller: Caller | null,
  input: { roomId: unknown },
): Promise<{ status: "closed" }> {
  const host = requireHost(deps, caller);
  const roomId = parseRoomId(input.roomId);
  const now = deps.now();
  await deps.store.runTransaction(async (tx) => {
    const room = await loadOwnedRoom(tx, roomId, host);
    if (room.status === "closed") return;
    tx.setRoom(roomId, { ...room, status: "closed", closedAtMs: now });
    tx.deleteSecret(roomId);
  });
  return { status: "closed" };
}

/** 開始遊戲：房間需開放中，且玩家人數（含 HOST_IS_PLAYER 的店長）符合 6～12 人。 */
export async function startRoomGame(
  deps: Deps,
  caller: Caller | null,
  input: { roomId: unknown },
): Promise<{ playerCount: number }> {
  const host = requireHost(deps, caller);
  const roomId = parseRoomId(input.roomId);
  return deps.store.runTransaction(async (tx) => {
    const room = await loadOwnedRoom(tx, roomId, host);
    if (room.status !== "open") {
      throw new AppError("failed-precondition", "房間需要在開放中才能開始遊戲");
    }
    const playerCount = (await tx.listMembers(roomId)).length;
    if (!isValidPlayerCount(playerCount)) {
      throw new AppError(
        "failed-precondition",
        `需要 ${MIN_PLAYERS}～${MAX_PLAYERS} 位玩家才能開始（目前 ${playerCount} 位）`,
      );
    }
    tx.setRoom(roomId, { ...room, status: "playing" });
    return { playerCount };
  });
}

/** 移除大廳中的客人（遊戲開始前）。店長自己不能被移除。 */
export async function kickMember(
  deps: Deps,
  caller: Caller | null,
  input: { roomId: unknown; uid: unknown },
): Promise<{ removed: true }> {
  const host = requireHost(deps, caller);
  const roomId = parseRoomId(input.roomId);
  const uid = parseUid(input.uid);
  await deps.store.runTransaction(async (tx) => {
    const room = await loadOwnedRoom(tx, roomId, host);
    if (room.status !== "created" && room.status !== "open") {
      throw new AppError("failed-precondition", "遊戲開始後或房間關閉後，無法移除玩家");
    }
    const member = await tx.getMember(roomId, uid);
    if (member === null || member.role !== "guest") {
      throw new AppError("not-found", "找不到這位客人");
    }
    tx.deleteMember(roomId, uid);
  });
  return { removed: true };
}

// ───────────────────────────── 客人操作 ─────────────────────────────

export type JoinRoomInput = { roomId: unknown; nickname: unknown; password: unknown };

type JoinOutcome = Failure | { ok: true; alreadyMember: boolean };

function joinStatusMessage(status: RoomRecord["status"]): string | null {
  if (status === "open") return null;
  if (status === "created") return "房間尚未開放，請稍後再試";
  if (status === "playing") return "遊戲已經開始，無法再加入";
  return "房間已關閉，無法加入";
}

/**
 * 客人加入大廳。順序固定：房間存在 → 已是成員直接成功 → 房間需開放
 * → 驗證密碼（錯誤可自行重試，不設次數限制）→ 人數上限 → 暱稱不可重複。
 * 密碼不正確與房間不存在使用不同訊息，但都不洩漏任何密碼資訊。
 */
export async function joinRoom(
  deps: Deps,
  caller: Caller | null,
  input: JoinRoomInput,
): Promise<{ roomId: string; alreadyMember: boolean }> {
  const user = requireCaller(caller);
  const roomId = parseRoomId(input.roomId);
  const nickname = parseNickname(input.nickname);
  const attempt = parsePasswordAttempt(input.password);
  const now = deps.now();

  const outcome = await deps.store.runTransaction(async (tx): Promise<JoinOutcome> => {
    // ── 讀取（必須全部在寫入之前）──
    const room = await tx.getRoom(roomId);
    if (room === null) return fail("not-found", "找不到這個房間，請確認邀請網址是否正確");

    const existing = await tx.getMember(roomId, user.uid);
    if (existing !== null && room.status !== "closed") return { ok: true, alreadyMember: true };

    const statusMessage = joinStatusMessage(room.status);
    if (statusMessage !== null) return fail("failed-precondition", statusMessage);
    if (user.uid === room.hostUid) {
      return fail("failed-precondition", "您是這間房間的店長，請從店長管理頁進入");
    }

    const secret = await tx.getSecret(roomId);
    const members = await tx.listMembers(roomId);
    if (secret === null) return fail("failed-precondition", "房間目前無法加入，請聯絡店長");

    // ── 運算與寫入 ──
    if (!(await verifyPassword(attempt, secret))) {
      return fail("permission-denied", "房間密碼不正確");
    }
    if (members.length >= room.maxPlayers) return fail("failed-precondition", "房間人數已滿");
    const wanted = nicknameKey(nickname);
    if (members.some(({ member }) => nicknameKey(member.nickname) === wanted)) {
      return fail("already-exists", "這個暱稱已被使用，請換一個");
    }

    tx.setMember(roomId, user.uid, { nickname, role: "guest", joinedAtMs: now });
    return { ok: true, alreadyMember: false };
  });

  if (!outcome.ok) throw new AppError(outcome.code, outcome.message);
  return { roomId, alreadyMember: outcome.alreadyMember };
}

/** 客人離開大廳（遊戲開始前）。店長不能離開，只能關閉房間。 */
export async function leaveRoom(
  deps: Deps,
  caller: Caller | null,
  input: { roomId: unknown },
): Promise<{ left: boolean }> {
  const user = requireCaller(caller);
  const roomId = parseRoomId(input.roomId);
  return deps.store.runTransaction(async (tx) => {
    const room = await tx.getRoom(roomId);
    const member = await tx.getMember(roomId, user.uid);
    if (room === null || member === null || room.status === "closed") return { left: false };
    if (member.role === "host") {
      throw new AppError("failed-precondition", "店長不能離開房間，請改用關閉房間");
    }
    if (room.status === "playing") {
      throw new AppError("failed-precondition", "遊戲進行中，無法離開");
    }
    tx.deleteMember(roomId, user.uid);
    return { left: true };
  });
}

/** 前端用來決定要不要顯示店長功能；真正的權限仍由每個操作在後端各自驗證。 */
export function whoAmI(deps: Deps, caller: Caller | null): { isHost: boolean } {
  return { isHost: isHostCaller(caller, deps.hostEmails) };
}
