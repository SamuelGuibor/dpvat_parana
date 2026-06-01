import { EventEmitter } from "events";

const globalForEmitter = globalThis as unknown as {
  notificationEmitter: EventEmitter | undefined;
};

if (!globalForEmitter.notificationEmitter) {
  globalForEmitter.notificationEmitter = new EventEmitter();
  globalForEmitter.notificationEmitter.setMaxListeners(100);
}

export const notificationEmitter = globalForEmitter.notificationEmitter;
