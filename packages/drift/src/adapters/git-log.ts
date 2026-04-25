// GitLogAdapter — argv-based git log over Pulumi program files
// touching the resource. simple-git wraps the git CLI through argv
// parameters; URNs and other inputs are NEVER interpolated into a
// shell command string (S3).
//
// E5 (shallow-clone guard): if the working copy is a shallow clone,
// `available()` returns false and the classifier degrades to
// `Unknown / low` with a remediation hint.

import type { SimpleGit } from "simple-git";

import type { AdapterSignal, DriftAdapter } from "../types";
import { validateUrn } from "../urn-sanitize";

export interface GitLogAdapterArgs {
  /** Injectable simple-git instance so tests can stub. */
  git: SimpleGit;
  /** Path globs to scan, relative to the repo root. */
  paths: string[];
}

export class GitLogAdapter implements DriftAdapter {
  constructor(private readonly args: GitLogAdapterArgs) {}

  name(): string {
    return "GitLog";
  }

  async available(): Promise<boolean> {
    try {
      const isRepo = await this.args.git.checkIsRepo();
      if (!isRepo) return false;
      // Shallow-clone guard (E5): a `git clone --depth=1` working tree
      // has only one commit; we can't see prior IaC commits.
      // simple-git exposes `revparse('--is-shallow-repository')`.
      const shallowFlag = (await this.args.git.revparse(["--is-shallow-repository"])).trim();
      return shallowFlag !== "true";
    } catch {
      return false;
    }
  }

  async signal(
    _stack: string,
    resource: string,
    window?: { before: string; after: string },
  ): Promise<AdapterSignal> {
    try {
      validateUrn(resource);
    } catch (err) {
      return {
        detected: false,
        ok: false,
        data: {
          error: err instanceof Error ? err.message : String(err),
          rejected: "unsafe URN — refused before reaching git CLI",
        },
      };
    }
    if (!(await this.available())) {
      return {
        detected: false,
        ok: false,
        data: {
          reason: "shallow-clone or non-repo working tree",
          remediation: "git fetch --unshallow",
        },
      };
    }
    const before = window?.before;
    const after = window?.after;
    try {
      const opts: string[] = ["--", ...this.args.paths];
      if (before) opts.unshift(`--until=${before}`);
      if (after) opts.unshift(`--since=${after}`);
      // simple-git's .log accepts an array of options OR an object;
      // we use the array form so each token is argv (no shell expansion).
      const log = await this.args.git.log(opts);
      const detected = log.total > 0;
      return {
        detected,
        ok: true,
        data: {
          commitCount: log.total,
          latest: log.latest?.hash ?? null,
          paths: this.args.paths,
        },
      };
    } catch (err) {
      return {
        detected: false,
        ok: false,
        data: { error: err instanceof Error ? err.message : String(err) },
      };
    }
  }
}
