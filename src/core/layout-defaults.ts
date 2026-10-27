/** Shared physics defaults without loading the simulation engine. */
export const LINK_DISTANCE = 40;
// Owner tuning: repulsion was raised from -120 to -240 on 2026-09-17.
export const CHARGE_STRENGTH = -240;
/** Live physics and server settling share this equilibrium gravity. */
export const INCREMENTAL_GRAVITY = 0.12;
/** Cluster-centroid pull: compact without overpowering edge structure. */
export const CLUSTER_PULL_STRENGTH = 0.15;
