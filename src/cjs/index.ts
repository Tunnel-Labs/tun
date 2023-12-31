import path from 'path';
import fs from 'fs';
import Module from 'module';
import {
	getTsconfig,
	parseTsconfig,
	createPathsMatcher,
	createFilesMatcher
} from 'get-tsconfig';
import type { TransformOptions } from 'esbuild';
// @ts-expect-error: missing types
import { isGlobSpecifier, createGlobfileManager } from 'glob-imports';
import { createTildeImportExpander } from 'tilde-imports';
import { getMonorepoDirpath } from 'get-monorepo-root';
import { installSourceMapSupport } from '../source-map';
import { transformSync, transformDynamicImport } from '../utils/transform';
import { resolveTsPath } from '../utils/resolve-ts-path';
import { nodeSupportsImport, supportsNodePrefix } from '../utils/node-features';
import { isFileEsmSync } from 'is-file-esm-ts';
import { getMonorepoPackages } from 'monorepo-packages';
import resolve from 'resolve.exports';

const isRelativePathPattern = /^\.{1,2}\//;
const isTsFilePatten = /\.[cm]?tun?$/;
const nodeModulesPath = `${path.sep}node_modules${path.sep}`;

const tsconfig = process.env.ESBK_TSCONFIG_PATH
	? {
			path: path.resolve(process.env.ESBK_TSCONFIG_PATH),
			config: parseTsconfig(process.env.ESBK_TSCONFIG_PATH)
	  }
	: getTsconfig();

const fileMatcher = tsconfig && createFilesMatcher(tsconfig);
const tsconfigPathsMatcher = tsconfig && createPathsMatcher(tsconfig);

const applySourceMap = installSourceMapSupport();

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

const extensions = Module._extensions;
const defaultLoader = extensions['.js'];

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

const transformer = (module: Module, filePath: string) => {
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

	/**
	 * For tracking dependencies in watch mode
	 */
	// if (process.send) {
	// 	process.send({
	// 		type: 'dependency',
	// 		path: filePath,
	// 	});
	// }

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

	if (filePath.endsWith('.cjs') && nodeSupportsImport) {
		const transformed = transformDynamicImport(filePath, code);
		if (transformed) {
			code = applySourceMap(transformed, filePath);
		}
	} else {
		const matched = fileMatcher?.(filePath) as Exclude<
			TransformOptions['tsconfigRaw'],
			string
		>;
		const transformed = transformSync(code, filePath, {
			tsconfigRaw: {
				...matched,
				compilerOptions: {
					...matched?.compilerOptions,
					experimentalDecorators: true
				}
			}
		});

		code = applySourceMap(transformed, filePath);
	}

	module._compile(code, filePath);
};

[
	/**
	 * Handles .cjs, .cts, .mts & any explicitly specified extension that doesn't match any loaders
	 *
	 * Any file requested with an explicit extension will be loaded using the .js loader:
	 * https://github.com/nodejs/node/blob/e339e9c5d71b72fd09e6abd38b10678e0c592ae7/lib/internal/modules/cjs/loader.js#L430
	 */
	'.js',

	/**
	 * Loaders for implicitly resolvable extensions
	 * https://github.com/nodejs/node/blob/v12.16.0/lib/internal/modules/cjs/loader.js#L1166
	 */
	'.ts',
	'.tsx',
	'.jsx'
].forEach((extension) => {
	extensions[extension] = transformer;
});

/**
 * Loaders for explicitly resolvable extensions
 * (basically just .mjs because CJS loader has a special handler for it)
 *
 * Loaders for extensions .cjs, .cts, & .mts don't need to be
 * registered because they're explicitly specified and unknown
 * extensions (incl .cjs) fallsback to using the '.js' loader:
 * https://github.com/nodejs/node/blob/v18.4.0/lib/internal/modules/cjs/loader.js#L430
 *
 * That said, it's actually ".js" and ".mjs" that get special treatment
 * rather than ".cjs" (it might as well be ".random-ext")
 */
Object.defineProperty(extensions, '.mjs', {
	value: transformer,

	// We set this property as enumerable so other packages can overwrite it if needed instead of erroring
	writable: true,
	configurable: true,

	// Prevent Object.keys from detecting these extensions
	// when CJS loader iterates over the possible extensions
	enumerable: false
});

const defaultResolveFilename = Module._resolveFilename.bind(Module);

// eslint-disable-next-line complexity
Module._resolveFilename = (request, parent, isMain, options) => {
	// Add support for "node:" protocol
	// Added in v12.20.0
	// https://nodejs.org/api/esm.html#esm_node_imports
	if (!supportsNodePrefix && request.startsWith('node:')) {
		request = request.slice(5);
	}

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
		const packageSlug = request.match(/@-\/([^/]+)/)?.[1];
		if (packageSlug === undefined) {
			throw new Error(
				`Could not extract monorepo package slug from "${request}"`
			);
		}

		const packageMetadata = monorepoPackages[`@-/${packageSlug}`];
		if (packageMetadata === undefined) {
			throw new Error(`Could not find monorepo package "${request}"`);
		}

		const { packageDirpath, packageJson } = packageMetadata;

		const relativeImportPath = request.replace(`@-/${packageSlug}`, '.');
		const relativeFilePaths =
			resolve.exports(packageJson, relativeImportPath) ?? [];

		if (relativeFilePaths.length > 0) {
			return path.join(packageDirpath, relativeFilePaths[0] as string);
		}
	}

	if (
		tsconfigPathsMatcher &&
		// bare specifier
		!isRelativePathPattern.test(request) &&
		// Dependency paths should not be resolved using tsconfig.json
		!parent?.filename?.includes(nodeModulesPath)
	) {
		const possiblePaths = tsconfigPathsMatcher(request);

		for (const possiblePath of possiblePaths) {
			const tsFilename = resolveTsFilename(
				possiblePath,
				parent,
				isMain,
				options
			);
			if (tsFilename) {
				return tsFilename;
			}

			try {
				return defaultResolveFilename(possiblePath, parent, isMain, options);
			} catch {}
		}
	}

	const tsFilename = resolveTsFilename(request, parent, isMain, options);
	if (tsFilename) {
		return tsFilename;
	}

	return defaultResolveFilename(request, parent, isMain, options);
};

type NodeError = Error & {
	code: string;
};

/**
 * Typescript gives .ts, .cts, or .mts priority over actual .js, .cjs, or .mjs extensions
 */
const resolveTsFilename = (
	request: string,
	parent: Module.Parent,
	isMain: boolean,
	options?: Record<PropertyKey, unknown>
) => {
	const tsPath = resolveTsPath(request);

	if (parent?.filename && isTsFilePatten.test(parent.filename) && tsPath) {
		try {
			return defaultResolveFilename(tsPath[0], parent, isMain, options);
		} catch (error) {
			const { code } = error as NodeError;
			if (
				code !== 'MODULE_NOT_FOUND' &&
				code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED'
			) {
				throw error;
			}
		}
	}
};
