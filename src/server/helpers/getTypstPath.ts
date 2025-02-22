import { execSync } from "child_process";

export const getTypstPath = (): string | null => {
  try {
    const typstPath = execSync("which typst").toString().trim();
    return typstPath;
  } catch {
    return null;
  }
};
