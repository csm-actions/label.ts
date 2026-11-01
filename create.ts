import { inspect } from "node:util";
import type * as github from "@actions/github";
import * as core from "@actions/core";
import * as githubAppToken from "@suzuki-shunsuke/github-app-token";

type Octokit = ReturnType<typeof github.getOctokit>;

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

/** Functions to replace in tests */
export type Deps = {
  getOctokit: (token: string) => Octokit;
  warning: (message: string) => void;
};

/**
 * create with functions which tests replace.
 *
 * With appOctokit, the token is created per call and revoked afterwards,
 * through the client built from it, so that it uses the proxy setting and the
 * base URL on GitHub Enterprise Server.
 */
export const createWithGetOctokit = async (
  inputs: Inputs,
  deps: Deps,
): Promise<void> => {
  if (inputs.octokit) {
    await createLabel(inputs.octokit, inputs);
    return;
  }
  if (!inputs.appOctokit) {
    throw new Error("Either octokit or appOctokit must be provided");
  }
  const token = await githubAppToken.create({
    octokit: inputs.appOctokit,
    owner: inputs.owner,
    repositories: [inputs.repo],
    permissions: {
      issues: "write",
    },
  });
  core.setSecret(token.token);
  const octokit = deps.getOctokit(token.token);
  try {
    await createLabel(octokit, inputs);
  } finally {
    // The request is sent, so the token has done its job either way.
    await revoke(octokit, deps.warning);
  }
};

/**
 * Revokes the token without throwing.
 *
 * A failure to revoke mustn't hide the result: the label may already be
 * created, and a caller that retries would trigger the server workflow again.
 * The token expires in an hour anyway.
 */
const revoke = async (
  octokit: Octokit,
  warning: (message: string) => void,
): Promise<void> => {
  core.info("revoking GitHub App token");
  try {
    await octokit.rest.apps.revokeInstallationAccessToken();
  } catch (error) {
    warning(`failed to revoke GitHub App token: ${errorMessage(error)}`);
  }
};

/**
 * Formats an error without throwing.
 *
 * Values which JSON can't serialize, such as circular structures and BigInt,
 * are formatted by util.inspect.
 */
export const errorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  try {
    const s = JSON.stringify(error);
    if (s !== undefined) {
      return s;
    }
  } catch {
    // fall through
  }
  return inspect(error);
};

const createLabel = async (octokit: Octokit, inputs: Inputs) => {
  await octokit.rest.issues.createLabel({
    owner: inputs.owner,
    repo: inputs.repo,
    name: inputs.name,
    description: inputs.description,
  });
};
