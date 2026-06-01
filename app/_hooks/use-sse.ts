/* eslint-disable no-unused-vars */
"use client";

import { useEffect, useRef } from "react";

type SSEListener = (payload: { type: string; data?: unknown }) => void;

let sharedES: EventSource | null = null;
let refCount = 0;
const listeners = new Set<SSEListener>();

function getEventSource() {
  if (!sharedES || sharedES.readyState === EventSource.CLOSED) {
    sharedES = new EventSource("/api/notification/stream");

    sharedES.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        listeners.forEach((fn) => fn(payload));
      } catch {}
    };

    sharedES.onerror = () => {
      sharedES?.close();
      sharedES = null;
      setTimeout(() => {
        if (refCount > 0) getEventSource();
      }, 5_000);
    };
  }

  return sharedES;
}

export function useSSE(callback: SSEListener) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    const handler: SSEListener = (payload) => callbackRef.current(payload);
    listeners.add(handler);
    refCount++;
    getEventSource();

    return () => {
      listeners.delete(handler);
      refCount--;
      if (refCount <= 0 && sharedES) {
        sharedES.close();
        sharedES = null;
        refCount = 0;
      }
    };
  }, []);
}
