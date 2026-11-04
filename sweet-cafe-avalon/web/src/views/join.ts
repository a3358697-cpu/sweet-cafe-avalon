import { api } from "../api";
import { ensureUser } from "../auth";
import { h, mount, run } from "../dom";
import { navigate } from "../nav";

export async function renderJoin(root: HTMLElement, roomId: string): Promise<() => void> {
  const message = h("div");
  const nickname = h("input", { id: "nick", maxlength: "16", required: true, autocomplete: "nickname" });
  const password = h("input", { id: "pw", type: "password", required: true, autocomplete: "off" });
  const submit = h("button", { type: "submit" }, "加入房間");

  const form = h(
    "form",
    {
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
    h("label", { for: "pw" }, "房間密碼"),
    password,
    submit,
    message,
  );
  mount(root, h("main", { class: "card" }, h("h1", {}, "加入甜綿菓室"), form));
  return () => {};
}
