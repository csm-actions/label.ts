import {
  assertEquals,
  assertMatch,
  assertRejects,
  assertThrows,
} from "@std/assert";
import type * as github from "@actions/github";
import { create, newName } from "./main.ts";

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
