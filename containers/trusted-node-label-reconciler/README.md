# Trusted node-label reconciler image

This recipe packages the existing `@hulumi/k8s-baseline` controller without
adding packages inside the image. The workflow first runs the repository's
pinned dependency admission gate, installs the admitted lock with lifecycle
scripts disabled, builds the workspace, and creates a production-only portable
directory with `pnpm deploy`. The portable directory is the Docker build
context.

The runtime base is Microsoft Azure Linux Node 24 at the exact multi-platform
index digest recorded in the Dockerfile. Both base platforms were inventoried
with official OSV-Scanner 2.7.0 before admission. The final linux/amd64 and
linux/arm64 archives must each pass `scripts/osv-image-gate.py` before the
registry job can publish them. The gate keeps RPM metadata and an embedded
CycloneDX inventory of the exact deployed npm graph visible,
requires a non-empty complete inventory, blocks every advisory and `MAL-*`
identifier, and fails closed on scanner, network, parsing or platform errors.

The image has no shell-time setup step and starts as numeric UID/GID
`65532:65532`. The Pulumi component adds the matching pod security context,
read-only root filesystem, dropped capabilities, RuntimeDefault seccomp and an
explicit writable `/tmp` volume.

Only the manually dispatched main-branch image workflow may publish. It emits
an immutable public GHCR digest, per-platform OSV reports, the embedded
CycloneDX SBOM and GitHub build provenance, then verifies an anonymous pull and
the exact signer workflow. GitHub exposes initial package visibility through
[Package settings](https://docs.github.com/packages/learn-github-packages/configuring-a-packages-access-control-and-visibility)
rather than the Packages REST API. The first push therefore
links the package to this repository through its OCI source label and then
fails closed until an authorized maintainer makes that package public. Rerun
the same workflow after that one-time change; every later run verifies public
visibility instead of attempting an unsupported API mutation.
The AWS qualification workflow receives only that exact digest and has no
registry write permission.
