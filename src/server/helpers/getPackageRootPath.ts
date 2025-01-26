import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

export const getPackageRootPath = () => {
  const currentPath = fileURLToPath(import.meta.url);
  let candidate = path.dirname(currentPath);
  const root = path.parse(candidate).root;

  while (true) {
    try {
      if (fs.existsSync(path.join(candidate, "package.json"))) {
        return candidate;
      }
    } catch {
      // In case of permission errors or other issues, break out.
      break;
    }
    if (candidate === root) {
      break;
    }
    candidate = path.dirname(candidate);
  }
  // Return the original file URL if `package.json` wasn't found.
  return import.meta.url;
};
