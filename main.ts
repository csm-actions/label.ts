import * as github from "@actions/github";
import type * as githubAppToken from "@suzuki-shunsuke/github-app-token";
import { createWithGetOctokit } from "./create.ts";

const nowS = (): string => {
  const date = new Date();
  const pad = (n: number): string => n.toString().padStart(2, "0");
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${yyyy}${mm}${dd}${hh}${min}${ss}`;
};

export const newName = (prefix: string): string => {
  if (prefix.length > 30) {
    throw new Error("prefix must be less than 30 characters");
  }
  return `${prefix}${nowS()}-${
    // 50 - 14 (timestap yyyymmddhhmmss) - 1 (-) = 35
    Array.from(
      { length: 35 - prefix.length },
      () => Math.floor(Math.random() * 36).toString(36),
    ).join("")}`;
};

export type Inputs = {
  owner: string;
  repo: string;
  name: string;
  description: string;
  /** An Octokit client authenticated with an installation access token. */
  octokit?: ReturnType<typeof github.getOctokit>;
  /**
   * An Octokit client authenticated as a GitHub App.
   *
   * It's used to create an installation access token, which is revoked once
   * the label is created.
   * Build it with @octokit/auth-app, passing either a private key or a
   * createJwt callback when the key is stored in a KMS or a HSM.
   */
  appOctokit?: githubAppToken.Client;
};

export const create = async (inputs: Inputs): Promise<void> => {
  await createWithGetOctokit(inputs, github.getOctokit);
};
