/**
 * Whether the frontmatter of a SKILL.md satisfies the open Agent Skills
 * constraints (agentskills.io): a name of 1-64 lowercase letters, digits and
 * hyphens, and a description of 1-1024 characters.
 *
 * @param {{name?: unknown, description?: unknown}|undefined} metadata Frontmatter values
 * @returns {boolean} true when both constraints hold
 */
export declare function isAgentSkillSpecValid(metadata: {
    name?: unknown;
    description?: unknown;
} | undefined): boolean;
//# sourceMappingURL=agentSkillSpec.d.ts.map