import type { RoomStore, RoomTx } from "./store.js";
import type { MemberRecord, PasswordRecord, RoomRecord } from "./types.js";

type Op = () => void;

/**
 * 測試用的記憶體儲存體，刻意模擬 Firestore 交易的限制：
 * 1. 交易一次只跑一個（模擬序列化隔離）。
 * 2. 寫入先暫存，回呼成功才提交；回呼丟出錯誤就全部捨棄。
 * 3. 寫入之後再讀取會丟錯（Firestore 要求讀取必須在寫入之前）。
 * 讀寫都會深拷貝，避免呼叫端與儲存體共用同一個物件。
 */
export class MemoryStore implements RoomStore {
  private readonly rooms = new Map<string, RoomRecord>();
  private readonly secrets = new Map<string, PasswordRecord>();
  private readonly members = new Map<string, MemberRecord>();
  private queue: Promise<unknown> = Promise.resolve();

  runTransaction<T>(fn: (tx: RoomTx) => Promise<T>): Promise<T> {
    const run = async (): Promise<T> => {
      const ops: Op[] = [];
      let wrote = false;
      const read = <V>(value: V | undefined): V | null => {
        if (wrote) throw new Error("交易中不能在寫入之後再讀取（Firestore 的限制）");
        return value === undefined ? null : structuredClone(value);
      };
      const write = (op: Op): void => {
        wrote = true;
        ops.push(op);
      };
      const memberKey = (roomId: string, uid: string): string => `${roomId}/${uid}`;

      const tx: RoomTx = {
        getRoom: async (id) => read(this.rooms.get(id)),
        setRoom: (id, room) => write(() => void this.rooms.set(id, structuredClone(room))),
        getSecret: async (id) => read(this.secrets.get(id)),
        setSecret: (id, secret) => write(() => void this.secrets.set(id, structuredClone(secret))),
        deleteSecret: (id) => write(() => void this.secrets.delete(id)),
        getMember: async (id, uid) => read(this.members.get(memberKey(id, uid))),
        listMembers: async (id) => {
          if (wrote) throw new Error("交易中不能在寫入之後再讀取（Firestore 的限制）");
          const prefix = `${id}/`;
          return [...this.members.entries()]
            .filter(([key]) => key.startsWith(prefix))
            .map(([key, member]) => ({ uid: key.slice(prefix.length), member: structuredClone(member) }));
        },
        setMember: (id, uid, member) =>
          write(() => void this.members.set(memberKey(id, uid), structuredClone(member))),
        deleteMember: (id, uid) => write(() => void this.members.delete(memberKey(id, uid))),
      };

      const result = await fn(tx);
      for (const op of ops) op();
      return result;
    };

    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }

  /** 把所有資料序列化成文字，測試用來確認沒有任何明文密碼被寫進儲存體。 */
  dump(): string {
    return JSON.stringify({
      rooms: [...this.rooms],
      secrets: [...this.secrets],
      members: [...this.members],
    });
  }

  hasSecret(roomId: string): boolean {
    return this.secrets.has(roomId);
  }
}
