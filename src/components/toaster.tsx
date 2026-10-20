"use client";

import { Toast } from "@base-ui/react/toast";
import { useTranslations } from "next-intl";

import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/utils";

import { toastManager } from "./toast";

// Draws the toasts of toast.ts, mounted once in the root layout. A toast floats: the card
// colour, corner 8 and the one float shadow (docs/design-system.md, "Spacing, corners,
// elevation"); it opens in 160 ms, ease-out (Motion; review corrections 4 and 5). Base UI's
// viewport is a landmark the keyboard reaches with F6, and its toasts are announced.

function ToastList() {
  const t = useTranslations("common");
  const { toasts } = Toast.useToastManager();
  return toasts.map((item) => {
    const error = item.type === "error";
    return (
      <Toast.Root
        key={item.id}
        toast={item}
        className={cn(
          "flex w-full items-start gap-3 rounded-lg bg-popover p-3 pl-4 text-popover-foreground shadow-float",
          "transition-[opacity,translate] duration-160 ease-out",
          "data-ending-style:opacity-0 data-starting-style:translate-y-2 data-starting-style:opacity-0",
        )}
      >
        <Icon
          name={error ? "error" : "check_circle"}
          className={cn("mt-2.5", error ? "text-destructive" : "text-success")}
        />
        <Toast.Content className="min-w-0 flex-1 py-2.5">
          <Toast.Title className="text-sm" />
        </Toast.Content>
        <Toast.Close render={<Button variant="ghost" size="icon" aria-label={t("close")} />}>
          <Icon name="close" />
        </Toast.Close>
      </Toast.Root>
    );
  });
}

export function Toaster() {
  return (
    <Toast.Provider toastManager={toastManager}>
      <Toast.Portal>
        <Toast.Viewport className="fixed right-4 bottom-4 left-4 z-50 flex flex-col gap-2 sm:left-auto sm:w-96">
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
}
