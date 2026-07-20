import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});

// jsdom does not implement HTMLDialogElement.showModal()/close() (used by
// packages/ui/src/Dialog.tsx for every modal, drawer, and bottom sheet in
// the app) -- without this, any test that opens a Dialog throws
// "el.showModal is not a function". This mirrors the native element's
// observable behavior closely enough for component tests: toggling the
// `open` attribute/property and firing the same "close" event Dialog.tsx
// listens for. Real open/close/focus-trap/Escape behavior is verified in
// the Playwright e2e suite, which runs in a real browser.
if (typeof HTMLDialogElement !== "undefined" && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}
