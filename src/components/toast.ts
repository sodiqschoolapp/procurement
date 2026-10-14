import { Toast } from "@base-ui/react/toast";

// Toasts (11-screens-and-ux.md rule 4: "Success shows a short message. Errors say in plain words
// what happened and what to do next"; plan of 0.10a, decision 10). One manager for the whole
// app, so any client code can call toast.success() or toast.error() with a text from the
// message files; <Toaster /> in the root layout draws them.

export type ToastKind = "success" | "error";

/** Success goes after 4 seconds; an error stays until it is closed (0 means never on its own). */
export function toastTimeout(kind: ToastKind): number {
  return kind === "success" ? 4000 : 0;
}

/** An error is announced at once; success politely. */
export function toastPriority(kind: ToastKind): "low" | "high" {
  return kind === "error" ? "high" : "low";
}

export const toastManager = Toast.createToastManager();

function show(kind: ToastKind, message: string): string {
  return toastManager.add({
    title: message,
    type: kind,
    timeout: toastTimeout(kind),
    priority: toastPriority(kind),
  });
}

export const toast = {
  success: (message: string) => show("success", message),
  error: (message: string) => show("error", message),
};
