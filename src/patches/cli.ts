export default [
	// We can't create IPC servers on read-only file systems
  {
    files: ["dist/cli.cjs", "dist/cli.mjs"],
    from: ".listen(",
    to: ".listen.bind(",
  },
];
