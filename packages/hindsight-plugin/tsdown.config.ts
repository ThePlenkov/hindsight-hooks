import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["src/*.ts"],
	format: "esm",
	dts: true,
	exports: true,
	clean: true,
});
