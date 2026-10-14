import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { configureClientConfiguration } from "./SetupClientConfiguration.js";
import type { SetupClient } from "./SupportedClients.js";

const kimiClient = (configPath: string): SetupClient => ({
  name: "kimi",
  configPath,
  format: "kimi",
});

const readReaEnv = async (
  configPath: string,
): Promise<Record<string, string> | undefined> => {
  const raw = await readFile(configPath, "utf8");
  const doc = JSON.parse(raw) as {
    mcpServers?: Record<string, { env?: Record<string, string> }>;
  };
  return doc.mcpServers?.rea?.env;
};

describe("kimi client registration input-schema profile", () => {
  it("defaults REA_MCP_INPUT_SCHEMA_PROFILE to compact (#3654)", async () => {
    // Moonshot's function-calling API rejects any tool whose parameters
    // schema exceeds its size cap; the default (full) catalog always does,
    // so a fresh `rea setup --client kimi` must advertise compact schemas.
    const root = await mkdtemp(join(tmpdir(), "rea-kimi-compact-"));
    try {
      const configPath = join(root, "mcp.json");
      const result = await configureClientConfiguration(
        kimiClient(configPath),
        {},
        ["node", "scripts/rea.mjs", "mcp"],
      );
      expect(result.status).toBe("configured");
      expect(await readReaEnv(configPath)).toMatchObject({
        REA_MCP_INPUT_SCHEMA_PROFILE: "compact",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("never overrides an explicitly configured input-schema profile", async () => {
    const root = await mkdtemp(join(tmpdir(), "rea-kimi-explicit-"));
    try {
      const configPath = join(root, "mcp.json");
      await writeFile(
        configPath,
        JSON.stringify({
          mcpServers: {
            rea: {
              command: "node",
              args: ["scripts/rea.mjs", "mcp"],
              env: { REA_MCP_INPUT_SCHEMA_PROFILE: "full" },
            },
          },
        }),
      );
      const result = await configureClientConfiguration(
        kimiClient(configPath),
        {},
        ["node", "scripts/rea.mjs", "mcp"],
      );
      expect(result.status).toBe("configured");
      expect(await readReaEnv(configPath)).toMatchObject({
        REA_MCP_INPUT_SCHEMA_PROFILE: "full",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("does not add the profile for other clients", async () => {
    const root = await mkdtemp(join(tmpdir(), "rea-other-client-"));
    try {
      const configPath = join(root, "config.json");
      const result = await configureClientConfiguration(
        { name: "vscode", configPath, format: "vscode" },
        {},
        ["node", "scripts/rea.mjs", "mcp"],
      );
      expect(result.status).toBe("configured");
      const raw = await readFile(configPath, "utf8");
      const doc = JSON.parse(raw) as {
        mcpServers?: Record<string, { env?: Record<string, string> }>;
      };
      expect(
        doc.mcpServers?.rea?.env?.["REA_MCP_INPUT_SCHEMA_PROFILE"],
      ).toBeUndefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
