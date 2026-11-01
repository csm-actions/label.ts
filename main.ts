import * as core from "@actions/core";
import * as github from "@actions/github";
import { createWithGetOctokit, type Inputs } from "./create.ts";

export type { Inputs };

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

export const create = async (inputs: Inputs): Promise<void> => {
  await createWithGetOctokit(inputs, {
    getOctokit: github.getOctokit,
    warning: core.warning,
  });
};
