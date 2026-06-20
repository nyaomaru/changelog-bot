/** Structured representation of a single release bullet item. */
export type ReleaseItem = {
  /** Normalized title with conventional prefixes removed. */
  title: string;
  /** Original title before normalization, when available. */
  rawTitle?: string;
  /** GitHub username attributed to the change. */
  author?: string;
  /** Pull request number associated with the change. */
  pr?: number;
  /** Link to the pull request. */
  url?: string;
};

/** Additional sections surfaced from release notes. */
export type ReleaseSection = {
  /** Section heading text (e.g., "Breaking Changes"). */
  heading: string;
  /** Markdown body for the section. */
  body: string;
};

/** Aggregated release data parsed from GitHub notes. */
export type ParsedRelease = {
  /** Parsed "What's Changed" items. */
  items: ReleaseItem[];
  /** Full changelog URL when provided. */
  fullChangelog?: string;
  /** Extra sections beyond the primary item list. */
  sections?: ReleaseSection[];
};
