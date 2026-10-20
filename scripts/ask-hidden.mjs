// The hidden prompt of the console scripts: `npm run user:first-head` (scripts/create-first-head.mjs)
// and `npm run user:renew-head` (scripts/renew-head.mjs). A password typed here is never shown
// and never printed (A8; plan of 8.2b).

/** Reads one line without showing it. */
export function askHidden(question) {
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    if (!input.isTTY) {
      reject(new Error("Run this in a terminal: the password is typed at the prompt."));
      return;
    }
    process.stdout.write(question);
    let typed = "";
    input.setRawMode(true);
    input.resume();
    input.setEncoding("utf8");
    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === "\r" || character === "\n") {
          input.setRawMode(false);
          input.pause();
          input.off("data", onData);
          process.stdout.write("\n");
          resolve(typed);
          return;
        }
        if (character === "\u0003") {
          input.setRawMode(false);
          process.stdout.write("\n");
          process.exit(130);
        }
        if (character === "\u007f" || character === "\b") typed = typed.slice(0, -1);
        else typed += character;
      }
    };
    input.on("data", onData);
  });
}
