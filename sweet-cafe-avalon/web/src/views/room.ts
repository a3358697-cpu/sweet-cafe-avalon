import { collection, doc, onSnapshot } from "firebase/firestore";
import { api } from "../api";
import { ensureUser } from "../auth";
import { h, mount, notice, run } from "../dom";
import { db } from "../firebase";
import { navigate } from "../nav";

type Room = { hostUid: string; hostMode: "HOST_ONLY" | "HOST_IS_PLAYER"; status: "created" | "open" | "playing" | "closed"; maxPlayers: number };
type Member = { uid: string; nickname: string; role: "host" | "guest" };

const STATUS_TEXT = { created: "準備中（尚未開放入場）", open: "招募中（玩家可輸入密碼加入）", playing: "遊戲中", closed: "已結束" } as const;
const MODE_TEXT = { HOST_ONLY: "店長只主持", HOST_IS_PLAYER: "店長也是玩家" } as const;

/** 大廳：即時同步房間狀態與成員。店長（manage=true）多出開放、開始、移除、關閉的按鈕，權限仍由後端驗證。 */
export async function renderRoom(root: HTMLElement, roomId: string, manage: boolean): Promise<() => void> {
  const user = await ensureUser();
  const body = h("div");
  const actionMessage = h("div");
  mount(root, h("main", { class: "card" }, body));

  let room: Room | null = null;
  let members: Member[] = [];
  let failed = false;

  function paint(): void {
    if (failed || !room) {
      body.replaceChildren(h("h1", {}, "大廳"), notice("error", failed ? "你不在這個房間，或房間已不存在。" : "載入中…"),
        h("a", { href: manage ? "/host" : "/", "data-link": "" }, "返回"));
      return;
    }
    const r = room;
    const invite = `${location.origin}/join/${roomId}`;
    const isHostView = manage && r.hostUid === user.uid;
    const nodes: Node[] = [
      h("h1", {}, "遊戲大廳"),
      h("p", {}, `狀態：${STATUS_TEXT[r.status]}　｜　模式：${MODE_TEXT[r.hostMode]}`),
    ];
    if (r.status === "closed") nodes.push(notice("info", "房間已結束，密碼已失效。"));

    if (isHostView && r.status !== "closed") {
      const copy = h("button", { type: "button", onclick: () => void navigator.clipboard.writeText(invite).catch(() => undefined) }, "複製邀請網址");
      nodes.push(h("p", {}, "邀請網址：", h("code", {}, invite)), copy, h("p", { class: "muted" }, "玩家可從首頁的房間列表或這個網址加入；房間開放入場後，輸入你設定的 4 位數字密碼即可。"));
    }

    nodes.push(h("h2", {}, `大廳玩家（${members.length}／${r.maxPlayers}）`));
    nodes.push(h("ul", { class: "list" }, ...(members.length ? members : []).map((m) => {
      const row = h("li", {}, h("span", {}, m.nickname, m.role === "host" ? "（店長）" : ""));
      if (isHostView && m.role === "guest" && (r.status === "created" || r.status === "open")) {
        const kick = h("button", { type: "button", class: "small", onclick: () => void run(kick, actionMessage, async () => { await api.kickMember(roomId, m.uid); }) }, "移除");
        row.append(kick);
      }
      return row;
    })));
    if (members.length === 0) nodes.push(h("p", { class: "muted" }, "目前還沒有玩家"));

    if (isHostView) {
      const buttons: Node[] = [];
      if (r.status === "created") {
        const b = h("button", { type: "button", onclick: () => void run(b, actionMessage, async () => { await api.openRoom(roomId); }) }, "開放入場");
        buttons.push(b);
      }
      if (r.status === "open") {
        const b = h("button", { type: "button", onclick: () => void run(b, actionMessage, async () => { await api.startGame(roomId); }) }, "開始遊戲（至少 6 人）");
        buttons.push(b);
      }
      if (r.status !== "closed") {
        const b = h("button", { type: "button", class: "danger", onclick: () => {
          if (confirm("確定要關閉房間嗎？關閉後密碼立即失效，客人無法再加入。")) void run(b, actionMessage, async () => { await api.closeRoom(roomId); });
        } }, "關閉房間");
        buttons.push(b);
      }
      nodes.push(h("div", { class: "row" }, ...buttons), actionMessage);
    } else if (r.status === "playing") {
      nodes.push(notice("info", "遊戲已開始。遊戲畫面將在下一階段加入。"));
    } else if (r.status !== "closed") {
      const leave = h("button", { type: "button", class: "link", onclick: () => void run(leave, actionMessage, async () => { await api.leaveRoom(roomId); navigate("/"); }) }, "離開房間");
      nodes.push(leave, actionMessage);
    }
    if (isHostView) nodes.push(h("a", { href: "/host", "data-link": "" }, "返回房間清單"));
    body.replaceChildren(...nodes);
  }

  const onError = (): void => { failed = true; paint(); };
  const offRoom = onSnapshot(doc(db, "rooms", roomId), (snap) => {
    if (!snap.exists()) return onError();
    failed = false;
    room = snap.data() as Room;
    paint();
  }, onError);
  const offMembers = onSnapshot(collection(db, "rooms", roomId, "members"), (snap) => {
    members = snap.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<Member, "uid">) }))
      .sort((a, b) => (a.role === b.role ? a.nickname.localeCompare(b.nickname, "zh-Hant") : a.role === "host" ? -1 : 1));
    paint();
  }, () => undefined);
  paint();
  return () => { offRoom(); offMembers(); };
}
