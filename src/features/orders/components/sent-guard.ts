// What a typed cell of the drafts grid has already sent (plan of 2.5b, spec review Should fix 2:
// Enter commits and the blur after it would commit the same text again). A text is sent once
// until the server's value changes; when its save failed (no answer, or refused) it may be sent
// again, so Enter or Tab on the same text after "Not saved" sends it once more (review of the plan
// of 2.6, correction 2; 11-screens-and-ux.md rules 4 and 7). Plain TypeScript, tested alone.

export type SentGuard = {
  /** Whether to send `text`, given the server's `value`; marks it sent when true. */
  take(text: string, value: string): boolean;
  /** The save of `text` did not land: it may be sent again. */
  failed(text: string): void;
  /** The server's value changed, or the cell was focused again. */
  reset(): void;
};

export function createSentGuard(): SentGuard {
  let sent: string | null = null;
  return {
    take(text, value) {
      if (text === value || text === sent) return false;
      sent = text;
      return true;
    },
    failed(text) {
      if (sent === text) sent = null;
    },
    reset() {
      sent = null;
    },
  };
}
