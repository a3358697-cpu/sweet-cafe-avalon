import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";

export type HostMode = "HOST_ONLY" | "HOST_IS_PLAYER";

async function call<T>(name: string, data: unknown): Promise<T> {
  try {
    const result = await httpsCallable<unknown, T>(functions, name)(data);
    return result.data;
  } catch (error) {
    const e = error as { code?: string; message?: string };
    // 後端的錯誤訊息已是繁體中文；連線類錯誤給通用說明。
    const known = e.code?.startsWith("functions/") && e.code !== "functions/internal" && e.code !== "functions/unavailable";
    throw new Error(known && e.message ? e.message : "連線失敗，請稍後再試");
  }
}

export const api = {
  whoAmI: () => call<{ isHost: boolean }>("whoAmICall", {}),
  createRoom: (input: { password: string; hostMode: HostMode; hostNickname?: string }) =>
    call<{ roomId: string }>("createRoomCall", input),
  openRoom: (roomId: string) => call<{ status: "open" }>("openRoomCall", { roomId }),
  closeRoom: (roomId: string) => call<{ status: "closed" }>("closeRoomCall", { roomId }),
  startGame: (roomId: string) => call<{ playerCount: number }>("startGameCall", { roomId }),
  kickMember: (roomId: string, uid: string) => call<{ removed: true }>("kickMemberCall", { roomId, uid }),
  joinRoom: (input: { roomId: string; nickname: string; password: string }) =>
    call<{ roomId: string; alreadyMember: boolean }>("joinRoomCall", input),
  leaveRoom: (roomId: string) => call<{ left: boolean }>("leaveRoomCall", { roomId }),
};
