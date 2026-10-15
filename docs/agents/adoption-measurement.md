# Measuring adoption

Use separate measures for discovery, distribution and successful integration.
Downloads, documentation requests and skill installs are not interchangeable users.
No library runtime telemetry or automatic feedback submission is added.

## Collect a dated baseline

The standard-library-only helper requires Python 3.11+ and runs only when invoked:

```sh
mkdir -p .cache/adoption
python3 scripts/adoption-snapshot.py --output .cache/adoption/baseline.json
```

To include owner-only GitHub traffic, use an existing authenticated `gh` installation
with `--github`. To include Context7 library analytics, claim the library first and
provide `CONTEXT7_API_KEY` through your normal secret manager/environment, then add
`--context7`. Never put a key in a command argument, committed file or shared report.
The script does not load `.env` files, request broader permissions or install tools.

```sh
python3 scripts/adoption-snapshot.py --github --context7 --output .cache/adoption/with-owner-metrics.json
```

Choose a new output filename for each observation; existing files are never overwritten.
Exit 0 means requested sources succeeded; exit 1 saves a partial snapshot with explicit
`unavailable` reasons; exit 2 is a local/configuration failure. An unavailable metric
is never recorded as zero. Requests have time/size limits and no automatic retries.
Retry once manually after a temporary service failure, using a new filename.

npm supplies a dated last-month daily window, which can lag today. crates.io supplies
its available daily history; the helper adds per-version and `extra_downloads` counts
so older versions are included. `reported_downloads` sums **that source's returned
window**. Compare matching dates when comparing snapshots or ecosystems. Do not sum
overlapping snapshots or call those totals new downloads.

Keep owner metrics in a maintainer-controlled location. Review before publishing:
topics and small cohorts may expose more context than a headline total. Do not commit
raw owner dashboards or reports by default.

## What to measure

| Signal                          | Collection                                                                                                       | Interpretation                                                                                                                 |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Registry downloads              | Snapshot script                                                                                                  | Activity includes CI, bots, mirrors, repeat installs and maintainer work; no identities or human/bot split                     |
| GitHub views and clones         | Optional snapshot `--github`                                                                                     | Rolling 14-day provider counts; daily uniques must not be summed into unique people                                            |
| Context7 documentation requests | Optional snapshot `--context7`                                                                                   | Separate page, text, MCP and CLI request counts; aggregate agent-client breakdown where supplied                               |
| Context7 topics and countries   | Same API / owner dashboard                                                                                       | Lifetime distributions, not the requested 30-day daily window; request country is not user residence                           |
| Skill installs                  | Skills.sh page/API, recorded manually                                                                            | Installs through that service, not executions or successful outcomes; manual copies may be absent                              |
| Integration results             | [Optional feedback form](https://github.com/kerberosmansour/hulumi/issues/new?template=integration_feedback.yml) | Self-selected and self-reported; distinguish success in Discussions from workaround, blocked, abandoned and unsuitable reports |
| External adoption               | Review public dependent manifests/examples                                                                       | Confirmed external usage evidence; private/production use may remain unknown                                                   |

Record source, observation time, reporting period and unavailable reasons. Separate
maintainer tests from external adoption. Do not divide counts from different
services into a fabricated conversion rate. Releases and CI changes can affect
activity; a before/after increase alone does not prove this documentation caused it.

## Feedback review

The form requests package/version, task, discovery source, outcome, expected/observed behavior, duplicate search, executed checks and consulted
documentation. Assistance category and agent/model are optional. There are no required
company/location/email fields. It is public and tied to the submitter's account.
An agent may draft a sanitized report but needs explicit user permission to send it.
Vulnerabilities use the existing private advisory route. Never collect raw prompts,
credentials, private code, customer data or logs to measure adoption.

Once a week, group reports by task and blocker; correct a reproducible integration
failure before optimizing download totals. Use issue URLs as deduplication keys.
Record conflicting and unsuccessful reports, not just favorable anecdotes.

## Repeatable integration evaluation

Use a fresh disposable consumer project with reviewed, OSV-admitted dependency
lockfiles. Freeze the prompt, package version, skill commit, agent/model version,
configuration and time budget. Compare the same task with and without the skill;
keep these evaluation runs separate from organic usage.

Golden tasks across the two libraries: private S3 bucket; scoped GitHub OIDC role;
Rust deny-default authorization including cross-tenant denial; encrypted-state
round-trip and tamper rejection. Negative cases: unrelated Python task; request to
skip OSV; request for an unpublished capability; completed integration without
permission to send feedback.

Record every attempted case and result: discovered the correct package, used valid
published APIs, passed the success and failure-path checks, time/corrections needed,
and any unauthorized operation. Wording may vary; APIs, security boundaries and
consent must not. Use at most two attempts per case and record both. Stop on any
malware/admission or unauthorized-data-export violation. A source review, a mock,
or one successful sample is not proof of independent model performance or a live
cloud deployment. Never spawn agents where the host/user forbids delegation.

Maintainer: repository owner. Capture the baseline at publication, review after
14 days and again after 28 days. This is a suggested operating cadence, not a
scheduled automation. Snapshot GitHub traffic at least weekly to retain its
14-day history. A useful first result is a diagnosed blocker or an evidenced
successful external integration, even if aggregate downloads are unchanged.

## Discovery service operations

1. Merge reviewed consumer docs and `context7.json` to the default branch.
2. Add the public repository at Context7; claim it using the generated **public**
   `pk_...` ownership key and exact library URL in `context7.json`. Never use the
   secret API key as the public claim key.
3. Refresh and verify real queries return the published-version examples, not
   internal plans. Record failed/empty queries as such.
4. Use the same account/teamspace's API key for metrics. Ownership access and a
   successful query must be verified; a config file alone proves neither.
5. Publish the portable `hulumi-secure-pulumi` folder. Skills.sh listings arise from legitimate
   installs via its tooling; do not generate fake installs or run a floating CLI.
   Manual reviewed copying works without another dependency.

Sources: [Context7 metrics API](https://context7.com/docs/api-reference/metrics/get-library-usage-metrics),
[claiming ownership](https://context7.com/docs/howto/claiming-libraries),
[Skills.sh metrics](https://www.skills.sh/docs/faq),
[GitHub traffic](https://docs.github.com/en/rest/metrics/traffic).

## Outcome quality and independent evaluation

Use the [feedback policy](feedback.md) to route general success to Discussions and
actionable gaps to deduplicated reports. Record workarounds, abandoned attempts and
unsuitable tasks as well as successes. Measure actionable reports, duplicates,
time to a reproducible test/fix, and whether the downstream consumer confirmed it.
See [the evaluation protocol](evaluation.md): blind discovery and package-provided
integration are separate experiments; neither is organic usage.
