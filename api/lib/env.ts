import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value && process.env.NODE_ENV === "production") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value ?? "";
}

export const env = {
  appId: required("APP_ID"),
  appSecret: required("APP_SECRET"),
  sessionSecret: required("SESSION_SECRET"),
  isProduction: process.env.NODE_ENV === "production",
  databaseUrl: required("DATABASE_URL"),
  kimiAuthUrl: required("KIMI_AUTH_URL"),
  kimiOpenUrl: required("KIMI_OPEN_URL"),
  kimiApiKey: process.env.KIMI_API_KEY ?? "",
  kimiApiBaseUrl: (process.env.KIMI_API_BASE_URL ?? "https://api.moonshot.cn/v1").replace(/\/$/, ""),
  kimiModel: process.env.KIMI_MODEL ?? "kimi-k2.6",
  kimiAllowLabContext: process.env.KIMI_ALLOW_LAB_CONTEXT === "true",
  publicBaseUrl: required("PUBLIC_BASE_URL").replace(/\/$/, ""),
  ownerUnionId: process.env.OWNER_UNION_ID ?? "",
};

if (env.isProduction) {
  if (Buffer.byteLength(env.sessionSecret, "utf8") < 32) {
    throw new Error("SESSION_SECRET must contain at least 32 bytes in production");
  }
  const publicUrl = new URL(env.publicBaseUrl);
  if (publicUrl.protocol !== "https:") {
    throw new Error("PUBLIC_BASE_URL must use HTTPS in production");
  }
}
