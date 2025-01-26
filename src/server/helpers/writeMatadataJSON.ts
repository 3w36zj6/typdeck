import fs from "fs";
import { Metadata } from "../../client/types/metadata";

export const writeMetadataJSON = (metadata: Metadata, writePath: string) => {
  fs.writeFileSync(writePath, JSON.stringify(metadata));
};
