// Regression: M-DETECTIVEREUSE SecurityHub arm.
//
// When `useExistingSecurityHubAccount === true`, AccountFoundation imports
// the account-wide hub via `Account.get`, but the CIS + NIST
// StandardsSubscription resources it creates are NOT imported — they are
// net-new resources whose default destroy behaviour calls
// BatchDisableStandards. On `pulumi destroy` of the reused stack, that
// would unsubscribe CIS/NIST account-wide while leaving Security Hub
// itself enabled (it was imported, so it isn't destroyed) — a silent
// monitoring downgrade.
//
// Fix: subscriptions created on the reuse path carry retainOnDelete=true
// so destroy leaves them in place. Non-reuse deploys retain the original
// delete semantics.
//
// `retainOnDelete` lives on CustomResourceOptions, not resource inputs,
// so vitest's setup.ts mock — which only captures `MockResourceArgs` —
// cannot see it. `pulumi.runtime.registerStackTransformation` also
// requires an initialized stack resource which the test runtime does
// not have. We observe the option by wrapping the
// `aws.securityhub.StandardsSubscription` constructor and capturing the
// `opts.retainOnDelete` value before delegating to the real
// constructor — purely test-side instrumentation, the production code
// path is unchanged.

import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

import { AccountFoundation } from "../src/aws/account-foundation";
import { resetRegistrations, valueOf, settlePulumi } from "./setup";

const IAC_ROLE_ARN = "arn:aws:iam::111122223333:role/hulumi-sandbox-iac-role";

const retainObservations = new Map<string, boolean | undefined>();

// Wrap the StandardsSubscription constructor to record opts.retainOnDelete
// per resource name. We restore the original constructor in afterAll so
// the instrumentation is scoped to this file. The aws.securityhub
// namespace exports lazy-load properties (getter-only), so we use
// Object.defineProperty to redefine the property as a writable value
// before substituting the constructor.
const OriginalStandardsSubscription = aws.securityhub.StandardsSubscription;
class InstrumentedStandardsSubscription extends OriginalStandardsSubscription {
  constructor(
    name: string,
    args: aws.securityhub.StandardsSubscriptionArgs,
    opts?: pulumi.CustomResourceOptions,
  ) {
    retainObservations.set(name, opts?.retainOnDelete);
    super(name, args, opts);
  }
}

beforeAll(() => {
  Object.defineProperty(aws.securityhub, "StandardsSubscription", {
    value: InstrumentedStandardsSubscription,
    writable: true,
    configurable: true,
  });
});

afterAll(() => {
  Object.defineProperty(aws.securityhub, "StandardsSubscription", {
    value: OriginalStandardsSubscription,
    writable: true,
    configurable: true,
  });
});

describe("M-DETECTIVEREUSE SecurityHub arm — reuse retains standards on destroy", () => {
  beforeEach(() => {
    resetRegistrations();
    retainObservations.clear();
  });

  it("reuse path (startup-hardened): CIS + NIST StandardsSubscription carry retainOnDelete=true", async () => {
    const af = new AccountFoundation("af-sh-reuse-retain", {
      tier: "startup-hardened",
      iacRoleArn: IAC_ROLE_ARN,
      orgAccountIds: ["111111111111"],
      useExistingSecurityHubAccount: true,
    });
    await valueOf(af.securityHubHubArn);
    await settlePulumi();

    expect(retainObservations.size).toBe(2);
    for (const [name, retain] of retainObservations) {
      expect(retain, `subscription ${name} must carry retainOnDelete=true on reuse path`).toBe(
        true,
      );
    }
  });

  it("reuse path (sandbox): CIS StandardsSubscription carries retainOnDelete=true", async () => {
    const af = new AccountFoundation("af-sh-reuse-sandbox", {
      tier: "sandbox",
      iacRoleArn: IAC_ROLE_ARN,
      useExistingSecurityHubAccount: true,
    });
    await valueOf(af.securityHubHubArn);
    await settlePulumi();

    expect(retainObservations.size).toBe(1);
    for (const [name, retain] of retainObservations) {
      expect(retain, `subscription ${name} must carry retainOnDelete=true on reuse path`).toBe(
        true,
      );
    }
  });

  it("non-reuse path: subscriptions retain default delete semantics (retainOnDelete falsy)", async () => {
    const af = new AccountFoundation("af-sh-netnew", {
      tier: "startup-hardened",
      iacRoleArn: IAC_ROLE_ARN,
      orgAccountIds: ["111111111111"],
    });
    await valueOf(af.securityHubHubArn);
    await settlePulumi();

    expect(retainObservations.size).toBe(2);
    for (const [name, retain] of retainObservations) {
      expect(
        retain === undefined || retain === false,
        `subscription ${name} must not opt into retainOnDelete on non-reuse path (got ${String(
          retain,
        )})`,
      ).toBe(true);
    }
  });
});
