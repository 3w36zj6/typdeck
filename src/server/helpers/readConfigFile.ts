import {
  parseJSON5,
  parseJSONC,
  parseYAML,
  parseJSON,
  parseTOML,
} from "confbox";
import fs from "fs";
import path from "path";
import type { ConfigFile } from "../types/ConfigFile";

export const readConfigFile = (configDirPath: string): ConfigFile => {
  const configFileNames = [
    "typdeck.json",
    "typdeck.jsonc",
    "typdeck.json5",
    "typdeck.yaml",
    "typdeck.yml",
    "typdeck.toml",
  ];

  let configContent: string | null = null;
  let configPath: string | null = null;

  for (const fileName of configFileNames) {
    const filePath = path.join(configDirPath, fileName);
    if (fs.existsSync(filePath)) {
      configPath = filePath;
      try {
        configContent = fs.readFileSync(filePath, "utf-8");
        break;
      } catch (error) {
        console.warn(
          `Failed to read ${filePath}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }
  }

  if (!configContent || !configPath) {
    console.warn("No configuration file found. Using default settings.");
    return {};
  }

  const ext = path.extname(configPath).substring(1);
  try {
    switch (ext) {
      case "json5":
        return parseJSON5(configContent);
      case "jsonc":
        return parseJSONC(configContent);
      case "yaml":
      case "yml":
        return parseYAML(configContent);
      case "json":
        return parseJSON(configContent);
      case "toml":
        return parseTOML(configContent);
      default:
        console.warn(`Unsupported file type: ${ext}. Using default settings.`);
        return {};
    }
  } catch (error) {
    console.error(
      `Failed to parse ${configPath}: ${error instanceof Error ? error.message : error}`,
    );
    return {};
  }
};
