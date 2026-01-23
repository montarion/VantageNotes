import "https://deno.land/std@0.224.0/dotenv/load.ts";
import * as esbuild from "https://deno.land/x/esbuild@v0.20.1/mod.js";
import { denoPlugins } from "jsr:@luca/esbuild-deno-loader@0.9";

function mustEnv(name: string): string {
  const v = Deno.env.get("WS_URL");
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}
esbuild.build({
  plugins: [...denoPlugins()],
  entryPoints: ["common/main.ts"],
  outdir: "static/dist/",
  bundle: true,
  platform: "browser",
  format: "esm",
  target: "esnext",

  treeShaking: true,

  define: {
    __BASE_URL__: JSON.stringify(Deno.env.get("BASE_URL")),
    __WS_URL__: JSON.stringify(Deno.env.get("WS_URL")),
  },
});
await esbuild.stop();