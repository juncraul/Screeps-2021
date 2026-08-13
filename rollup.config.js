"use strict";

const fs = require("fs");
const clear = require("rollup-plugin-clear");
const resolve = require("@rollup/plugin-node-resolve");
const commonjs = require("@rollup/plugin-commonjs");
const json = require("@rollup/plugin-json");
const typescript = require("rollup-plugin-typescript2");
const screeps = require("rollup-plugin-screeps");

function sourceMapAsCommonJs() {
  return {
    name: "source-map-as-commonjs",
    closeBundle() {
      const sourceMapModulePath = "dist/main.js.map.js";
      if (!fs.existsSync(sourceMapModulePath)) {
        return;
      }

      const sourceMapRaw = fs.readFileSync(sourceMapModulePath, "utf8").trim();
      if (sourceMapRaw.startsWith("module.exports =")) {
        return;
      }

      fs.writeFileSync(sourceMapModulePath, `module.exports = ${sourceMapRaw};\n`);
    }
  };
}

let cfg;
const dest = process.env.DEST;
if (!dest) {
  console.log("No destination specified - code will be compiled but not uploaded");
} else if ((cfg = require("./screeps.json")[dest]) == null) {
  throw new Error("Invalid upload destination");
}

module.exports = {
  input: "src/main.ts",
  output: {
    file: "dist/main.js",
    format: "cjs",
    sourcemap: true
  },

  plugins: [
    clear({ targets: ["dist"] }),
    resolve(),
    commonjs(),
    json(),
    typescript({ tsconfig: "./tsconfig.json" }),
    sourceMapAsCommonJs(),
    screeps({ config: cfg, dryRun: cfg == null })
  ]
};
