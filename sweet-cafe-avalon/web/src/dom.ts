type Child = string | Node | null | undefined | false;

/** 建立 DOM 元素。文字一律以 textContent 加入，不使用 innerHTML，避免暱稱等使用者輸入造成 XSS。 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<Record<string, string | boolean | ((e: Event) => void)>> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (typeof value === "function") el.addEventListener(key.replace(/^on/, ""), value);
    else if (typeof value === "boolean") el.toggleAttribute(key, value);
    else if (value !== undefined) el.setAttribute(key, value);
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return el;
}

export function mount(root: HTMLElement, ...nodes: Node[]): void {
  root.replaceChildren(...nodes);
}

export function notice(kind: "error" | "info", text: string): HTMLElement {
  return h("p", { class: `notice ${kind}`, role: kind === "error" ? "alert" : "status" }, text);
}

/** 執行非同步動作並在按鈕上顯示處理中；錯誤顯示在指定的訊息區。 */
export async function run(button: HTMLButtonElement, slot: HTMLElement, work: () => Promise<void>): Promise<void> {
  button.disabled = true;
  slot.replaceChildren();
  try {
    await work();
  } catch (error) {
    slot.replaceChildren(notice("error", (error as Error).message));
  } finally {
    button.disabled = false;
  }
}
