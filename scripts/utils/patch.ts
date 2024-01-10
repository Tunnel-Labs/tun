import fs from "node:fs";
import downl from "downl";
import { execa } from "execa";
import path from "pathe";
import { outdent } from "outdent";
import tmp from "tmp-promise";
import * as replaceInFile from "replace-in-file";
import escapeStringRegexp from "escape-string-regexp";
import cjsLoaderPatches from "../../src/patches/cjs-loader.js";
import esmLoaderPatches from "../../src/patches/esm-loader.js";
import cliPatches from "../../src/patches/cli.js";

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
			"is-file-esm-ts": "^0.1.6",
			"tilde-imports": "^3.1.3",
			"glob-imports": "^3.0.0",
			"get-monorepo-root": "^1.2.0",
			"resolve.exports": "^2.0.2",
			"monorepo-packages": "^1.1.0",
	`,
  });

  cjsLoaderPatches.map((patch) => replace(patch));
  esmLoaderPatches.map((patch) => replace(patch));
  cliPatches.map((patch) => replace(patch));

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
