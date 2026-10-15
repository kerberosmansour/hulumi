# Lessons: GitHub OIDC subject-template binding M1

- A custom GitHub OIDC subject template replaces the complete subject shape, so an apparently harmless omission removes authorization context rather than inheriting a default.
- Requiring the load-bearing subset preserves the customization interface while keeping repository, reusable-workflow, and environment identity available to cloud trust policies.
- Component ancestry is not evidence that a child resource is safe; mandatory preview rules must inspect the child's actual inputs.
- Runtime and preview validation need the same fail-closed shape checks because Pulumi policy inputs can be missing or malformed independently of TypeScript types.
- Literal string checks are sufficient for the fixed required-key set and avoid dynamic regular-expression audit noise.
