export interface MinimalHarnessContract {
  contract_id: string;
  story_id: string;
  objective: string;
  allowed_write_set: string[];
  validation_commands: string[];
  promotion_allowed: boolean;
}

export function validateMinimalContract(c: MinimalHarnessContract): string[] {
  const errors: string[] = [];
  if (!c.contract_id) errors.push('missing contract_id');
  if (!c.story_id) errors.push('missing story_id');
  if (!c.objective) errors.push('missing objective');
  if (!c.allowed_write_set?.length) errors.push('missing allowed_write_set');
  return errors;
}
