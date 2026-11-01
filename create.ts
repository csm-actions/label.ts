import type * as github from "@actions/github";
import * as core from "@actions/core";
import * as githubAppToken from "@suzuki-shunsuke/github-app-token";
import type { Inputs } from "./main.ts";

type Octokit = ReturnType<typeof github.getOctokit>;

/**
 * create with a function to build an Octokit client from a token, which tests
 * replace.
 *
 * With appOctokit, the token is created per call and revoked afterwards,
 * through the client built from it, so that it uses the proxy setting and the
 * base URL on GitHub Enterprise Server.
 */
export const createWithGetOctokit = async (
  inputs: Inputs,
  getOctokit: (token: string) => Octokit,
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
  const octokit = getOctokit(token.token);
  try {
    await createLabel(octokit, inputs);
  } finally {
    // The request is sent, so the token has done its job either way.
    await revoke(octokit, token);
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
  token: githubAppToken.Token,
): Promise<void> => {
  if (githubAppToken.hasExpired(token.expiresAt)) {
    core.info("skip revoking GitHub App token as it has already expired");
    return;
  }
  core.info("revoking GitHub App token");
  try {
    await octokit.rest.apps.revokeInstallationAccessToken();
  } catch (error) {
    core.warning(
      `failed to revoke GitHub App token: ${
        error instanceof Error ? error.message : JSON.stringify(error)
      }`,
    );
  }
};

const createLabel = async (octokit: Octokit, inputs: Inputs) => {
  await octokit.rest.issues.createLabel({
    owner: inputs.owner,
    repo: inputs.repo,
    name: inputs.name,
    description: inputs.description,
  });
};
