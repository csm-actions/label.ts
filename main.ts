export const newName = (prefix: string): string => {
  if (prefix.length > 30) {
    throw new Error("prefix must be less than 30 characters");
  }
  return `${prefix}${
    Array.from({ length: 50 - prefix.length }, () =>
      Math.floor(Math.random() * 36).toString(36)).join("")
  }`;
};
