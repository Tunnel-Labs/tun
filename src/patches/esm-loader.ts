import { outdent } from "outdent";

const topLevelVariables = outdent`
	if (monorepoDirpath === undefined) {
		throw new Error('Could not find monorepo root');
	}

	const monorepoPackages = getMonorepoPackages({
		monorepoDirpath
	});
	const expandTildeImport = createTildeImportExpander({
		monorepoDirpath
	});
	const { getGlobfileContents, getGlobfilePath } = createGlobfileManager({
		monorepoDirpath
	});
`;

export default [
  {
    files: "dist/esm/index.cjs",
    from: /^/,
    to: outdent({ trimTrailingNewline: false })`
			const path = require('path');
			const { createTildeImportExpander } = require('tilde-imports');
			const { isGlobSpecifier, createGlobfileManager } = require('glob-imports');
			const { getMonorepoDirpath } = require('get-monorepo-root');
			const { exports: resolveExports } = require('resolve.exports');
			const { getMonorepoPackages } = require('monorepo-packages');
			const { pathToFileURL, fileURLToPath } = require('node:url');
			const monorepoDirpath = getMonorepoDirpath(__dirname);
			${topLevelVariables}
		`,
  },
  {
    files: "dist/esm/index.mjs",
    from: /^/,
    to: outdent({ trimTrailingNewline: false })`
			import { createTildeImportExpander } from 'tilde-imports';
			import { isGlobSpecifier, createGlobfileManager } from 'glob-imports';
			import { getMonorepoDirpath } from 'get-monorepo-root';
			import { exports as resolveExports } from 'resolve.exports';
			import { getMonorepoPackages } from 'monorepo-packages';
			import { pathToFileURL, fileURLToPath } from 'node:url';
			const monorepoDirpath = getMonorepoDirpath(import.meta.url);
			${topLevelVariables}
		`,
  },
  {
    files: ["dist/esm/index.mjs", "dist/esm/index.cjs"],
    from: /=async function\((\w,\w,\w)\)\{/,
    to: outdent({ trimTrailingNewline: false })`
			=async function($1){
				let [url, context, defaultLoad] = [$1];

				// If the file doesn't have an extension, we should return the source directly
				if (url.startsWith('file://') && path.extname(url) === '') {
					const source = await fs.promises.readFile(fileURLToPath(url), 'utf8');
					return {
						format: 'commonjs',
						source,
						shortCircuit: true
					};
				}

				const globfilePath = path
					.normalize(url.startsWith('file://') ? fileURLToPath(url) : url)
					.replace(/^[a-zA-Z]:/, '');

				if (path.basename(globfilePath).startsWith('__virtual__:')) {
					const globfileContents = getGlobfileContents({
						globfilePath,
						filepathType: 'absolute'
					});

					return {
						source: globfileContents,
						format: 'module',
						shortCircuit: true
					};
				}
		`,
  },
  {
    files: ["dist/esm/index.mjs", "dist/esm/index.cjs"],
    from: /=async function\((\w,\w,\w,\w)\)\{/,
    to: outdent({ trimTrailingNewline: false })`
			=async function($1){
				let [specifier, context, defaultResolve, recursiveCall] = [$1];
				if (specifier.includes('/node_modules/')) {
					return defaultResolve(specifier, context);
				}

				// Support tilde alias imports
				if (specifier.startsWith('~') && context.parentURL !== undefined) {
					const importerFilepath = fileURLToPath(context.parentURL);
					return {
						url: pathToFileURL(
							expandTildeImport({
								importSpecifier: specifier,
								importerFilepath
							})
						).toString(),
						format: 'module',
						shortCircuit: true
					};
				}

				// Support glob imports
				if (isGlobSpecifier(specifier) && context.parentURL !== undefined) {
					const importerFilepath = fileURLToPath(context.parentURL);
					const url = pathToFileURL(
						getGlobfilePath({
							globfileModuleSpecifier: specifier,
							importerFilepath
						})
					).toString();

					return {
						url,
						format: 'module',
						shortCircuit: true
					};
				}

				if (specifier.startsWith('@-/')) {
					const packageSlug = specifier.match(/@-\\\/([^/]+)/)?.[1];
					if (packageSlug === undefined) {
						throw new Error(
							\`Could not extract monorepo package slug from "\${specifier}"\`
						);
					}

					const packageMetadata = monorepoPackages[\`@-/\${packageSlug}\`];
					if (packageMetadata === undefined) {
						throw new Error(\`Could not find monorepo package "\${specifier}"\`);
					}

					const { packageDirpath, packageJson } = packageMetadata;

					const relativeImportPath = specifier.replace(\`@-/\${packageSlug}\`, '.');
					const relativeFilePaths =
						resolveExports(packageJson, relativeImportPath) ?? [];

					if (relativeFilePaths.length > 0) {
						return {
							url: pathToFileURL(
								path.join(packageDirpath, relativeFilePaths[0])
							).toString(),
							format: packageJson.type ?? 'commonjs',
							shortCircuit: true
						};
					}
				}
		`,
  },
  {
    files: ["dist/esm/index.mjs"],
    from: [/^/, "&&C();"],
    to: [
      outdent`
				import path from 'node:path';
				import { createRequire } from 'node:module';
				import { isFileEsmSync } from 'is-file-esm-ts';
			`,
      outdent({ trimTrailingNewline: false })`
				// When the \`--import\` flag is used, Node.js tries to load the entrypoint using
				// ESM, which breaks for extension-less JavaScript files.
				// Thus, if we detect that the entrypoint is an extension-less file, we
				// short-circuit and load it via CommonJS instead.
				&&(() => {
					if (process.argv[1] !== undefined && path.extname(process.argv[1]) === '') {
						try {
							if (isFileEsmSync(process.argv[1])) {
								import(process.argv[1]);
							} else {
								createRequire(import.meta.url)(process.argv[1]);
							}
						} catch {
							createRequire(import.meta.url)(process.argv[1]);
						}
					} else {
						C();
					}
				})();
			`,
    ],
  },
	{
		files: ['dist/esm/index.mjs', 'dist/esm/index.cjs'],
		from: /tsconfigRaw:(.*?)\}/,
		to: outdent`
			tsconfigRaw:(() => {
				let tsconfig = $1;
				return {
					...tsconfig,
					compilerOptions: {
						...tsconfig?.compilerOptions,
						experimentalDecorators: true
					}
				};
			})()}
		`
	}
];
