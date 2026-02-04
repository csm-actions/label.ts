import * as github from "@actions/github";
import * as core from "@actions/core";
import * as githubAppToken from "@suzuki-shunsuke/github-app-token";

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
  octokit?: ReturnType<typeof github.getOctokit>;
  appId?: string;
  privateKey?: string;
};

const tokens: githubAppToken.Token[] = [];

export const create = async (inputs: Inputs) => {
  try {
    await createLabel(inputs);
  } finally {
    for (const token of tokens) {
      if (githubAppToken.hasExpired(token.expiresAt)) {
        core.info("skip revoking GitHub App token as it has already expired");
        continue;
      }
      core.info("revoking GitHub App token");
      await githubAppToken.revoke(token.token);
    }
  }
};

const createLabel = async (inputs: Inputs) => {
  const octokit = await getOctokit(inputs);
  await octokit.rest.issues.createLabel({
    owner: inputs.owner,
    repo: inputs.repo,
    name: inputs.name,
    description: inputs.description,
  });
};

const getOctokit = async (
  inputs: Inputs,
): Promise<ReturnType<typeof github.getOctokit>> => {
  if (inputs.octokit) {
    return inputs.octokit;
  }
  if (!inputs.appId || !inputs.privateKey) {
    throw new Error("Either octokit or appId and privateKey must be provided");
  }
  const token = await githubAppToken.create({
    appId: inputs.appId,
    privateKey: inputs.privateKey,
    owner: inputs.owner,
    repositories: [inputs.repo],
    permissions: {
      issues: "write",
    },
  });
  core.setSecret(token.token);
  tokens.push(token);
  return github.getOctokit(token.token);
};
