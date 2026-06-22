import { beforeEach, afterEach, vi } from "vitest";
import { resetRepositoryInstance } from "../shifts/repository";

const TEST_STORAGE_KEYS = [
  "watch-schema-version",
  "watch-vessels",
  "watch-current-vessel",
  "watch-current-shift",
  "watch-current-shift-vessel-default-vessel",
  "watch-records",
  "engine-room-records",
  "anomaly-inspection-records",
  "bilge-water-records",
  "handover-summaries",
  "risk-assessments",
];

let originalLocalStorage: Storage;
let localStorageSnapshot: Record<string, string> = {};

function captureLocalStorageSnapshot(): void {
  localStorageSnapshot = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && !TEST_STORAGE_KEYS.includes(key)) {
      localStorageSnapshot[key] = localStorage.getItem(key) || "";
    }
  }
}

function restoreLocalStorageSnapshot(): void {
  TEST_STORAGE_KEYS.forEach((key) => {
    localStorage.removeItem(key);
  });
  Object.entries(localStorageSnapshot).forEach(([key, value]) => {
    localStorage.setItem(key, value);
  });
}

beforeEach(() => {
  if (!originalLocalStorage) {
    originalLocalStorage = { ...localStorage };
    captureLocalStorageSnapshot();
  }

  TEST_STORAGE_KEYS.forEach((key) => {
    localStorage.removeItem(key);
  });

  const mockLocalStorage = {
    _data: {} as Record<string, string>,
    getItem: vi.fn((key: string) => mockLocalStorage._data[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      mockLocalStorage._data[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete mockLocalStorage._data[key];
    }),
    clear: vi.fn(() => {
      mockLocalStorage._data = {};
    }),
    get length() {
      return Object.keys(mockLocalStorage._data).length;
    },
    key: vi.fn((index: number) => Object.keys(mockLocalStorage._data)[index] ?? null),
  };

  vi.spyOn(window, "localStorage", "get").mockReturnValue(mockLocalStorage as unknown as Storage);

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

afterEach(() => {
  vi.restoreAllMocks();
  restoreLocalStorageSnapshot();
  resetRepositoryInstance();
});
