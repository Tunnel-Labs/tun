import { testSuite, expect } from 'manten';
import semver from 'semver';
import type { ExecaReturnValue } from 'execa';
import type { NodeApis } from '../../utils/tun';
import nodeSupports from '../../utils/node-supports';

export default testSuite(async ({ describe }, node: NodeApis) => {
	describe('Load CJS', ({ describe }) => {
		describe('.cjs extension', ({ describe }) => {
			function assertResults({ stdout, stderr }: ExecaReturnValue) {
				expect(stdout).toMatch('loaded cjs-ext-cjs/index.cjs');
				expect(stdout).toMatch('✔ has CJS context');
				expect(stdout).toMatch('✔ name in error');
				expect(stdout).toMatch('✔ sourcemaps');
				expect(stdout).toMatch('✔ has dynamic import');
				expect(stdout).toMatch('✔ resolves optional node prefix');
				expect(stdout).toMatch(
					semver.satisfies(node.version, nodeSupports.testRunner)
						? '✔ resolves required node prefix'
						: '✖ resolves required node prefix: Error'
				);

				expect(stderr).not.toMatch(/loader/i);
			}

			describe('full path', ({ test }) => {
				const importPath = './lib/cjs-ext-cjs/index.cjs';

				test('Load', async () => {
					const nodeProcess = await node.load(importPath);
					assertResults(nodeProcess);
				});

				test('Import', async () => {
					const nodeProcess = await node.import(importPath);
					assertResults(nodeProcess);
					expect(nodeProcess.stdout).toMatch('{"default":1234}');
				});

				test('TypeScript Import', async () => {
					const nodeProcess = await node.import(importPath, {
						typescript: true
					});
					assertResults(nodeProcess);
					expect(nodeProcess.stdout).toMatch('{"default":1234}');
				});

				test('Require', async () => {
					const nodeProcess = await node.require(importPath);
					assertResults(nodeProcess);
					expect(nodeProcess.stdout).toMatch('1234');
				});
			});

			describe('extensionless - should not work', ({ test }) => {
				const importPath = './lib/cjs-ext-cjs/index';

				test('Load', async () => {
					const nodeProcess = await node.load(importPath);
					expect(nodeProcess.stderr).toMatch('Cannot find module');
				});

				test('Import', async () => {
					const nodeProcess = await node.import(importPath);
					expect(nodeProcess.stderr).toMatch('Cannot find module');
				});

				test('Require', async () => {
					const nodeProcess = await node.require(importPath);
					expect(nodeProcess.stderr).toMatch('Cannot find module');
				});
			});

			describe('directory', ({ test }) => {
				const importPath = './lib/cjs-ext-cjs';

				test('Load', async () => {
					const nodeProcess = await node.load(importPath);
					expect(nodeProcess.stderr).toMatch('Cannot find module');
				});

				test('Import', async () => {
					const nodeProcess = await node.import(importPath);
					expect(nodeProcess.stderr).toMatch('Cannot find module');
				});

				test('Require', async () => {
					const nodeProcess = await node.require(importPath);
					expect(nodeProcess.stderr).toMatch('Cannot find module');
				});
			});
		});

		describe('.js extension', ({ describe }) => {
			function assertCjsResults({ stdout, stderr }: ExecaReturnValue) {
				expect(stdout).toMatch('loaded cjs-ext-js/index.js');
				expect(stdout).toMatch('✔ has CJS context');
				expect(stdout).toMatch('✔ name in error');
				expect(stdout).toMatch('✔ sourcemaps');
				expect(stdout).toMatch('✔ has dynamic import');
				expect(stdout).toMatch('✔ resolves optional node prefix');
				expect(stdout).toMatch(
					semver.satisfies(node.version, nodeSupports.testRunner)
						? '✔ resolves required node prefix'
						: '✖ resolves required node prefix: Error'
				);

				expect(stderr).not.toMatch(/loader/i);
			}

			function assertEsmResults({ stdout, stderr }: ExecaReturnValue) {
				expect(stdout).toMatch('loaded cjs-ext-js/index.js');
				expect(stdout).toMatch('✖ has CJS context');
				expect(stdout).toMatch('✔ name in error');
				expect(stdout).toMatch('✔ sourcemaps');
				expect(stdout).toMatch('✔ has dynamic import');
				expect(stderr).toBe('');
			}

			describe('full path', ({ test }) => {
				const importPath = './lib/cjs-ext-js/index.js';

				test('Load', async () => {
					const nodeProcess = await node.load(importPath);

					if (node.isCJS) {
						assertCjsResults(nodeProcess);
					} else {
						assertEsmResults(nodeProcess);
					}
				});

				test('Import', async () => {
					const nodeProcess = await node.import(importPath);

					if (node.isCJS) {
						assertCjsResults(nodeProcess);
						expect(nodeProcess.stdout).toMatch('{"default":1234}');
					} else {
						assertEsmResults(nodeProcess);
					}
				});

				test('Require', async () => {
					const nodeProcess = await node.require(importPath);
					assertCjsResults(nodeProcess);
					expect(nodeProcess.stdout).toMatch('1234');
				});
			});

			describe('extensionless', ({ test }) => {
				const importPath = './lib/cjs-ext-js/index';

				test('Load', async () => {
					const nodeProcess = await node.load(importPath);

					if (node.isCJS) {
						assertCjsResults(nodeProcess);
					} else {
						assertEsmResults(nodeProcess);
					}
				});

				test('Import', async () => {
					const nodeProcess = await node.import(importPath);

					if (node.isCJS) {
						assertCjsResults(nodeProcess);
						expect(nodeProcess.stdout).toMatch('{"default":1234}');
					} else {
						assertEsmResults(nodeProcess);
					}
				});

				test('Require', async () => {
					const nodeProcess = await node.require(importPath);
					assertCjsResults(nodeProcess);
					expect(nodeProcess.stdout).toMatch('1234');
				});
			});

			describe('directory', ({ test }) => {
				const importPath = './lib/cjs-ext-js';

				test('Load', async () => {
					const nodeProcess = await node.load(importPath);

					if (node.isCJS) {
						assertCjsResults(nodeProcess);
					} else {
						assertEsmResults(nodeProcess);
					}
				});

				test('Import', async () => {
					const nodeProcess = await node.import(importPath);

					if (node.isCJS) {
						assertCjsResults(nodeProcess);
						expect(nodeProcess.stdout).toMatch('{"default":1234}');
					} else {
						assertEsmResults(nodeProcess);
					}
				});

				test('Require', async () => {
					const nodeProcess = await node.require(importPath);
					assertCjsResults(nodeProcess);
					expect(nodeProcess.stdout).toMatch('1234');
				});
			});
		});
	});
});
