import vinext from "vinext";
import { defineConfig } from "vite";
import { nitro } from "nitro/vite";
import hostingConfig from "./.openai/hosting.json";
import { sites } from "./build/sites-vite-plugin";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const { d1, r2 } = hostingConfig;

// macOS Seatbelt 환경에서는 HMR을 위해 polling을 사용합니다.
const isCodexSeatbeltSandbox =
  process.env.CODEX_SANDBOX === "seatbelt";

// Netlify 빌드 환경 여부
const isNetlify = process.env.NETLIFY === "true";

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],

  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: "site-creator-d1",
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],

  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "site-creator-r2",
        },
      ]
    : [],
};

export default defineConfig(async () => {
  // Netlify에서는 Nitro를 사용합니다.
  if (isNetlify) {
    return {
      server: {
        host: "0.0.0.0",
        allowedHosts: ["terminal.local"],
      },

      plugins: [
        vinext(),
        sites(),
        nitro(),
      ],
    };
  }

  // 로컬 및 기존 Cloudflare 미리보기 환경 설정
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: {
      host: "0.0.0.0",
      allowedHosts: ["terminal.local"],

      ...(isCodexSeatbeltSandbox
        ? {
            watch: {
              useFsEvents: false,
              usePolling: true,
            },
          }
        : {}),
    },

    plugins: [
      vinext(),
      sites(),

      cloudflare({
        viteEnvironment: {
          name: "rsc",
          childEnvironments: ["ssr"],
        },

        inspectorPort: false,
        config: localBindingConfig,
      }),
    ],
  };
});