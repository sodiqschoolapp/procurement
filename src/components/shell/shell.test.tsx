import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { Role } from "@/domain/permissions";
import en from "@/i18n/messages/en.json";

import { initialsOf } from "./person";
import { Sidebar } from "./sidebar";
import { TabBar } from "./tab-bar";

// 11-screens-and-ux.md, Interface per role ("A page a role cannot use ... is simply absent from
// the menu") and rule 13 (keyboard, 44 px targets); docs/design-system.md, Layout shell and This
// app (Phone tab bar: "the first four and 'More'"). Rendered with react-dom/server; the "More"
// popup and the rail need a browser (tests/e2e/shell.spec.ts).

const pathname = vi.hoisted(() => ({ current: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));
vi.mock("@/app/login/actions", () => ({ signOutAction: async () => undefined }));

function wrap(node: React.ReactNode): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Tashkent">
      {node}
    </NextIntlClientProvider>,
  );
}

function linkLabels(html: string): string[] {
  return [...html.matchAll(/<a [^>]*href="([^"]+)"[^>]*>/g)]
    .map((match) => match[0])
    .filter((tag) => !tag.includes('href="/profile"'))
    .map((tag) => /aria-label="([^"]+)"/.exec(tag)?.[1] ?? /href="([^"]+)"/.exec(tag)![1]!);
}

describe("the sidebar (Interface per role; design system, Layout shell)", () => {
  const cases: Record<Role, string[]> = {
    MANAGER: ["Home", "Orders", "Warehouse", "Analytics", "Reports"],
    HEAD: ["Home", "Orders", "Warehouse", "Money", "Analytics", "Reports", "Admin"],
    PRINCIPAL: ["Home", "Orders", "Stock", "Analytics", "Reports"],
    FINANCE: ["Home", "Orders", "Money", "Stock", "Analytics", "Reports"],
  };
  for (const [role, labels] of Object.entries(cases)) {
    it(`${role}: exactly its items, each named for the rail`, () => {
      expect(
        linkLabels(
          wrap(<Sidebar role={role as Role} fullName="Sinov Sinovov" schoolName={null} />),
        ),
      ).toEqual(labels);
    });
  }

  it("marks the active item as the current page, and only that one", () => {
    pathname.current = "/warehouse/documents";
    const html = wrap(<Sidebar role="HEAD" fullName="Sinov Sinovov" schoolName={null} />);
    pathname.current = "/";
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-label="Warehouse"[^>]*aria-current="page"/);
  });

  // build-plan 1.1, Done when: "set the school name and see it in the shell" (plan, decision 13).
  it("shows the school name under the logo once set, and nothing before", () => {
    const named = wrap(
      <Sidebar role="MANAGER" fullName="Sinov Sinovov" schoolName="Invented School" />,
    );
    expect(named).toMatch(/<p[^>]*title="Invented School"[^>]*>Invented School<\/p>/);
    const unnamed = wrap(<Sidebar role="MANAGER" fullName="Sinov Sinovov" schoolName={null} />);
    expect(unnamed).not.toContain("Invented School");
  });

  it("has the collapse button and the sign-out button, both named", () => {
    const html = wrap(<Sidebar role="FINANCE" fullName="Sinov Sinovov" schoolName={null} />);
    expect(html).toContain('aria-label="Collapse the menu"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-label="Sign out"');
    expect(html).toContain("Finance");
  });
});

describe("the phone tab bar (design system, This app: Phone tab bar)", () => {
  it("Head: Home, Orders, Warehouse, Money and More", () => {
    const html = wrap(<TabBar role="HEAD" />);
    expect(html.match(/<a /g)).toHaveLength(4);
    for (const word of ["Home", "Orders", "Warehouse", "Money", "More"]) {
      expect(html).toContain(`>${word}</span>`);
    }
    expect(html).not.toContain(">Admin<");
  });

  it("Manager: all five and no More", () => {
    const html = wrap(<TabBar role="MANAGER" />);
    expect(html.match(/<a /g)).toHaveLength(5);
    expect(html).not.toContain(">More<");
  });

  it("every tab is at least 44 px (11 rule 13)", () => {
    const html = wrap(<TabBar role="FINANCE" />);
    expect(html.match(/min-h-14 min-w-11/g)).toHaveLength(5);
  });
});

describe("the avatar's initials (design system, Layout shell)", () => {
  it("are the first letters of the first two words", () => {
    expect(initialsOf("Kamola Sinovova")).toBe("KS");
    expect(initialsOf("  dilshod  ")).toBe("D");
    expect(initialsOf("Anvar Botir oʻgʻli Sinovov")).toBe("AB");
  });
});
