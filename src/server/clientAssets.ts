type EmbeddedClientAsset = {
  body: string;
  contentType: string;
};

export type ClientAsset = {
  body: Buffer;
  contentType: string;
};

declare const __TYPDECK_CLIENT_ASSETS__: Record<string, EmbeddedClientAsset>;

export const clientAssets = new Map<string, ClientAsset>(
  Object.entries(__TYPDECK_CLIENT_ASSETS__).map(
    ([pathname, { body, contentType }]) => [
      pathname,
      { body: Buffer.from(body), contentType },
    ],
  ),
);
