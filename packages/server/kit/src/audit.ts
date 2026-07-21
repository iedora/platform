// The audit emitter contract + the envelope mapping now live in @iedora/sdk/audit
// (the shared surface every producer uses to POST to the audit microservice).
// service-runtime re-exports them so services keep a single import surface;
// buildEnvelope maps an emitter event to the audit service's wire payload (target → entity;
// session/trace fold into metadata).
export {
  type AuditActor,
  type AuditEvent,
  type AuditOutcome,
  type Auditor,
  buildEnvelope,
} from "@iedora/sdk/audit";
