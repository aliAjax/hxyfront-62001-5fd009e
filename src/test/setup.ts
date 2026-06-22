import { beforeEach, vi } from "vitest";
import { resetRepositoryInstance } from "../shifts/repository";

beforeEach(() => {
  localStorage.clear();
  resetRepositoryInstance();

  if (!globalThis.crypto) {
    globalThis.crypto = {
      randomUUID: () =>
        "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          const v = c === "x" ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        }),
    } as Crypto;
  }
});
