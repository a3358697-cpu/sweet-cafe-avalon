import type {
  MemberRecord,
  PasswordRecord,
  RoomRecord,
} from "./types.js";

/**
 * 交易內可用的操作。與 Firestore 交易一樣：所有讀取必須在任何寫入之前，
 * 寫入先暫存、交易成功才一起提交；回呼丟出錯誤則全部捨棄。
 */
export interface RoomTx {
  getRoom(roomId: string): Promise<RoomRecord | null>;
  setRoom(roomId: string, room: RoomRecord): void;

  getSecret(roomId: string): Promise<PasswordRecord | null>;
  setSecret(roomId: string, secret: PasswordRecord): void;
  deleteSecret(roomId: string): void;

  getMember(roomId: string, uid: string): Promise<MemberRecord | null>;
  listMembers(roomId: string): Promise<Array<{ uid: string; member: MemberRecord }>>;
  setMember(roomId: string, uid: string, member: MemberRecord): void;
  deleteMember(roomId: string, uid: string): void;
}

export interface RoomStore {
  runTransaction<T>(fn: (tx: RoomTx) => Promise<T>): Promise<T>;
}
