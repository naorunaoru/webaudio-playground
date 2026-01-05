import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function computeBase(): string {
  if (process.env.VITE_BASE) return process.env.VITE_BASE;

  const githubRepo = process.env.GITHUB_REPOSITORY; // "owner/repo"
  const isGithubActions = process.env.GITHUB_ACTIONS === "true";
  if (isGithubActions && githubRepo) {
    const repoName = githubRepo.split("/")[1];
    if (repoName) {
      if (repoName.endsWith(".github.io")) return "/";
      return `/${repoName}/`;
    }
  }

  return "/";
}

export default defineConfig(() => ({
  base: computeBase(),
  plugins: [react()],
}));
