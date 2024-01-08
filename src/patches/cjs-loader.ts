import { outdent } from "outdent";

const topLevelVariables = outdent`
	const monorepoDirpath = getMonorepoDirpath(__dirname);
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

	const transformExtensions = [
		'.js',
		'.cjs',
		'.cts',
		'.mjs',
		'.mts',
		'.ts',
		'.tsx',
		'.jsx'
	];
`;

export default [
  {
    files: ["dist/cjs/index.cjs"],
    from: /^/,
    to: outdent`
			const { isGlobSpecifier, createGlobfileManager } = require( 'glob-imports');
			const { createTildeImportExpander } = require( 'tilde-imports');
			const { getMonorepoDirpath } = require( 'get-monorepo-root');
			const { isFileEsmSync } = require( 'is-file-esm-ts');
			const { getMonorepoPackages } = require( 'monorepo-packages');
			const resolve = require('resolve.exports');
			${topLevelVariables}
		`,
  },
  {
    files: ["dist/cjs/index.mjs"],
    from: /^/,
    to: outdent`
			import { isGlobSpecifier, createGlobfileManager } from 'glob-imports';
			import { createTildeImportExpander } from 'tilde-imports';
			import { getMonorepoDirpath } from 'get-monorepo-root';
			import { isFileEsmSync } from 'is-file-esm-ts';
			import { getMonorepoPackages } from 'monorepo-packages';
			import resolve from 'resolve.exports';
			${topLevelVariables}
		`,
  },
  {
    files: ["dist/cjs/index.cjs", "dist/cjs/index.mjs"],
    from: /const (\w)=\((\w,\w)\)=>\{/,
    to: outdent({ trimTrailingNewline: false })`
			const $1=($2)=>{
				const [module, filePath] = [$2];
				if (path.basename(filePath).startsWith('__virtual__:')) {
					const virtualFileContents = getGlobfileContents({
						globfilePath: filePath,
						moduleType: 'commonjs',
						filepathType: 'absolute'
					});

					module._compile(virtualFileContents, filePath);
					return;
				}

				const shouldTransformFile = transformExtensions.some((extension) =>
					filePath.endsWith(extension)
				);
				if (!shouldTransformFile) {
					return defaultLoader(module, filePath);
				}

				let code = fs.readFileSync(filePath, 'utf8');

				if (filePath.includes('/node_modules/')) {
					try {
						if (isFileEsmSync(filePath)) {
							const transformed = transformSync(code, filePath, { format: 'cjs' });
							code = applySourceMap(transformed, filePath);
						}
					} catch {
						// Ignore invalid file extension issues
					}

					module._compile(code, filePath);
					return;
				}
		`,
  },
  {
    from: /\._resolveFilename=\((\w,\w,\w,\w)\)=>\{/,
    files: ["dist/cjs/index.cjs", "dist/cjs/index.mjs"],
    to: outdent({ trimTrailingNewline: false })`
			._resolveFilename=($1)=>{
				const [request, parent, isMain, options] = [$1];
				if (parent && isGlobSpecifier(request)) {
					return getGlobfilePath({
						globfileModuleSpecifier: request,
						importerFilepath: parent.filename
					});
				}

				if (parent && parent.filename !== null && request.startsWith('~')) {
					request = expandTildeImport({
						importSpecifier: request,
						importerFilepath: parent.filename
					});
				}

				if (request.startsWith('@-/')) {
					const packageSlug = request.match(/@-\\\/([^/]+)/)?.[1];
					if (packageSlug === undefined) {
						throw new Error(
							\`Could not extract monorepo package slug from "\${request}"\`
						);
					}

					const packageMetadata = monorepoPackages[\`@-/\${packageSlug}\`];
					if (packageMetadata === undefined) {
						throw new Error(\`Could not find monorepo package "\${request}"\`);
					}

					const { packageDirpath, packageJson } = packageMetadata;

					const relativeImportPath = request.replace(\`@-/\${packageSlug}\`, '.');
					const relativeFilePaths =
						resolve.exports(packageJson, relativeImportPath) ?? [];

					if (relativeFilePaths.length > 0) {
						return path.join(packageDirpath, relativeFilePaths[0]);
					}
				}
		`,
  },
  {
    files: ["dist/cjs/index.cjs", "dist/cjs/index.mjs"],
    from: "enumerable:!1",
    to: outdent`
			$&,
			// We set this property as enumerable so other packages can overwrite it if needed instead of erroring
			writable: true,
			configurable: true,
		`,
  },
];
