import {
  assertEquals,
  assertMatch,
  assertRejects,
  assertThrows,
} from "@std/assert";
import type * as github from "@actions/github";
import { create, newName } from "./main.ts";
import { createWithGetOctokit, errorMessage } from "./create.ts";

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
const newGetOctokit = (
  opts: { failToRevoke?: boolean; failToCreate?: boolean } = {},
) => {
  const labels: string[] = [];
  const revoked: string[] = [];
  const warnings: string[] = [];
  const getOctokit = (token: string) =>
    ({
      rest: {
        issues: {
          createLabel: (params: { name: string }) => {
            if (opts.failToCreate) {
              return Promise.reject(new Error("already exists"));
            }
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
  const deps = {
    getOctokit,
    warning: (message: string) => {
      warnings.push(message);
    },
  };
  return { deps, labels, revoked, warnings };
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
    const { deps, labels, revoked } = newGetOctokit();
    await createWithGetOctokit({ ...labelInputs("a"), appOctokit }, deps);
    await createWithGetOctokit({ ...labelInputs("b"), appOctokit }, deps);
    assertEquals(labels, ["token-1:a", "token-2:b"]);
    assertEquals(revoked, ["token-1", "token-2"]);
  });
  await t.step("revokes tokens of concurrent calls once each", async () => {
    const appOctokit = newAppOctokit();
    const { deps, revoked } = newGetOctokit();
    await Promise.all(
      ["a", "b", "c"].map((name) =>
        createWithGetOctokit({ ...labelInputs(name), appOctokit }, deps)
      ),
    );
    assertEquals(revoked.toSorted(), ["token-1", "token-2", "token-3"]);
  });
  await t.step("revokes the token even if creating a label fails", async () => {
    const { deps, revoked } = newGetOctokit({ failToCreate: true });
    await assertRejects(
      () =>
        createWithGetOctokit(
          { ...labelInputs("a"), appOctokit: newAppOctokit() },
          deps,
        ),
      Error,
      "already exists",
    );
    assertEquals(revoked, ["token-1"]);
  });
  await t.step("doesn't fail but warns if revoking fails", async () => {
    const { deps, labels, warnings } = newGetOctokit({ failToRevoke: true });
    await createWithGetOctokit(
      { ...labelInputs("a"), appOctokit: newAppOctokit() },
      deps,
    );
    assertEquals(labels, ["token-1:a"]);
    assertEquals(warnings, [
      "failed to revoke GitHub App token: network error",
    ]);
  });
});

Deno.test("errorMessage", async (t) => {
  await t.step("Error", () => {
    assertEquals(errorMessage(new Error("network error")), "network error");
  });
  await t.step("JSON", () => {
    assertEquals(errorMessage({ status: 500 }), '{"status":500}');
    assertEquals(errorMessage("network error"), '"network error"');
  });
  await t.step("values JSON can't serialize", () => {
    const circular: Record<string, unknown> = { status: 500 };
    circular.self = circular;
    assertEquals(
      errorMessage(circular),
      "<ref *1> { status: 500, self: [Circular *1] }",
    );
    assertEquals(errorMessage({ n: 1n }), "{ n: 1n }");
    assertEquals(errorMessage(undefined), "undefined");
  });
});
