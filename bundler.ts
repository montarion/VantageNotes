import * as esbuild from "https://deno.land/x/esbuild@v0.20.1/mod.js";
import { denoPlugins } from "jsr:@luca/esbuild-deno-loader@0.9";

esbuild.build({
  plugins: [...denoPlugins()],
  entryPoints: ["common/main.ts"],
  outdir: "static/dist/",
  bundle: true,
  platform: "browser",
  format: "esm",
  target: "esnext",

  treeShaking: true,
});
await esbuild.stop();