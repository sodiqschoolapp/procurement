import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  // `next dev` writes an AGENTS.md into the repository when it sees an AI coding agent.
  // The rules for agents here are CLAUDE.md; a second file is the owner's decision.
  agentRules: false,
};

// next-intl reads its request config from src/i18n/request.ts (task 0.5).
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
