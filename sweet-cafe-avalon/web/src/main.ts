import "./style.css";
import { h, mount, notice } from "./dom";
import { isConfigured } from "./firebase";
import { renderHome } from "./views/home";
import { renderHost } from "./views/host";
import { renderJoin } from "./views/join";
import { renderRoom } from "./views/room";
import { navigate, setRouteHandler } from "./nav";

const root = document.getElementById("app");
if (!root) throw new Error("找不到 #app");

let stop: (() => void) | null = null;

async function route(): Promise<void> {
  stop?.();
  stop = null;
  const path = location.pathname.replace(/\/+$/, "") || "/";
  const join = /^\/join\/([A-Za-z0-9_-]+)$/.exec(path);
  const room = /^\/room\/([A-Za-z0-9_-]+)$/.exec(path);
  const hostRoom = /^\/host\/([A-Za-z0-9_-]+)$/.exec(path);

  if (!isConfigured) {
    mount(root!, h("main", { class: "card" }, h("h1", {}, "甜綿菓室"), notice("error", "網站尚未設定 Firebase，請聯絡店長。")));
    return;
  }
  if (join?.[1]) stop = await renderJoin(root!, join[1]);
  else if (room?.[1]) stop = await renderRoom(root!, room[1], false);
  else if (hostRoom?.[1]) stop = await renderRoom(root!, hostRoom[1], true);
  else if (path === "/host") stop = await renderHost(root!);
  else stop = await renderHome(root!);
}

document.addEventListener("click", (event) => {
  const a = (event.target as Element).closest("a[data-link]");
  if (a instanceof HTMLAnchorElement && event.button === 0 && !event.metaKey && !event.ctrlKey) {
    event.preventDefault();
    navigate(a.getAttribute("href") ?? "/");
  }
});
setRouteHandler(() => void route());
window.addEventListener("popstate", () => void route());
void route();
