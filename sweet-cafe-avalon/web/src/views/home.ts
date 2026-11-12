import { collection, onSnapshot, query, where } from "firebase/firestore";
import { ensureUser } from "../auth";
import { h, mount, notice } from "../dom";
import { db } from "../firebase";

const STATUS_TEXT: Record<string, string> = { created: "準備中", open: "招募中", playing: "遊戲中", closed: "已結束" };
const MODE_TEXT: Record<string, string> = { HOST_ONLY: "房主只主持", HOST_IS_PLAYER: "房主也是玩家" };

type RoomRow = { id: string; status: string; hostMode: string; createdAt: { toMillis(): number } | null };

/** 首頁：公開房間列表（即時同步）。只有「招募中」的房間可以進入輸入密碼；準備中與遊戲中只顯示狀態。 */
export async function renderHome(root: HTMLElement): Promise<() => void> {
  const list = h("ul", { class: "list" }, h("li", { class: "muted" }, "載入中…"));
  mount(
    root,
    h(
      "main",
      { class: "card" },
      h("h1", {}, "甜綿菓室：今晚正常營業嗎？"),
      h("h2", {}, "房間列表"),
      list,
      h("p", { class: "muted" }, h("a", { href: "/host", "data-link": "" }, "房主登入")),
    ),
  );

  try {
    await ensureUser(); // 匿名登入後才能讀取房間列表
  } catch {
    list.replaceChildren(h("li", {}, notice("error", "無法連線，請稍後重新整理。")));
    return () => {};
  }

  const q = query(collection(db, "rooms"), where("status", "in", ["created", "open", "playing"]));
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<RoomRow, "id">) }))
        .sort((a, b) => (b.createdAt?.toMillis() ?? Date.now()) - (a.createdAt?.toMillis() ?? Date.now()))
        .map((r) =>
          h(
            "li",
            {},
            r.status === "open"
              ? h("a", { href: `/join/${r.id}`, "data-link": "" }, `房間 ${r.id.slice(0, 6)}（${MODE_TEXT[r.hostMode] ?? ""}）`)
              : h("span", {}, `房間 ${r.id.slice(0, 6)}（${MODE_TEXT[r.hostMode] ?? ""}）`),
            h("span", { class: `badge ${r.status}` }, STATUS_TEXT[r.status] ?? r.status),
          ),
        );
      list.replaceChildren(...(rows.length ? rows : [h("li", { class: "muted" }, "目前沒有房間")]));
    },
    () => list.replaceChildren(h("li", {}, notice("error", "無法讀取房間列表"))),
  );
}
