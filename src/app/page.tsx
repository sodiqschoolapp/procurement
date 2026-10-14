import { connection } from "next/server";

import messages from "@/i18n/messages/uz.json";
import { shortCommit } from "@/server/commit";

export default async function StartPage() {
  // The commit is read when the page is asked for, not when it is built (0.16, plan decision 8).
  await connection();
  const commit = shortCommit();

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold text-balance">{messages.start.title}</h1>
        <p className="mt-3 text-muted-foreground">{messages.start.notice}</p>
        {commit && (
          <p className="mt-6 text-sm text-muted-foreground">
            {messages.start.version} <code>{commit}</code>
          </p>
        )}
      </div>
    </main>
  );
}
