import { doc, onSnapshot } from "firebase/firestore";
import { api } from "../api";
import { ensureUser } from "../auth";
import { h, mount, notice, run } from "../dom";
import { db } from "../firebase";
import { navigate } from "../nav";

type RoomStatus = "created" | "open" | "playing" | "closed";

const STATUS_NOTE: Record<RoomStatus, string> = {
  created: "房間還在準備中，房主按下「開放入場」後才能輸入密碼加入。",
  open: "",
  playing: "遊戲已經開始，無法再加入。",
  closed: "房間已結束，無法加入。",
};

/** 加入頁：即時顯示房間狀態；只有「招募中」才顯示暱稱與密碼欄位。 */
export async function renderJoin(root: HTMLElement, roomId: string): Promise<() => void> {
  const message = h("div");
  const note = h("div");
  const nickname = h("input", { id: "nick", maxlength: "16", required: true, autocomplete: "nickname" });
  const password = h("input", { id: "pw", type: "password", inputmode: "numeric", pattern: "[0-9]{4}", maxlength: "4", required: true, autocomplete: "off" });
  const submit = h("button", { type: "submit" }, "加入房間");

  const form = h(
    "form",
    {
      hidden: true,
      onsubmit: (event) => {
        event.preventDefault();
        void run(submit, message, async () => {
          await ensureUser();
          await api.joinRoom({ roomId, nickname: nickname.value, password: password.value });
          navigate(`/room/${roomId}`);
        });
      },
    },
    h("label", { for: "nick" }, "暱稱（最多 16 個字）"),
    nickname,
    h("label", { for: "pw" }, "房間密碼（4 位數字）"),
    password,
    submit,
    message,
  );
  mount(root, h("main", { class: "card" }, h("h1", {}, "加入甜綿菓室"), note, form, h("p", { class: "muted" }, h("a", { href: "/", "data-link": "" }, "回房間列表"))));

  try {
    await ensureUser();
  } catch {
    note.replaceChildren(notice("error", "無法連線，請稍後重新整理。"));
    return () => {};
  }

  return onSnapshot(
    doc(db, "rooms", roomId),
    (snap) => {
      if (!snap.exists()) {
        form.hidden = true;
        note.replaceChildren(notice("error", "找不到這個房間。"));
        return;
      }
      const status = (snap.data() as { status: RoomStatus }).status;
      form.hidden = status !== "open";
      note.replaceChildren(...(STATUS_NOTE[status] ? [notice("info", STATUS_NOTE[status])] : []));
    },
    () => note.replaceChildren(notice("error", "無法讀取房間狀態")),
  );
}
