import type { CreateNodesV2 } from "nx/src/devkit-exports";

export const name = "nx-defaults";

const biomeInputs = [
	"default",
	"^default",
	"{workspaceRoot}/biome.json",
];

export const createNodesV2: CreateNodesV2 = [
	"packages/*/package.json",
	(configFiles) =>
		configFiles.map((configFile) => {
			const root = configFile.replace("/package.json", "");
			return [
				configFile,
				{
					projects: {
						[root]: {
							targets: {
								build: { command: "true", options: { cwd: root } },
								check: { command: "tsc --noEmit", options: { cwd: root } },
								"biome:check": {
									command: `biome check {projectRoot}`,
									cache: true,
									inputs: biomeInputs,
								},
								"biome:write": {
									command: `biome check --write {projectRoot}`,
									cache: false,
								},
							},
						},
					},
				},
			];
		}),
];
