// Pages shown without the app's chrome (header, sidebar, dock, notifiers, shift
// auto-logout) — screens of their own, like the follow wall on the camera
// computer. The proxy flags them with this request header; the root layout
// reads it. Shared by both, so it lives outside the server-only modules.
export const BARE_PAGES = ["/follow"];
export const BARE_HEADER = "x-raam-bare";
