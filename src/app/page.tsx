import messages from "@/i18n/messages/uz.json";

export default function StartPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold text-balance">{messages.start.title}</h1>
        <p className="text-muted-foreground mt-3">{messages.start.notice}</p>
      </div>
    </main>
  );
}
