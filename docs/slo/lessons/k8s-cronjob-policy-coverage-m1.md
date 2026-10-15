# Lessons: Kubernetes CronJob policy coverage M1

- A bounded type allow-list is insufficient if every listed type is passed through one assumed property path. Resource kind and property path form one security decision.
- Explicit schema branches are easier to review than a recursive object search and prevent attacker-controlled sibling objects from winning extraction.
- A safe decoy fixture is useful evidence that a policy reads the authoritative path rather than merely finding any PodSpec-shaped object.
- Reusing already admitted workspace dependencies avoids an unnecessary install while preserving the OSV and provenance boundary.
