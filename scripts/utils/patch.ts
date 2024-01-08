import fs from "node:fs";
import downl from "downl";
import { execa } from "execa";
import path from "pathe";
import { outdent } from "outdent";
import tmp from "tmp-promise";
import * as replaceInFile from "replace-in-file";
import escapeStringRegexp from "escape-string-regexp";

export async function generatePatch() {
  const temporaryDirectory = await tmp.dir();
  const temporarySourceDirpath = path.join(temporaryDirectory.path, "a");
  const temporaryPatchDirpath = path.join(temporaryDirectory.path, "b");

  const version = "4.7.0";
  await downl(
    `https://registry.npmjs.org/tsx/-/tsx-${version}.tgz`,
    temporarySourceDirpath,
    { extract: { strip: 1 } }
  );

  await fs.cpSync(temporarySourceDirpath, temporaryPatchDirpath, {
    recursive: true,
  });

  const replace = function (
    options: Parameters<(typeof replaceInFile)["replaceInFile"]>[0]
  ) {
    return (replaceInFile.default ?? replaceInFile).replaceInFileSync({
      ...options,
      files: [options.files]
        .flat()
        .map((file) => path.join(temporaryPatchDirpath, file)),
      from: [options.from]
        .flat()
        .map((file) =>
          typeof file === "string"
            ? new RegExp(escapeStringRegexp(file).replaceAll(/\s+/g, "\\s+"))
            : file
        ),
    });
  };

  replace({
    files: "package.json",
    from: ['"dependencies": {'],
    to: outdent`
		"dependencies": {
			"is-file-esm-ts": "^0.1.0",
			"tilde-imports": "^3.1.3",
			"glob-imports": "^3.0.0",
			"get-monorepo-root": "^1.2.0",
			"resolve.exports": "^2.0.2",
			"monorepo-packages": "^1.1.0",
	`,
  });

  replace({
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
	`,
  });

  replace({
    files: "dist/esm/index.cjs",
    from: /^/,
    to: outdent({ trimTrailingNewline: false })`
			const { createTildeImportExpander } = require('tilde-imports');
			const { isGlobSpecifier, createGlobfileManager } = require('glob-imports');
			const { getMonorepoDirpath } = require('get-monorepo-root');
			const { exports: resolveExports } = require('resolve.exports');
			const { getMonorepoPackages } = require('monorepo-packages');
			const { pathToFileURL, fileURLToPath } = require('node:url');

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
		`,
  });

  replace({
    files: ["dist/cjs/index.cjs"],
    from: /^/,
    to: outdent`
			const { isGlobSpecifier, createGlobfileManager } = require( 'glob-imports');
			const { createTildeImportExpander } = require( 'tilde-imports');
			const { getMonorepoDirpath } = require( 'get-monorepo-root');
			const { isFileEsmSync } = require( 'is-file-esm-ts');
			const { getMonorepoPackages } = require( 'monorepo-packages');
			const resolve = require('resolve.exports');

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
		`,
  });

  replace({
    files: ["dist/cjs/index.mjs"],
    from: /^/,
    to: outdent`
			import { isGlobSpecifier, createGlobfileManager } from 'glob-imports';
			import { createTildeImportExpander } from 'tilde-imports';
			import { getMonorepoDirpath } from 'get-monorepo-root';
			import { isFileEsmSync } from 'is-file-esm-ts';
			import { getMonorepoPackages } from 'monorepo-packages';
			import resolve from 'resolve.exports';

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
		`,
  });

  replace({
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
  });

  replace({
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
  });

	replace({
		files: ['dist/esm/index.mjs', 'dist/esm/index.cjs'],
		from: /=async function\((\w,\w,\w)\)\{/,
		to: outdent({ trimTrailingNewline: false })`
			=async function($1){
				const [url, context, defaultLoad] = [$1];

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
		`
	})

  replace({
    files: ["dist/esm/index.mjs", "dist/esm/index.cjs"],
    from: /=async function\((\w,\w,\w,\w)\)\{/,
    to: outdent({ trimTrailingNewline: false })`
		=async function($1){
			const [specifier, context, defaultResolve, recursiveCall] = [$1];
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
  });

  replace({
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
  });

  replace({
    files: ["dist/cjs/index.cjs", "dist/cjs/index.mjs"],
    from: "enumerable:!1",
    to: outdent`
		$&,
		// We set this property as enumerable so other packages can overwrite it if needed instead of erroring
		writable: true,
		configurable: true,
	`,
  });

  const { stdout } = await execa(
    "/usr/bin/git",
    [
      "-c",
      "core.safecrlf=false",
      "diff",
      "--src-prefix=a/",
      "--dst-prefix=b/",
      "--ignore-cr-at-eol",
      "--irreversible-delete",
      "--full-index",
      "--no-index",
      "--text",
      temporarySourceDirpath,
      temporaryPatchDirpath,
    ],
    {
      reject: false,
      env: {
        ...process.env,
        // These variables aim to ignore the global git config so we get predictable output
        // https://git-scm.com/docs/git#Documentation/git.txt-codeGITCONFIGNOSYSTEMcode
        GIT_CONFIG_NOSYSTEM: "1",
        HOME: "",
        XDG_CONFIG_HOME: "",
        USERPROFILE: "",
      },
      stripFinalNewline: false,
    }
  );

  function removeTrailingAndLeadingSlash(p: string) {
    if (p.startsWith("/") || p.endsWith("/")) {
      return p.replace(/^\/|\/$/g, "");
    }
    return p;
  }

  fs.mkdirSync("generated", { recursive: true });
  fs.writeFileSync(
    `generated/tsx@${version}.patch`,
    stdout
      .replace(
        new RegExp(
          `(a|b)(${escapeStringRegexp(
            `/${removeTrailingAndLeadingSlash(temporarySourceDirpath)}/`
          )})`,
          "g"
        ),
        "$1/"
      )
      .replace(
        new RegExp(
          `(a|b)${escapeStringRegexp(
            `/${removeTrailingAndLeadingSlash(temporaryPatchDirpath)}/`
          )}`,
          "g"
        ),
        "$1/"
      )
      .replace(
        new RegExp(escapeStringRegexp(`${temporarySourceDirpath}/`), "g"),
        ""
      )
      .replace(
        new RegExp(escapeStringRegexp(`${temporaryPatchDirpath}/`), "g"),
        ""
      )
      .replace(/\n\\ No newline at end of file\n$/, "\n")
  );
}
