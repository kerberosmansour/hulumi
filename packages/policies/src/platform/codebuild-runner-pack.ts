import type {
  PolicyResource,
  ResourceValidationArgs,
  ResourceValidationPolicy,
  StackValidationPolicy,
} from "@pulumi/policy";
import { runtime } from "@pulumi/pulumi";
import type { PackMetadata } from "../metadata";
import { matchSuppression, type Suppression } from "../aws/suppressions";

export const CB_RUNNER_1_RULE_ID = "CB_RUNNER_1_PRIVILEGED";
export const CB_RUNNER_2_RULE_ID = "CB_RUNNER_2_ROLE_AUTHORITY";
export const CB_RUNNER_3_RULE_ID = "CB_RUNNER_3_VPC";
const PROJECT = "aws:codebuild/project:Project";
type Dict = Record<string, unknown>;
const object = (v: unknown): Dict | undefined =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Dict) : undefined;
interface RuleConfig {
  suppressions?: Array<Suppression & { owner?: string }>;
}
const configSchema = {
  properties: {
    suppressions: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          ruleId: { type: "string" as const },
          urnScope: { type: "string" as const },
          reason: { type: "string" as const },
          expiresAt: { type: "string" as const },
          owner: { type: "string" as const },
        },
      },
    },
  },
};
function suppressed(id: string, urn: string, config: RuleConfig): boolean {
  if (!Array.isArray(config?.suppressions)) return false;
  return config.suppressions.some((s) => {
    if (
      !object(s) ||
      s.ruleId !== id ||
      s.urnScope !== urn ||
      /[*?]/.test(urn) ||
      typeof s.reason !== "string" ||
      s.reason.trim().length === 0 ||
      typeof s.owner !== "string" ||
      s.owner.trim().length === 0 ||
      typeof s.expiresAt !== "string" ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(s.expiresAt)
    )
      return false;
    const date = new Date(s.expiresAt);
    const canonical = s.expiresAt.includes(".") ? s.expiresAt : s.expiresAt.replace("Z", ".000Z");
    if (
      !Number.isFinite(date.getTime()) ||
      date.toISOString() !== canonical ||
      date.getTime() <= Date.now()
    )
      return false;
    return matchSuppression(id, urn, [s]).suppressed;
  });
}
function violation(
  args: ResourceValidationArgs,
  id: string,
  report: (s: string) => void,
  message: string,
): void {
  if (!suppressed(id, args.urn, args.getConfig<RuleConfig>())) report(`${id}: ${message}`);
}
/** Require an explicit exception for privileged runner containers. */
export const codeBuildRunnerPrivileged: ResourceValidationPolicy = {
  name: CB_RUNNER_1_RULE_ID,
  description: "Privileged CodeBuild requires a resource-specific reviewed exception.",
  enforcementLevel: "mandatory",
  configSchema,
  validateResource(args, report) {
    if (args.type !== PROJECT) return;
    let safe = false;
    try {
      safe = object(args.props.environment)?.privilegedMode === false;
    } catch {
      /* Unknown preview input is not evidence of safety. */
    }
    if (!safe)
      violation(
        args,
        CB_RUNNER_1_RULE_ID,
        report,
        "runner privileged mode is enabled or cannot be proven false",
      );
  },
};
/** Subnet IDs do not establish network isolation; require review for every VPC opt-in. */
export const codeBuildRunnerNetwork: ResourceValidationPolicy = {
  name: CB_RUNNER_3_RULE_ID,
  description:
    "VPC-connected runners require explicit network review, including production subnet exposure.",
  enforcementLevel: "mandatory",
  configSchema,
  validateResource(args, report) {
    if (args.type !== PROJECT) return;
    let attachedOrUnknown = true;
    try {
      attachedOrUnknown = args.props.vpcConfig !== undefined && args.props.vpcConfig !== null;
    } catch {
      /* Unknown preview input requires review. */
    }
    if (attachedOrUnknown)
      violation(
        args,
        CB_RUNNER_3_RULE_ID,
        report,
        "runner has VPC attachment; isolated routes and production reachability require explicit review",
      );
  },
};
const strings = (v: unknown): string[] | undefined =>
  typeof v === "string"
    ? [v]
    : Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "string")
      ? (v as string[])
      : undefined;
function policyAllowsOnlyOwnLogs(
  raw: unknown,
  account: string,
  region: string,
  logGroup: string,
): boolean {
  if (typeof raw !== "string" || raw.length > 262144) return false;
  let doc: Dict | undefined;
  try {
    doc = object(JSON.parse(raw));
  } catch {
    return false;
  }
  if (!doc) return false;
  const statements = Array.isArray(doc.Statement)
    ? doc.Statement
    : object(doc.Statement)
      ? [doc.Statement]
      : [];
  if (statements.length < 1 || statements.length > 1000) return false;
  let allow = false;
  for (const value of statements) {
    const s = object(value);
    if (!s) return false;
    if (s.Effect === "Deny") continue;
    if (
      s.Effect !== "Allow" ||
      s.NotAction !== undefined ||
      s.NotResource !== undefined ||
      s.Principal !== undefined ||
      s.NotPrincipal !== undefined
    )
      return false;
    const actions = strings(s.Action),
      resources = strings(s.Resource);
    if (
      !actions ||
      !resources ||
      !actions.every((a) =>
        ["logs:createlogstream", "logs:describelogstreams", "logs:putlogevents"].includes(
          a.toLowerCase(),
        ),
      )
    )
      return false;
    if (
      !resources.every((r) => {
        const match = /^arn:aws:logs:([a-z0-9-]+):(\d{12}):log-group:(.+):\*$/.exec(r);
        return (
          match !== null &&
          match[1] === region &&
          match[2] === account &&
          match[3] === logGroup &&
          !/[*?]/.test(match[3])
        );
      })
    )
      return false;
    allow = true;
  }
  return allow;
}
function sameProvider(a: PolicyResource, b: PolicyResource): boolean {
  return (
    a.provider?.type === "pulumi:providers:aws" &&
    b.provider?.type === "pulumi:providers:aws" &&
    typeof a.provider.urn === "string" &&
    a.provider.urn.length > 0 &&
    a.provider.urn === b.provider.urn
  );
}
function targetsRoleOrUnknown(value: unknown, roleName: string): boolean {
  return typeof value !== "string" || value === runtime.unknownValue || value === roleName;
}
function roleResources(resources: PolicyResource[], roleName: string): PolicyResource[] {
  return resources.filter(
    (r) =>
      r.type === "aws:iam/rolePolicy:RolePolicy" && targetsRoleOrUnknown(r.props.role, roleName),
  );
}
/** Inspect the project-associated role and every supplied permission edge. */
export const codeBuildRunnerRoleBoundary: StackValidationPolicy = {
  name: CB_RUNNER_2_RULE_ID,
  description:
    "Runner roles must have inspectable own-log-only permissions; additional authority requires explicit review.",
  enforcementLevel: "mandatory",
  configSchema,
  validateStack(args, report) {
    for (const project of args.resources.filter((r) => r.type === PROJECT)) {
      try {
        if (suppressed(CB_RUNNER_2_RULE_ID, project.urn, args.getConfig<RuleConfig>())) continue;
        const projectArn =
          typeof project.props.arn === "string"
            ? /^arn:aws:codebuild:([a-z0-9-]+):(\d{12}):project\/[A-Za-z0-9_-]+$/.exec(
                project.props.arn,
              )
            : null;
        const roleArn =
          typeof project.props.serviceRole === "string"
            ? /^arn:aws:iam::(\d{12}):role\/(?:[A-Za-z0-9+=,.@_-]+\/)*([A-Za-z0-9+=,.@_-]+)$/.exec(
                project.props.serviceRole,
              )
            : null;
        const logGroup = object(object(project.props.logsConfig)?.cloudwatchLogs)?.groupName;
        const role =
          roleArn === null
            ? undefined
            : args.resources.find(
                (r) =>
                  r.type === "aws:iam/role:Role" &&
                  r.props.arn === project.props.serviceRole &&
                  r.props.name === roleArn[2] &&
                  sameProvider(project, r),
              );
        let safe =
          roleArn !== null &&
          projectArn !== null &&
          projectArn[2] === roleArn[1] &&
          role !== undefined &&
          typeof logGroup === "string" &&
          logGroup.length > 0;
        if (safe && role && roleArn && projectArn && typeof logGroup === "string") {
          if (
            role.props.managedPolicyArns !== undefined &&
            (!Array.isArray(role.props.managedPolicyArns) ||
              role.props.managedPolicyArns.length > 0)
          )
            safe = false;
          const inline = role.props.inlinePolicies;
          if (
            inline !== undefined &&
            (!Array.isArray(inline) ||
              inline.some(
                (p) =>
                  !policyAllowsOnlyOwnLogs(object(p)?.policy, roleArn[1], projectArn[1], logGroup),
              ))
          )
            safe = false;
          const policies = roleResources(args.resources, roleArn[2]);
          if (policies.length === 0 && (!Array.isArray(inline) || inline.length === 0))
            safe = false;
          if (
            policies.some(
              (p) =>
                !sameProvider(project, p) ||
                !policyAllowsOnlyOwnLogs(p.props.policy, roleArn[1], projectArn[1], logGroup),
            )
          )
            safe = false;
          if (
            args.resources.some(
              (r) =>
                (r.type ===
                  "aws:iam/rolePolicyAttachmentsExclusive:RolePolicyAttachmentsExclusive" &&
                  targetsRoleOrUnknown(r.props.roleName, roleArn[2]) &&
                  (!Array.isArray(r.props.policyArns) || r.props.policyArns.length > 0)) ||
                (r.type === "aws:iam/rolePolicyAttachment:RolePolicyAttachment" &&
                  targetsRoleOrUnknown(r.props.role, roleArn[2])) ||
                (r.type === "aws:iam/policyAttachment:PolicyAttachment" &&
                  r.props.roles !== undefined &&
                  (!Array.isArray(r.props.roles) ||
                    r.props.roles.some((value: unknown) =>
                      targetsRoleOrUnknown(value, roleArn[2]),
                    ))),
            )
          )
            safe = false;
        }
        if (!safe)
          report(
            `${CB_RUNNER_2_RULE_ID}: runner role is external, unknown or grants authority beyond its own log streams`,
            project.urn,
          );
      } catch {
        // CrossGuard otherwise converts UnknownValueError into an advisory and aborts this handler.
        // Report this project mandatorily and keep inspecting subsequent projects.
        report(
          `${CB_RUNNER_2_RULE_ID}: runner authority cannot be proven from preview values`,
          project.urn,
        );
      }
    }
  },
};
export const hulumiCodeBuildRunnerPackMetadata: PackMetadata = {
  id: "hulumi-codebuild-runner",
  title: "CodeBuild runner boundaries",
  framework: "Hulumi",
  frameworkVersion: "1",
  severity: "high",
  rules: [
    [CB_RUNNER_1_RULE_ID, "Explicit privilege review"],
    [CB_RUNNER_2_RULE_ID, "Own-log-only role"],
    [CB_RUNNER_3_RULE_ID, "Explicit VPC review"],
  ].map(([id, title]) => ({
    id,
    title,
    description: title,
    severity: "high",
    enforcement: "mandatory",
    frameworkIds: ["NIST-800-53:AC-6"],
    docsUrl:
      "https://github.com/kerberosmansour/hulumi/blob/main/docs/components/codebuild-runner-policy-pack.md",
  })),
};
