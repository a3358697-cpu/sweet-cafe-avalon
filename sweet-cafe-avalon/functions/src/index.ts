import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { defineString } from "firebase-functions/params";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import { AppError } from "./core/errors.js";
import { newRoomId } from "./core/ids.js";
import { parseHostEmails } from "./core/hostAuth.js";
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
} from "./core/roomService.js";
import type { Caller } from "./core/types.js";
import { FirestoreStore } from "./firestoreStore.js";

initializeApp();

/** 店長信箱白名單：部署時由 functions/.env 或部署提示提供，不寫死在程式碼裡。 */
const HOST_EMAILS = defineString("HOST_EMAILS");

const REGION = "asia-east1";
const options = { region: REGION, maxInstances: 10 } as const;

function deps(): Deps {
  return {
    store: new FirestoreStore(getFirestore()),
    now: () => Date.now(),
    newRoomId,
    hostEmails: parseHostEmails(HOST_EMAILS.value()),
  };
}

function callerOf(request: CallableRequest<unknown>): Caller | null {
  const auth = request.auth;
  if (!auth) return null;
  return { uid: auth.uid, token: auth.token };
}

/** 把核心的 AppError 轉成 HttpsError；未預期的錯誤只記錄、不把細節回傳給客戶端。 */
async function handle<T>(work: () => Promise<T> | T): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof AppError) throw new HttpsError(error.code, error.message);
    console.error("未預期的錯誤", error);
    throw new HttpsError("internal", "伺服器發生錯誤，請稍後再試");
  }
}

const data = (request: CallableRequest<unknown>): Record<string, unknown> =>
  typeof request.data === "object" && request.data !== null ? (request.data as Record<string, unknown>) : {};

export const whoAmICall = onCall(options, (request) => handle(() => whoAmI(deps(), callerOf(request))));

export const createRoomCall = onCall(options, (request) => {
  const d = data(request);
  return handle(() => createRoom(deps(), callerOf(request), { password: d.password, hostMode: d.hostMode, hostNickname: d.hostNickname }));
});

export const openRoomCall = onCall(options, (request) =>
  handle(() => openRoom(deps(), callerOf(request), { roomId: data(request).roomId })),
);

export const closeRoomCall = onCall(options, (request) =>
  handle(() => closeRoom(deps(), callerOf(request), { roomId: data(request).roomId })),
);

export const startGameCall = onCall(options, (request) =>
  handle(() => startRoomGame(deps(), callerOf(request), { roomId: data(request).roomId })),
);

export const kickMemberCall = onCall(options, (request) => {
  const d = data(request);
  return handle(() => kickMember(deps(), callerOf(request), { roomId: d.roomId, uid: d.uid }));
});

export const joinRoomCall = onCall(options, (request) => {
  const d = data(request);
  return handle(() => joinRoom(deps(), callerOf(request), { roomId: d.roomId, nickname: d.nickname, password: d.password }));
});

export const leaveRoomCall = onCall(options, (request) =>
  handle(() => leaveRoom(deps(), callerOf(request), { roomId: data(request).roomId })),
);
