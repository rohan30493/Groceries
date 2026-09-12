/**
 * Browser / Web Notification service for Lira's basket handoff.
 *
 * Rules:
 * 1. Explicit user opt-in only via user interaction. Never auto-request on load.
 * 2. Graceful fallback on unsupported devices (e.g. mobile safari without PWA, or if denied).
 * 3. Never throw or interrupt the main application flow.
 */

export type NotificationPermissionStatus =
  | "default"
  | "granted"
  | "denied"
  | "unsupported";

export function getBrowserNotificationPermission(): NotificationPermissionStatus {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission as NotificationPermissionStatus;
}

/**
 * Requests notification permission upon explicit user action.
 */
export async function requestNotificationPermission(): Promise<NotificationPermissionStatus> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }

  try {
    const permission = await Notification.requestPermission();
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("household_push_enabled", permission === "granted" ? "true" : "false");
    }
    return permission as NotificationPermissionStatus;
  } catch (err) {
    console.warn("Notification permission request error:", err);
    return "denied";
  }
}

/**
 * Dispatches a native browser notification when Lira hands off the basket.
 *
 * Exact required message:
 * Title: "Lira is done 🛒 — Your grocery basket is ready to review."
 * Body: "I’m done. Please proceed with order." (with item count and estimated value)
 */
export function sendBrowserHandoffNotification(options: {
  itemCount: number;
  estimatedValue: number | null;
  onOpenBasket?: () => void;
}): boolean {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return false;
  }

  if (Notification.permission !== "granted") {
    return false;
  }

  try {
    const estPart = options.estimatedValue ? ` (Est. ₹${options.estimatedValue})` : "";
    const bodyText = `“I’m done. Please proceed with order.” — ${options.itemCount} ${
      options.itemCount === 1 ? "item" : "items"
    }${estPart}`;

    const notification = new Notification("Lira is done 🛒 — Your grocery basket is ready to review.", {
      body: bodyText,
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      tag: "lira-basket-handoff"
    });

    notification.onclick = () => {
      window.focus();
      if (options.onOpenBasket) {
        options.onOpenBasket();
      }
      notification.close();
    };

    return true;
  } catch (err) {
    console.warn("Failed to show browser notification:", err);
    return false;
  }
}
