import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const fsMocks = vi.hoisted(() => ({
  access: vi.fn(),
  realpath: vi.fn(),
}));

const childProcessMocks = vi.hoisted(() => ({
  execSync: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  default: { access: fsMocks.access, realpath: fsMocks.realpath },
  access: fsMocks.access,
  realpath: fsMocks.realpath,
}));

vi.mock("node:child_process", () => ({
  execSync: childProcessMocks.execSync,
}));

import { resolveGatewayProgramArguments } from "./program-args.js";

const originalArgv = [...process.argv];
const originalEnv = {
  npm_config_user_agent: process.env.npm_config_user_agent,
  npm_lifecycle_event: process.env.npm_lifecycle_event,
  PNPM_SCRIPT_SRC_DIR: process.env.PNPM_SCRIPT_SRC_DIR,
  INIT_CWD: process.env.INIT_CWD,
};

afterEach(() => {
  process.argv = [...originalArgv];
  process.env.npm_config_user_agent = originalEnv.npm_config_user_agent;
  process.env.npm_lifecycle_event = originalEnv.npm_lifecycle_event;
  if (originalEnv.PNPM_SCRIPT_SRC_DIR === undefined) {
    delete process.env.PNPM_SCRIPT_SRC_DIR;
  } else {
    process.env.PNPM_SCRIPT_SRC_DIR = originalEnv.PNPM_SCRIPT_SRC_DIR;
  }
  if (originalEnv.INIT_CWD === undefined) {
    delete process.env.INIT_CWD;
  } else {
    process.env.INIT_CWD = originalEnv.INIT_CWD;
  }
  vi.resetAllMocks();
});

describe("resolveGatewayProgramArguments", () => {
  it("uses realpath-resolved dist entry when running via npx shim", async () => {
    const argv1 = path.resolve("/tmp/.npm/_npx/63c3/node_modules/.bin/clawdbot");
    const entryPath = path.resolve("/tmp/.npm/_npx/63c3/node_modules/clawdbot/dist/entry.js");
    process.argv = ["node", argv1];
    fsMocks.realpath.mockResolvedValue(entryPath);
    fsMocks.access.mockImplementation(async (target: string) => {
      if (target === entryPath) {
        return;
      }
      throw new Error("missing");
    });

    const result = await resolveGatewayProgramArguments({ port: 18789 });

    expect(result.programArguments).toEqual([
      process.execPath,
      entryPath,
      "gateway",
      "--port",
      "18789",
    ]);
  });

  it("falls back to node_modules package dist when .bin path is not resolved", async () => {
    const argv1 = path.resolve("/tmp/.npm/_npx/63c3/node_modules/.bin/clawdbot");
    const indexPath = path.resolve("/tmp/.npm/_npx/63c3/node_modules/clawdbot/dist/index.js");
    process.argv = ["node", argv1];
    fsMocks.realpath.mockRejectedValue(new Error("no realpath"));
    fsMocks.access.mockImplementation(async (target: string) => {
      if (target === indexPath) {
        return;
      }
      throw new Error("missing");
    });

    const result = await resolveGatewayProgramArguments({ port: 18789 });

    expect(result.programArguments).toEqual([
      process.execPath,
      indexPath,
      "gateway",
      "--port",
      "18789",
    ]);
  });

  it("uses pnpm when invoked via pnpm clawdbot", async () => {
    const repoRoot = path.resolve("/repo/clawdbot");
    const pnpmPath = path.resolve("/usr/local/bin/pnpm");

    process.env.npm_config_user_agent = "pnpm/10.5.0 node/v22.12.0";
    process.env.npm_lifecycle_event = "clawdbot";
    process.env.PNPM_SCRIPT_SRC_DIR = repoRoot;

    childProcessMocks.execSync.mockReturnValue(`${pnpmPath}\n`);
    fsMocks.access.mockImplementation(async (target: string) => {
      if (target === pnpmPath) return;
      throw new Error("missing");
    });

    const result = await resolveGatewayProgramArguments({ port: 18789 });

    expect(result.programArguments).toEqual([
      pnpmPath,
      "-C",
      repoRoot,
      "clawdbot",
      "gateway",
      "--port",
      "18789",
    ]);
    expect(result.workingDirectory).toBe(repoRoot);
  });
});
