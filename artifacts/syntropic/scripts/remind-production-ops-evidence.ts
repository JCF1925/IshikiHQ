import {
  assessOperationsEvidence,
  type EvidenceStatus,
  type OperationsEvidence,
} from '../lib/operations-evidence.ts'
import {
  sendOperationsAlert,
} from '../lib/operations-alerting.ts'

const productionDate = process.env.OPS_EVIDENCE_CHECK_DATE
  ?? new Date().toISOString().slice(0, 10)

function required(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

function evidenceStatus(name: string): EvidenceStatus {
  const value = required(name)
  if (value !== 'pass' && value !== 'fail') {
    throw new Error(`${name} must be pass or fail`)
  }
  return value
}

function configuredEvidence(
  evidenceType: OperationsEvidence['evidenceType'],
  dateVariable: string,
  statusVariable: string,
  roleVariable: string,
): OperationsEvidence {
  return {
    evidenceType,
    evidenceDate: required(dateVariable),
    status: evidenceStatus(statusVariable),
    operationalRole: required(roleVariable),
  }
}

async function main() {
  if (process.env.OPS_ENVIRONMENT !== 'production') {
    throw new Error('OPS_ENVIRONMENT must be production')
  }
  if (process.env.OPS_ALERT_ENVIRONMENT !== 'production') {
    throw new Error('OPS_ALERT_ENVIRONMENT must be production')
  }
  if (!/^https:\/\/\S+$/.test(required('OPS_ALERT_WEBHOOK_URL'))) {
    throw new Error('OPS_ALERT_WEBHOOK_URL must be an HTTPS receiver URL')
  }
  required('OPS_ALERT_OWNER')

  const evidence = [
    configuredEvidence(
      'quarterly_restore',
      'OPS_RESTORE_EVIDENCE_DATE',
      'OPS_RESTORE_EVIDENCE_STATUS',
      'OPS_RESTORE_EVIDENCE_ROLE',
    ),
    configuredEvidence(
      'alert_acknowledgement',
      'OPS_ALERT_EVIDENCE_DATE',
      'OPS_ALERT_EVIDENCE_STATUS',
      'OPS_ALERT_EVIDENCE_ROLE',
    ),
  ]
  const assessments = evidence.map((record) => (
    assessOperationsEvidence(record, productionDate)
  ))
  const blockers = assessments.filter((assessment) => assessment.isReleaseBlocker)
  if (blockers.length > 0) {
    throw new Error(blockers.map((assessment) => assessment.blockerReason).join('; '))
  }

  const reminders = assessments.filter((assessment) => assessment.shouldRemind)
  for (const reminder of reminders) {
    await sendOperationsAlert(
      'evidence_expiry',
      `${reminder.evidenceType} evidence is due within the 14-day reminder window.`,
      undefined,
      {
        evidenceType: reminder.evidenceType,
        dueDate: reminder.dueDate,
        status: reminder.status,
        operationalRole: reminder.operationalRole,
      },
      { requireReceiver: true },
    )
  }

  if (reminders.length === 0) {
    console.log('No quarterly operations evidence is within the 14-day reminder window.')
  } else {
    console.log(`Sent ${reminders.length} privacy-safe quarterly evidence reminder(s).`)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Evidence reminder failed')
  process.exitCode = 1
})