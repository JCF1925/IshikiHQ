import { sendOperationsAlert } from '../lib/worker-alerting'

async function main() {
  await sendOperationsAlert(
    'synthetic',
    'Synthetic Syntropic operations alert; acknowledge this notification.',
    undefined,
    { drill: 'alert_receiver' },
    { requireReceiver: true },
  )
  console.log('Synthetic operations alert sent to the configured receiver.')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Synthetic alert failed')
  process.exitCode = 1
})