/**
 * @codeharness/container-runtime
 *
 * Container profile model and dry-run plan generator. No real container is ever
 * invoked here — this package is schema-level only (v0). Actual container execution
 * is a later phase (needs orchestration + network grant). Profile spec:
 * codeharness/configs/container_profiles.yaml.
 */

export interface ContainerProfile {
  rootless: boolean;
  network: 'none' | 'host' | 'bridge';
  read_only_root: boolean;
  cap_drop: string[];
  no_new_privileges: boolean;
  host_docker_socket: boolean;
  cpus: number;
  memory: string;
  timeout_seconds: number;
}

/** Default profile: rootless, network=none, read-only root, all caps dropped. */
export const DEFAULT_PROFILE: ContainerProfile = {
  rootless: true,
  network: 'none',
  read_only_root: true,
  cap_drop: ['ALL'],
  no_new_privileges: true,
  host_docker_socket: false,
  cpus: 2,
  memory: '4g',
  timeout_seconds: 600,
};

export interface DryRunPlan {
  /** Full command string that WOULD be executed — never actually run here. */
  command: string;
  /** Parsed argument list (executable excluded). */
  args: string[];
  image: string;
  cmd: string[];
  profile: ContainerProfile;
  /** Always false — the dry-run never invokes a real container. */
  invoked: false;
}

/**
 * Build a container run plan without executing anything.
 * The returned plan describes what would be run; the caller decides whether to
 * actually execute it (behind the permission + workspace gates).
 */
export function dryRun(
  image: string,
  cmd: string[],
  profile?: Partial<ContainerProfile>,
): DryRunPlan {
  const p: ContainerProfile = { ...DEFAULT_PROFILE, ...profile };
  const args: string[] = ['run', '--rm'];

  if (p.rootless) args.push('--user', 'nobody');
  args.push('--network', p.network);
  if (p.read_only_root) args.push('--read-only');
  for (const cap of p.cap_drop) args.push('--cap-drop', cap);
  if (p.no_new_privileges) args.push('--security-opt', 'no-new-privileges');
  if (!p.host_docker_socket) args.push('--volume', '/var/run/docker.sock:/dev/null:ro');
  args.push('--cpus', String(p.cpus));
  args.push('--memory', p.memory);
  args.push(image, ...cmd);

  return {
    command: `docker ${args.join(' ')}`,
    args,
    image,
    cmd,
    profile: p,
    invoked: false,
  };
}
