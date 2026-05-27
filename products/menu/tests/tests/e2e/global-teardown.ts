import { closeTestDb } from '../../../src/shared/testing/e2e-db'

export default async function globalTeardown() {
  await closeTestDb()
}
