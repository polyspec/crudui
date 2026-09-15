const commitPattern = /^[0-9a-f]{40}$/;
const digestPattern = /^[0-9a-f]{64}$/;

/**
 * Reject a value that is not one complete source identity: the checked-out commit and the
 * SHA-256 digest of the uncommitted changes, or null when there are none.
 */
export function assertSourceIdentity(value, message = 'Expected a source identity') {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || JSON.stringify(Object.keys(value)) !== JSON.stringify(['commit', 'changes'])
      || !commitPattern.test(value.commit ?? '')
      || !(value.changes === null || digestPattern.test(value.changes))) {
    throw new Error(message);
  }
  return value;
}

/** Return true when two source identities describe the same tree. */
export function sameSourceIdentity(left, right) {
  return typeof left?.commit === 'string' && left.commit === right?.commit
    && left.changes !== undefined && left.changes === right?.changes;
}
