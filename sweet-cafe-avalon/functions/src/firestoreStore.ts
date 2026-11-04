import type { Firestore } from "firebase-admin/firestore";
import type { RoomStore, RoomTx } from "./core/store.js";
import type { MemberRecord, PasswordRecord, RoomRecord } from "./core/types.js";

/** Firestore 集合名稱。roomSecrets 只有後端（Admin SDK）能存取，規則全數拒絕客戶端。 */
export const COLLECTIONS = {
  rooms: "rooms",
  members: "members",
  secrets: "roomSecrets",
} as const;

/** 以 Admin SDK 實作 RoomStore；交易語意（先讀後寫）由 Firestore 本身保證。 */
export class FirestoreStore implements RoomStore {
  constructor(private readonly db: Firestore) {}

  runTransaction<T>(fn: (tx: RoomTx) => Promise<T>): Promise<T> {
    const db = this.db;
    return db.runTransaction(async (t) => {
      const room = (id: string) => db.collection(COLLECTIONS.rooms).doc(id);
      const member = (id: string, uid: string) => room(id).collection(COLLECTIONS.members).doc(uid);
      const secret = (id: string) => db.collection(COLLECTIONS.secrets).doc(id);

      async function read<V>(ref: FirebaseFirestore.DocumentReference): Promise<V | null> {
        const snap = await t.get(ref);
        return snap.exists ? (snap.data() as V) : null;
      }

      const tx: RoomTx = {
        getRoom: (id) => read<RoomRecord>(room(id)),
        setRoom: (id, value) => void t.set(room(id), value),
        getSecret: (id) => read<PasswordRecord>(secret(id)),
        setSecret: (id, value) => void t.set(secret(id), value),
        deleteSecret: (id) => void t.delete(secret(id)),
        getMember: (id, uid) => read<MemberRecord>(member(id, uid)),
        listMembers: async (id) => {
          const snap = await t.get(room(id).collection(COLLECTIONS.members));
          return snap.docs.map((d) => ({ uid: d.id, member: d.data() as MemberRecord }));
        },
        setMember: (id, uid, value) => void t.set(member(id, uid), value),
        deleteMember: (id, uid) => void t.delete(member(id, uid)),
      };
      return fn(tx);
    });
  }
}
