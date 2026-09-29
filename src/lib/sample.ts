import sampleProjectText from "../../examples/sample-family.ftree?raw";
import { parseProject } from "./projectFile";
import type { FamilyTreeProject } from "../types";

/**
 * The bundled example family. It is compiled into the app rather than read
 * from disk, so "Explore the sample" works in an installed build, where the
 * `examples` folder does not exist.
 */
export function loadSampleProject(): FamilyTreeProject {
  return parseProject(sampleProjectText);
}
