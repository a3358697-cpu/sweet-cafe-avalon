import { collection, onSnapshot, query, where } from "firebase/firestore";
import { api, type HostMode } from "../api";
import { authReady, logout, signInAsHost } from "../auth";
import { h, mount, notice, run } from "../dom";
import { db } from "../firebase";
import { navigate } from "../nav";

const STATUS_TEXT: Record<string, string> = { created: "準備中", open: "招募中", playing: "遊戲中", closed: "已結束" };

export async function renderHost(root: HTMLElement): Promise<() => void> {
  const user = await authReady();
  if (!user || user.isAnonymous) return loginView(root);

  let isHost = false;
  try {
    isHost = (await api.whoAmI()).isHost;
  } catch (error) {
    return messageView(root, (error as Error).message);
  }
  if (!isHost) {
    return messageView(root, "這個帳號不是店長帳號，無法建立或管理房間。", true);
  }
  return dashboard(root, user.uid);
}

function loginView(root: HTMLElement): () => void {
  const message = h("div");
  const button = h("button", { type: "button", onclick: () => void run(button, message, async () => { await signInAsHost(); navigate("/host"); }) }, "使用 Google 登入");
  mount(root, h("main", { class: "card" }, h("h1", {}, "店長登入"), button, message));
  return () => {};
}

function messageView(root: HTMLElement, text: string, withLogout = false): () => void {
  mount(
    root,
    h("main", { class: "card" }, h("h1", {}, "店長管理"), notice("error", text),
      withLogout ? h("button", { type: "button", onclick: () => void logout().then(() => navigate("/host")) }, "改用其他帳號登入") : null),
  );
  return () => {};
}

function dashboard(root: HTMLElement, uid: string): () => void {
  const message = h("div");
  const password = h("input", { id: "pw", type: "text", inputmode: "numeric", pattern: "[0-9]{4}", maxlength: "4", required: true, autocomplete: "off" });
  const mode = h("select", { id: "mode" },
    h("option", { value: "HOST_ONLY" }, "店長只主持，不參與遊戲"),
    h("option", { value: "HOST_IS_PLAYER" }, "店長同時也是玩家"));
  const nick = h("input", { id: "hn", maxlength: "16", autocomplete: "nickname" });
  const nickRow = h("div", { hidden: true }, h("label", { for: "hn" }, "店長的玩家暱稱"), nick);
  mode.addEventListener("change", () => { nickRow.hidden = mode.value !== "HOST_IS_PLAYER"; });
  const submit = h("button", { type: "submit" }, "建立房間");

  const form = h("form", {
    onsubmit: (event) => {
      event.preventDefault();
      void run(submit, message, async () => {
        const hostMode = mode.value as HostMode;
        const input = hostMode === "HOST_IS_PLAYER"
          ? { password: password.value, hostMode, hostNickname: nick.value }
          : { password: password.value, hostMode };
        const { roomId } = await api.createRoom(input);
        navigate(`/host/${roomId}`);
      });
    },
  },
    h("label", { for: "pw" }, "房間密碼（4 位數字，可以 0 開頭，玩家加入時要輸入）"), password,
    h("label", { for: "mode" }, "主持模式"), mode, nickRow, submit, message);

  const list = h("ul", { class: "list" });
  const q = query(collection(db, "rooms"), where("hostUid", "==", uid));
  const off = onSnapshot(q, (snap) => {
    const rows = snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as { status: string; createdAt: { toMillis(): number } | null }) }))
      .sort((a, b) => (b.createdAt?.toMillis() ?? Date.now()) - (a.createdAt?.toMillis() ?? Date.now()))
      .map((r) => h("li", {}, h("a", { href: `/host/${r.id}`, "data-link": "" }, `房間 ${r.id.slice(0, 6)}…`), h("span", { class: `badge ${r.status}` }, STATUS_TEXT[r.status] ?? r.status)));
    list.replaceChildren(...(rows.length ? rows : [h("li", { class: "muted" }, "還沒有房間")]));
  }, () => list.replaceChildren(h("li", {}, notice("error", "無法讀取房間清單"))));

  mount(root, h("main", { class: "card" },
    h("h1", {}, "店長管理"), h("h2", {}, "建立新房間"), form,
    h("h2", {}, "我的房間"), list,
    h("button", { type: "button", class: "link", onclick: () => void logout().then(() => navigate("/host")) }, "登出")));
  return off;
}
