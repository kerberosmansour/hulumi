export interface RulesetExpression {
  readonly expression: string;
  readonly source: "hulumi-helper" | "validated-consumer-input";
}

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS" | "HEAD";

const SAFE_LITERAL_REGEX = /^[A-Za-z0-9._~:/?#@!$&'()*+,;=%[\]-]+$/;

export function hasControlCharacters(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code < 32 || code === 127) {
      return true;
    }
  }
  return false;
}

export function validatedRulesetExpression(expression: string): RulesetExpression {
  const trimmed = expression.trim();
  if (trimmed.length === 0) {
    throw new Error("Ruleset expression must be non-empty");
  }
  if (hasControlCharacters(trimmed)) {
    throw new Error("Ruleset expression must not contain control characters");
  }
  return {
    expression: trimmed,
    source: "validated-consumer-input",
  };
}

export function pathStartsWith(pathPrefix: string): RulesetExpression {
  if (
    !pathPrefix.startsWith("/") ||
    pathPrefix.length < 2 ||
    !SAFE_LITERAL_REGEX.test(pathPrefix)
  ) {
    throw new Error(`pathPrefix "${pathPrefix}" must be an absolute safe URL path prefix`);
  }
  return {
    expression: `starts_with(http.request.uri.path, "${pathPrefix}")`,
    source: "hulumi-helper",
  };
}

export function methodIs(method: HttpMethod): RulesetExpression {
  return {
    expression: `http.request.method eq "${method}"`,
    source: "hulumi-helper",
  };
}

export function anyMethod(methods: readonly HttpMethod[]): RulesetExpression {
  if (methods.length === 0) {
    throw new Error("methods must contain at least one HTTP method");
  }
  return {
    expression: methods.map((method) => methodIs(method).expression).join(" or "),
    source: "hulumi-helper",
  };
}

export function andExpressions(...expressions: readonly RulesetExpression[]): RulesetExpression {
  if (expressions.length === 0) {
    throw new Error("andExpressions requires at least one expression");
  }
  return {
    expression: expressions.map((expr) => `(${expr.expression})`).join(" and "),
    source: expressions.every((expr) => expr.source === "hulumi-helper")
      ? "hulumi-helper"
      : "validated-consumer-input",
  };
}
