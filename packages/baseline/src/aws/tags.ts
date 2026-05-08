export const AWS_TAG_VALUE_MAX_LENGTH = 256;

const CONTROLS_TAG_KEY = "hulumi:controls";
const CONTROLS_SEPARATOR = "+";

export function buildControlsTags(controlIds: readonly string[]): Record<string, string> {
  const tags: Record<string, string> = {};
  let chunk: string[] = [];
  let index = 0;

  for (const controlId of controlIds) {
    if (controlId.includes(CONTROLS_SEPARATOR)) {
      throw new Error(`Control ID must not contain '${CONTROLS_SEPARATOR}': ${controlId}`);
    }

    const next = [...chunk, controlId];
    const nextValue = next.join(CONTROLS_SEPARATOR);
    if (nextValue.length <= AWS_TAG_VALUE_MAX_LENGTH) {
      chunk = next;
      continue;
    }

    if (chunk.length === 0) {
      throw new Error(
        `Control ID exceeds AWS tag value length (${AWS_TAG_VALUE_MAX_LENGTH}): ${controlId}`,
      );
    }

    const tagKey = index === 0 ? CONTROLS_TAG_KEY : `${CONTROLS_TAG_KEY}:${String(index)}`;
    tags[tagKey] = chunk.join(CONTROLS_SEPARATOR);
    index += 1;
    chunk = [controlId];
  }

  if (chunk.length > 0) {
    const tagKey = index === 0 ? CONTROLS_TAG_KEY : `${CONTROLS_TAG_KEY}:${String(index)}`;
    tags[tagKey] = chunk.join(CONTROLS_SEPARATOR);
  }

  return tags;
}
