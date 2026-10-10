import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `next dev` writes an AGENTS.md into the repository when it sees an AI coding agent.
  // The rules for agents here are CLAUDE.md; a second file is the owner's decision.
  agentRules: false,
};

export default nextConfig;
