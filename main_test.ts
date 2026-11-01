import {
  assertEquals,
  assertMatch,
  assertRejects,
  assertThrows,
} from "@std/assert";
import type * as github from "@actions/github";
import { create, newName } from "./main.ts";
import { createWithGetOctokit } from "./create.ts";

type Octokit = ReturnType<typeof github.getOctokit>;

Deno.test("newName", async (t) => {
  await t.step("is 50 characters with a prefix and a timestamp", () => {
    const name = newName("securefix-");
    assertEquals(name.length, 50);
    assertMatch(name, /^securefix-\d{14}-[0-9a-z]{25}$/);
  });
  await t.step("is unique", () => {
    assertEquals(newName("foo-") === newName("foo-"), false);
  });
  await t.step("fails if the prefix is too long", () => {
    assertThrows(
      () => newName("a".repeat(31)),
      Error,
      "prefix must be less than 30 characters",
    );
  });
});

Deno.test("create", async (t) => {
  await t.step("creates a label with octokit", async () => {
    const calls: unknown[] = [];
    const octokit = {
      rest: {
        issues: {
          createLabel: (params: unknown) => {
            calls.push(params);
            return Promise.resolve({});
          },
        },
      },
    } as unknown as Octokit;
    await create({
      owner: "my-org",
      repo: "server",
      name: "securefix-abc",
      description: "my-org/client/123",
      octokit,
    });
    assertEquals(calls, [{
      owner: "my-org",
      repo: "server",
      name: "securefix-abc",
      description: "my-org/client/123",
    }]);
  });
  await t.step("fails if neither octokit nor appOctokit is given", async () => {
    await assertRejects(
      () =>
        create({
          owner: "my-org",
          repo: "server",
          name: "securefix-abc",
          description: "my-org/client/123",
        }),
      Error,
      "Either octokit or appOctokit must be provided",
    );
  });
});

// A fake GitHub App client which issues a new token per request.
const newAppOctokit = () => {
  let n = 0;
  return {
    request: (route: string) => {
      if (route === "GET /users/{username}/installation") {
        return Promise.resolve({ data: { id: 1, app_slug: "client" } });
      }
      n++;
      return Promise.resolve({
        data: {
          token: `token-${n}`,
          expires_at: new Date(Date.now() + 3600_000).toISOString(),
        },
      });
    },
  };
};

// A fake getOctokit which records the labels created and the tokens revoked.
const newGetOctokit = (opts: { failToRevoke?: boolean } = {}) => {
  const labels: string[] = [];
  const revoked: string[] = [];
  const getOctokit = (token: string) =>
    ({
      rest: {
        issues: {
          createLabel: (params: { name: string }) => {
            labels.push(`${token}:${params.name}`);
            return Promise.resolve({});
          },
        },
        apps: {
          revokeInstallationAccessToken: () => {
            if (opts.failToRevoke) {
              return Promise.reject(new Error("network error"));
            }
            revoked.push(token);
            return Promise.resolve({});
          },
        },
      },
    }) as unknown as Octokit;
  return { getOctokit, labels, revoked };
};

const labelInputs = (name: string) => ({
  owner: "my-org",
  repo: "server",
  name,
  description: "my-org/client/123",
});

Deno.test("createWithGetOctokit with appOctokit", async (t) => {
  await t.step("revokes only its own token per call", async () => {
    const appOctokit = newAppOctokit();
    const { getOctokit, labels, revoked } = newGetOctokit();
    await createWithGetOctokit({ ...labelInputs("a"), appOctokit }, getOctokit);
    await createWithGetOctokit({ ...labelInputs("b"), appOctokit }, getOctokit);
    assertEquals(labels, ["token-1:a", "token-2:b"]);
    assertEquals(revoked, ["token-1", "token-2"]);
  });
  await t.step("revokes tokens of concurrent calls once each", async () => {
    const appOctokit = newAppOctokit();
    const { getOctokit, revoked } = newGetOctokit();
    await Promise.all(
      ["a", "b", "c"].map((name) =>
        createWithGetOctokit({ ...labelInputs(name), appOctokit }, getOctokit)
      ),
    );
    assertEquals(revoked.toSorted(), ["token-1", "token-2", "token-3"]);
  });
  await t.step("doesn't fail if revoking fails", async () => {
    const { getOctokit, labels } = newGetOctokit({ failToRevoke: true });
    await createWithGetOctokit(
      { ...labelInputs("a"), appOctokit: newAppOctokit() },
      getOctokit,
    );
    assertEquals(labels, ["token-1:a"]);
  });
});
