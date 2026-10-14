// Invented people and branches for tests (CLAUDE.md, Conventions: "Names, phones and ids in
// tests, seeds and examples are invented"). Plain data only: insertUser() (tests/helpers/users.ts)
// and insertBranch() (tests/helpers/branches.ts) write these rows.

export type InventedRole = "HEAD" | "MANAGER" | "PRINCIPAL" | "FINANCE";
export type InventedLocale = "uz" | "ru" | "en";

export type InventedUser = {
  username: string;
  fullName: string;
  phone: string;
  role: InventedRole;
  locale: InventedLocale;
};

export type InventedBranch = { code: string; name: string };

// Made-up names, put together from common first names and family names; no real person.
const FIRST_NAMES = [
  "Aziza",
  "Bekzod",
  "Dilnoza",
  "Farrux",
  "Gulnora",
  "Jasur",
  "Kamola",
  "Lochin",
];
const FAMILY_NAMES = ["Testova", "Sinovov", "Namunaeva", "Misolov", "Toqimova", "Ixtiroev"];
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

// One count per test file (Vitest gives each file its own module state), so every call in a
// file gives a different username, phone and branch code.
let made = 0;

/** An invented user of one role. Phones are +998 90 000 xx xx: made up, not taken from anyone. */
export function inventedUser(
  role: InventedRole,
  overrides: Partial<InventedUser> = {},
): InventedUser {
  made += 1;
  const first = FIRST_NAMES[made % FIRST_NAMES.length] ?? "Aziza";
  const family = FAMILY_NAMES[made % FAMILY_NAMES.length] ?? "Testova";
  const four = String(made % 10_000).padStart(4, "0");
  return {
    username: `${role.toLowerCase()}_${made}`,
    fullName: `${first} ${family}`,
    phone: `+998 90 000 ${four.slice(0, 2)} ${four.slice(2)}`,
    role,
    locale: "uz",
    ...overrides,
  };
}

/** An invented branch: a code of 2 to 4 Latin capital letters (04-catalogs.md) and a name. */
export function inventedBranch(overrides: Partial<InventedBranch> = {}): InventedBranch {
  made += 1;
  // Three letters from the count, so 17 576 codes before one repeats.
  let rest = made % (26 * 26 * 26);
  let code = "";
  for (let place = 0; place < 3; place += 1) {
    code = (ALPHABET[rest % 26] ?? "A") + code;
    rest = Math.floor(rest / 26);
  }
  return { code, name: `Sinov filiali ${code}`, ...overrides };
}
