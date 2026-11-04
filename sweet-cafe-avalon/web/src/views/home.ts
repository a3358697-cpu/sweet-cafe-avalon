import { h, mount } from "../dom";

export async function renderHome(root: HTMLElement): Promise<() => void> {
  mount(
    root,
    h(
      "main",
      { class: "card" },
      h("h1", {}, "甜綿菓室：今晚正常營業嗎？"),
      h("p", {}, "想加入遊戲，請向店長索取邀請網址與房間密碼。"),
      h("p", { class: "muted" }, h("a", { href: "/host", "data-link": "" }, "店長登入")),
    ),
  );
  return () => {};
}
