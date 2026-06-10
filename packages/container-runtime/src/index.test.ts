import { describe, it, expect } from 'vitest';
import { DEFAULT_PROFILE, dryRun } from './index';

describe('container-runtime', () => {
  it('rootless_network_none_profile_represented', () => {
    expect(DEFAULT_PROFILE.rootless).toBe(true);
    expect(DEFAULT_PROFILE.network).toBe('none');
    expect(DEFAULT_PROFILE.read_only_root).toBe(true);
    expect(DEFAULT_PROFILE.cap_drop).toContain('ALL');
    expect(DEFAULT_PROFILE.no_new_privileges).toBe(true);
    expect(DEFAULT_PROFILE.host_docker_socket).toBe(false);
  });

  it('dry_run_command_plan_generated', () => {
    const plan = dryRun('alpine:3', ['echo', 'hello']);
    expect(plan.command).toContain('docker run');
    expect(plan.command).toContain('alpine:3');
    expect(plan.args).toContain('alpine:3');
    expect(plan.args).toContain('echo');
    expect(plan.image).toBe('alpine:3');
    expect(plan.cmd).toEqual(['echo', 'hello']);
    // network=none applied from default profile
    expect(plan.command).toContain('--network none');
    // rootless applied
    expect(plan.command).toContain('--user nobody');
  });

  it('no_real_container_invoked', () => {
    const plan = dryRun('ubuntu:22.04', ['ls', '/']);
    // invoked is always false — this is a plan, not an execution
    expect(plan.invoked).toBe(false);
    // the plan is a plain data structure, no side effects
    expect(typeof plan.command).toBe('string');
    expect(Array.isArray(plan.args)).toBe(true);
  });
});
