import { isAbsolute, resolve } from "node:path";
import { PROJECT_EXTENSION } from "../../shared/desktop";

/**
 * The project a launch asked to open, if any.
 *
 * A relative path is resolved against `cwd`. For a second launch that is the
 * directory *that* process was started in, which is not this process's own
 * working directory - resolving it against the wrong one opened the wrong file
 * or none.
 *
 * Runtime and Chromium switches (anything starting with `-`) are skipped.
 */
export function projectPathFromArgv(argv: readonly string[], cwd: string): string | undefined {
  const argument = argv.slice(1).find((value) => !value.startsWith("-") && value.toLowerCase().endsWith(`.${PROJECT_EXTENSION}`));
  if (!argument) return undefined;
  return isAbsolute(argument) ? argument : resolve(cwd, argument);
}
