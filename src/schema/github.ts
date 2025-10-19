import { z } from 'zod';

// WHY: Validate GitHub API responses at runtime to guard against shape drift.

export const GitHubReleaseByTagSchema = z.object({
  body: z.string().optional(),
});

export const GitHubPRInfoSchema = z.object({
  user: z
    .object({
      login: z.string().optional(),
    })
    .optional(),
  html_url: z.string().optional(),
});

export const GitHubCommitPullsItemSchema = z.object({
  number: z.number(),
  title: z.string().optional(),
});

export const GitHubCommitPullsArraySchema = z.array(
  GitHubCommitPullsItemSchema
);

export type GitHubReleaseByTagParsed = z.infer<typeof GitHubReleaseByTagSchema>;
export type GitHubPRInfoParsed = z.infer<typeof GitHubPRInfoSchema>;
export type GitHubCommitPullsItemParsed = z.infer<
  typeof GitHubCommitPullsItemSchema
>;
