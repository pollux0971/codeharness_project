export type AgentRole = 'planning_steward' | 'supervisor' | 'developer' | 'debugger';
export type IdeaMode = 'greenfield' | 'brownfield' | 'patch' | 'checkpoint' | 'research_spike';
export type PermissionDecision = 'allow' | 'ask' | 'deny';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export interface HarnessContract {
    contract_id: string;
    story_id: string;
    objective: string;
    mode: IdeaMode;
    allowed_write_set: string[];
    forbidden_paths: string[];
    validation_commands: string[];
    promotion_allowed: boolean;
}
