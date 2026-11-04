let handler: () => void = () => {};
export const setRouteHandler = (fn: () => void): void => { handler = fn; };
export function navigate(path: string): void {
  history.pushState(null, "", path);
  handler();
}
