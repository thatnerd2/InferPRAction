import * as cp from 'child_process'
import fs from 'fs'
import {
  updateSarifWithFixes,
  SarifFileContents,
  scanSourceFiles,
  mockUpdateSarifWithFixes
} from '../src/client'
import {writePRReview} from '../src/pr_comment'
import * as path from 'path'
import {expect, test} from '@jest/globals'

require('dotenv').config()

test('gathers source files map', async () => {
  const sarif: SarifFileContents = JSON.parse(
    fs.readFileSync('__tests__/data/test.sarif').toString()
  )
  const sourceFilesMap = scanSourceFiles(sarif)
  expect(sourceFilesMap['__tests__/data/test.cs']).toEqual(
    'Console.WriteLn("test.cs");'
  )
  expect(sourceFilesMap['__tests__/data/test2.cs']).toEqual(
    'Console.WriteLn("test2.cs");'
  )
})

// test('calls deeppromptbugfix', async () => {
//   const sarif: SarifFileContents = JSON.parse(
//     fs.readFileSync('__tests__/data/CLEAR_TEXT_LOGGING.sarif').toString()
//   )
//   const sourceFilesMap = {
//     'CLEAR_TEXT_LOGGING.js': fs
//       .readFileSync('__tests__/data/CLEAR_TEXT_LOGGING.js')
//       .toString()
//   }
//   const result = await updateSarifWithFixes(sarif, sourceFilesMap)
//   expect(result).toBeDefined()
// }, 100000)

test('mocks deeppromptbugfix', async () => {
  const sarif: SarifFileContents = JSON.parse(
    fs.readFileSync('__tests__/data/CLEAR_TEXT_LOGGING.sarif').toString()
  )
  const sourceFilesMap = {
    'CLEAR_TEXT_LOGGING.js': fs
      .readFileSync('__tests__/data/CLEAR_TEXT_LOGGING.js')
      .toString()
  }
  const updatedSarif = await mockUpdateSarifWithFixes(sarif, sourceFilesMap)
  const targetResult = updatedSarif['runs'][0]['results'].filter(r =>
    r['ruleId'].endsWith('clear-text-logging')
  )[0]
  expect(updatedSarif).toBeDefined()
  expect(targetResult).toBeDefined()
  expect('fixes' in targetResult).toBe(true)
  expect(targetResult['fixes'][0]['description']['text']).toBe('MESSAGE HERE')
  fs.writeFileSync(
    '__tests__/data/CLEAR_TEXT_LOGGING.updated.sarif',
    JSON.stringify(updatedSarif, null, 2)
  )
})

test('writes comment on sample pr', async () => {
  // Add env vars in .env for GITHUB_REPOSITORY and GITHUB_EVENT_PATH
  const sarif_file_contents = JSON.parse(
    fs.readFileSync('__tests__/data/test_sarif_with_fix.sarif').toString()
  )
  expect(
    await writePRReview(sarif_file_contents, process.env.GITHUB_TOKEN || '')
  ).toBe(true)
})

// // shows how the runner will run a javascript action with env / stdout protocol
// test('test runs', () => {
//   process.env['SARIF_PATH'] = '__tests__/data/sample_report.sarif'
//   const np = process.execPath
//   const ip = path.join(__dirname, '..', 'lib', 'main.js')
//   const options: cp.ExecFileSyncOptions = {
//     env: process.env
//   }
//   console.log(cp.execFileSync(np, [ip], options).toString())
// })
