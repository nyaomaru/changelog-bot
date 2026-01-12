/**
 * Exit codes used by the CLI. Values align with common POSIX sysexits ranges
 * where practical, while maintaining semantic names for our domains.
 */
export const EXIT_USAGE = 64; // similar to EX_USAGE
export const EXIT_DATA = 65; // similar to EX_DATAERR
export const EXIT_LLM = 66; // domain-specific: LLM/provider failure
export const EXIT_VALIDATION = 67; // domain-specific: schema/validation failure
