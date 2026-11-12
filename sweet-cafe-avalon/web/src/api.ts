import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { MAX_PLAYERS, isValidPlayerCount, type HostMode } from "../../src/rules";
import { auth, db } from "./firebase";
import { AppError } from "./lib/errors";
import { derivePasswordHash, newSaltB64 } from "./lib/password";
import { nicknameDocId, pickFreeSeat } from "./lib/seats";
import {
  parseHostMode,
  parseNickname,
  parsePassword,
  parsePasswordAttempt,
  parseRoomId,
  parseUid,
} from "./lib/validation";

export type { HostMode };

/**
 * 沒有後端：所有操作都由瀏覽器直接寫 Firestore，權限完全由 firestore.rules 把關。
 * 這裡的檢查只是為了給使用者清楚的中文訊息，不是安全邊界。
 */

const MAX_JOIN_TRIES = 4;

function currentUid(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new AppError("unauthenticated", "請先登入");
  return uid;
}

const roomRef = (roomId: string) => doc(db, "rooms", roomId);
const memberRef = (roomId: string, uid: string) => doc(db, "rooms", roomId, "members", uid);
const seatRef = (roomId: string, seatNo: number) => doc(db, "rooms", roomId, "seats", String(seatNo));
const nicknameRef = (roomId: string, id: string) => doc(db, "rooms", roomId, "nicknames", id);

type RoomData = { hostUid: string; hostMode: HostMode; status: "created" | "open" | "playing" | "closed"; pwSaltB64: string };
type MemberData = { role: "host" | "guest"; seatNo: number; nickDocId: string };

async function loadRoom(roomId: string): Promise<RoomData> {
  const snap = await getDoc(roomRef(roomId));
  if (!snap.exists()) throw new AppError("not-found", "找不到這個房間，請確認邀請網址是否正確");
  return snap.data() as RoomData;
}

function joinStatusMessage(status: RoomData["status"]): string | null {
  if (status === "open") return null;
  if (status === "created") return "房間還在準備中，房主開放入場後才能加入";
  if (status === "playing") return "遊戲已經開始，無法再加入";
  return "房間已結束，無法加入";
}

/** 把 Firestore 的權限錯誤轉成使用者看得懂的訊息；其他錯誤視為連線問題。 */
function friendly(error: unknown, denied: string): Error {
  if (error instanceof AppError) return error;
  const code = (error as { code?: string }).code;
  if (code === "permission-denied") return new AppError("permission-denied", denied);
  return new AppError("failed-precondition", "連線失敗，請稍後再試");
}

/** 寫入「座位＋暱稱索引＋成員」三份文件（同一個批次，全部成功或全部失敗）。 */
function addMemberWrites(
  batch: ReturnType<typeof writeBatch>,
  roomId: string,
  uid: string,
  member: { nickname: string; role: "host" | "guest"; seatNo: number },
): void {
  const nickDocId = nicknameDocId(member.nickname);
  batch.set(seatRef(roomId, member.seatNo), { uid });
  batch.set(nicknameRef(roomId, nickDocId), { uid });
  batch.set(memberRef(roomId, uid), {
    nickname: member.nickname,
    nickDocId,
    role: member.role,
    seatNo: member.seatNo,
    joinedAt: serverTimestamp(),
  });
}

export const api = {
  /** 只用來決定要不要顯示店長畫面；真正的權限由 Firestore 規則在每次寫入時檢查。 */
  async whoAmI(): Promise<{ isHost: boolean }> {
    const user = auth.currentUser;
    if (!user || user.isAnonymous || !user.providerData.some((p) => p.providerId === "google.com")) return { isHost: false };
    try {
      const snap = await getDoc(doc(db, "admins", user.uid));
      return { isHost: snap.exists() && snap.data().enabled === true };
    } catch {
      return { isHost: false };
    }
  },

  async createRoom(input: { password: string; hostMode: HostMode; hostNickname?: string }): Promise<{ roomId: string }> {
    const uid = currentUid();
    const password = parsePassword(input.password);
    const hostMode = parseHostMode(input.hostMode);
    const hostNickname = hostMode === "HOST_IS_PLAYER" ? parseNickname(input.hostNickname) : null;

    const pwSaltB64 = newSaltB64();
    const hashB64 = await derivePasswordHash(password, pwSaltB64);
    const ref = doc(collection(db, "rooms"));
    const batch = writeBatch(db);
    batch.set(ref, {
      hostUid: uid,
      hostMode,
      status: "created",
      maxPlayers: MAX_PLAYERS,
      pwSaltB64,
      createdAt: serverTimestamp(),
      openedAt: null,
      closedAt: null,
    });
    batch.set(doc(db, "roomSecrets", ref.id), { hashB64 });
    if (hostNickname !== null) addMemberWrites(batch, ref.id, uid, { nickname: hostNickname, role: "host", seatNo: 1 });
    try {
      await batch.commit();
    } catch (error) {
      throw friendly(error, "只有店長帳號可以建立房間");
    }
    return { roomId: ref.id };
  },

  async openRoom(roomIdInput: string): Promise<{ status: "open" }> {
    const roomId = parseRoomId(roomIdInput);
    try {
      await updateDoc(roomRef(roomId), { status: "open", openedAt: serverTimestamp() });
    } catch (error) {
      throw friendly(error, "無法開放房間（只有店長可以操作，且房間需為尚未開放狀態）");
    }
    return { status: "open" };
  },

  /** 關閉房間，並在同一個批次刪除密碼雜湊，密碼立即失效。 */
  async closeRoom(roomIdInput: string): Promise<{ status: "closed" }> {
    const roomId = parseRoomId(roomIdInput);
    const batch = writeBatch(db);
    batch.update(roomRef(roomId), { status: "closed", closedAt: serverTimestamp() });
    batch.delete(doc(db, "roomSecrets", roomId));
    try {
      await batch.commit();
    } catch (error) {
      throw friendly(error, "無法關閉房間（只有建立房間的店長可以操作，且房間尚未關閉）");
    }
    return { status: "closed" };
  },

  /** 開始遊戲：招募中且人數（含 HOST_IS_PLAYER 的房主）至少 6 人，最多 12 人由座位文件限制。人數下限只由房主端檢查，規則無法計數。 */
  async startGame(roomIdInput: string): Promise<{ playerCount: number }> {
    const roomId = parseRoomId(roomIdInput);
    const room = await loadRoom(roomId);
    if (room.status !== "open") throw new AppError("failed-precondition", "房間需要在開放中才能開始遊戲");
    const playerCount = (await getDocs(collection(db, "rooms", roomId, "members"))).size;
    if (!isValidPlayerCount(playerCount)) {
      throw new AppError("failed-precondition", `至少需要 6 位玩家才能開始（目前 ${playerCount} 位）`);
    }
    try {
      await updateDoc(roomRef(roomId), { status: "playing" });
    } catch (error) {
      throw friendly(error, "無法開始遊戲（只有店長可以操作）");
    }
    return { playerCount };
  },

  /** 刪除一位成員（座位、暱稱索引、成員資料同批刪除）。店長移除客人與客人自己離開共用。 */
  async removeMember(roomId: string, uid: string, denied: string): Promise<boolean> {
    const snap = await getDoc(memberRef(roomId, uid));
    if (!snap.exists()) return false;
    const member = snap.data() as MemberData;
    const batch = writeBatch(db);
    batch.delete(memberRef(roomId, uid));
    batch.delete(seatRef(roomId, member.seatNo));
    batch.delete(nicknameRef(roomId, member.nickDocId));
    try {
      await batch.commit();
    } catch (error) {
      throw friendly(error, denied);
    }
    return true;
  },

  async kickMember(roomIdInput: string, uidInput: string): Promise<{ removed: true }> {
    const roomId = parseRoomId(roomIdInput);
    const uid = parseUid(uidInput);
    const room = await loadRoom(roomId);
    if (room.status !== "created" && room.status !== "open") {
      throw new AppError("failed-precondition", "遊戲開始後或房間關閉後，無法移除玩家");
    }
    const removed = await api.removeMember(roomId, uid, "無法移除這位玩家（只有店長可以移除客人）");
    if (!removed) throw new AppError("not-found", "找不到這位客人");
    return { removed: true };
  },

  async leaveRoom(roomIdInput: string): Promise<{ left: boolean }> {
    const roomId = parseRoomId(roomIdInput);
    const uid = currentUid();
    const room = await loadRoom(roomId);
    if (room.status === "closed") return { left: false };
    if (room.status === "playing") throw new AppError("failed-precondition", "遊戲進行中，無法離開");
    const left = await api.removeMember(roomId, uid, "無法離開房間（店長不能離開，只能關閉房間）");
    return { left };
  },

  /**
   * 客人加入：先讀取房間、座位、暱稱以給出清楚訊息，再用單一批次寫入
   * 密碼證明＋座位＋暱稱索引＋成員。Firestore 規則才是真正的把關者。
   * 兩人同時搶同一個座位時，後寫入者會失敗，這裡重新讀取後換下一個空位重試。
   */
  async joinRoom(input: { roomId: string; nickname: string; password: string }): Promise<{ roomId: string; alreadyMember: boolean }> {
    const uid = currentUid();
    const roomId = parseRoomId(input.roomId);
    const nickname = parseNickname(input.nickname);
    const attempt = parsePasswordAttempt(input.password);

    for (let attemptNo = 0; attemptNo < MAX_JOIN_TRIES; attemptNo++) {
      const room = await loadRoom(roomId);
      if ((await getDoc(memberRef(roomId, uid))).exists()) return { roomId, alreadyMember: true };
      const statusMessage = joinStatusMessage(room.status);
      if (statusMessage !== null) throw new AppError("failed-precondition", statusMessage);
      if (room.hostUid === uid) throw new AppError("failed-precondition", "您是這間房間的店長，請從店長管理頁進入");

      const taken = (await getDocs(collection(db, "rooms", roomId, "seats"))).docs.map((d) => Number(d.id));
      const seatNo = pickFreeSeat(taken);
      if (seatNo === null) throw new AppError("failed-precondition", "房間人數已滿");
      const nickDocId = nicknameDocId(nickname);
      if ((await getDoc(nicknameRef(roomId, nickDocId))).exists()) {
        throw new AppError("already-exists", "這個暱稱已被使用，請換一個");
      }

      const proof = await derivePasswordHash(attempt, room.pwSaltB64);
      const batch = writeBatch(db);
      batch.set(doc(db, "rooms", roomId, "joinProofs", uid), { proof });
      addMemberWrites(batch, roomId, uid, { nickname, role: "guest", seatNo });
      try {
        await batch.commit();
        return { roomId, alreadyMember: false };
      } catch (error) {
        if ((error as { code?: string }).code !== "permission-denied") throw friendly(error, "");
        // 被規則拒絕：可能是座位剛被搶走、暱稱剛被使用、房間剛關閉，或密碼不正確。逐一確認原因。
        const latest = await loadRoom(roomId);
        const latestStatus = joinStatusMessage(latest.status);
        if (latestStatus !== null) throw new AppError("failed-precondition", latestStatus);
        if ((await getDoc(nicknameRef(roomId, nickDocId))).exists()) throw new AppError("already-exists", "這個暱稱已被使用，請換一個");
        if ((await getDoc(seatRef(roomId, seatNo))).exists()) continue; // 座位被搶，換下一個空位重試
        throw new AppError("permission-denied", "密碼錯誤，請再試一次");
      }
    }
    throw new AppError("failed-precondition", "目前加入的人很多，請再按一次加入");
  },
};
