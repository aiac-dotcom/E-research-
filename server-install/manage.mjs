#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
if (Number(process.versions.node.split(".")[0]) < 24) {
  console.error("Install Node.js 24 LTS before continuing.");
  process.exit(1);
}
const action = process.argv[2];
if (!["install", "build", "database", "start"].includes(action)) {
  console.error("Usage: node server-install/manage.mjs install|build|database|start");
  process.exit(1);
}
if (action !== "install") {
  if (!existsSync(resolve(root, ".env"))) {
    console.error("Copy server-install/.env.example to .env and fill in your configuration first.");
    process.exit(1);
  }
  process.loadEnvFile(resolve(root, ".env"));
  process.env.NODE_ENV = "production";
  process.env.BASE_PATH = "/";
  process.env.PORT ||= "3000";
  const required = action === "build"
    ? ["VITE_CLERK_PUBLISHABLE_KEY"]
    : action === "database"
      ? ["DATABASE_URL"]
      : ["DATABASE_URL", "CLERK_SECRET_KEY", "CLERK_PUBLISHABLE_KEY", "ADMIN_EMAILS"];
  const missing = required.filter((name) => !process.env[name] || /CHANGE_ME|REPLACE_WITH/.test(process.env[name]));
  if (missing.length) {
    console.error(`Fill in these .env entries: ${missing.join(", ")}`);
    process.exit(1);
  }
  if (action === "build" && process.env.VITE_CLERK_PROXY_URL) {
    console.error("For this standalone setup, leave VITE_CLERK_PROXY_URL empty and configure Clerk directly.");
    process.exit(1);
  }
}
function run(args) {
  const result = spawnSync("pnpm", args, { cwd: root, env: process.env, stdio: "inherit" });
  if (result.error) {
    console.error("Could not run pnpm. Install pnpm 10.26.1 first.");
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status || 1);
}
if (action === "install") run(["install", "--frozen-lockfile", "--prod=false"]);
if (action === "build") {
  run(["--filter", "@workspace/qa-dashboard", "run", "build"]);
  run(["--filter", "@workspace/api-server", "run", "build"]);
}
if (action === "database") {
  console.log("Initialize a NEW, EMPTY database only. For existing data, back up and review changes before accepting Drizzle prompts.");
  run(["--filter", "@workspace/db", "run", "push"]);
}
if (action === "start") {
  // Excel paths in the current application are relative to this directory.
  process.chdir(resolve(root, "artifacts/api-server"));
  if (!existsSync("dist/index.mjs")) {
    console.error("Build the application first.");
    process.exit(1);
  }
  await import(resolve(root, "artifacts/api-server/dist/index.mjs"));
}