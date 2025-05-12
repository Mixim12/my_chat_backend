import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";

dotenv.config();

function replacePlaceholders<T>(obj: T): T {
  if (typeof obj === "string") {
    return obj.replace(/\$\{(\w+)\}/g, (match, varName) => {
      return process.env[varName] || match;
    }) as unknown as T;
  } else if (typeof obj === "object" && obj !== null) {
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        // @ts-ignore: Allow recursive replacement
        obj[key] = replacePlaceholders(obj[key]);
      }
    }
    return obj;
  } else {
    return obj;
  }
}

const configPath = path.resolve(__dirname, "../../config.json");
const rawConfig = fs.readFileSync(configPath, "utf-8");
const parsedConfig = JSON.parse(rawConfig);

// Debug log for config loading
console.log("[Config] Raw config loaded:", parsedConfig);

const config = replacePlaceholders(parsedConfig);

// Debug log for processed config
console.log("[Config] Processed config:", config);

export default config;
